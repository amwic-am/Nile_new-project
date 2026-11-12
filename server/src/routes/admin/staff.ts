import { Router } from 'express';
import { z } from 'zod';
import { getDatabase, isUniqueViolation, type Sql } from '../../db/index.js';
import { requirePerm } from '../../lib/auth.js';
import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { asyncRoute, withUserDb } from '../../lib/request.js';
import { pageParams, parse } from '../../lib/validation.js';
import { paginationMeta, recordAudit } from './shared.js';

const router = Router();

const uuidSchema = z.string().uuid('Choose a valid staff member');
const roleKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9_]+$/, 'Choose a valid role');

const listQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['all', 'active', 'suspended']).optional().default('all'),
});

const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Password is too long')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().min(5).max(254).email('Enter a valid email address'),
  password: passwordSchema,
  phone: z.string().trim().min(7).max(30).optional().or(z.literal('')),
  roles: z.array(roleKeySchema).min(1, 'Choose at least one role').max(8),
});

const updateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(160).optional(),
    phone: z.string().trim().min(7).max(30).optional().or(z.literal('')),
    status: z.enum(['active', 'suspended']).optional(),
    roles: z.array(roleKeySchema).min(1, 'Choose at least one role').max(8).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');

const resetPasswordSchema = z.object({ password: passwordSchema });

type StaffRow = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  created_at: Date;
  last_login_at: Date | null;
  roles: unknown;
};

const staffSelect = `
  select p.id, p.email, p.full_name, p.phone, p.status, p.created_at, p.last_login_at,
         coalesce(
           (select json_agg(ur.role_key order by ur.role_key)
              from user_roles ur where ur.profile_id = p.id),
           '[]'::json
         ) as roles
    from profiles p
   where exists (
     select 1 from user_roles ur
       join roles r on r.key = ur.role_key
      where ur.profile_id = p.id and r.is_staff
   )`;

function roleList(roles: unknown): string[] {
  return Array.isArray(roles) ? roles.map((role) => String(role)) : [];
}

function isSuperAdmin(req: { auth?: { roles: string[] } }): boolean {
  return Boolean(req.auth?.roles.includes('super_admin'));
}

async function assertStaffRoles(db: Sql, roles: string[]) {
  const result = await db.query('select key, is_staff from roles where key = any($1::text[])', [roles]);
  const found = new Map(result.rows.map((row) => [row.key, row.is_staff]));
  const invalid = roles.filter((role) => !found.get(role));
  if (invalid.length) {
    throw unprocessable(`These roles cannot be assigned to staff: ${invalid.join(', ')}.`);
  }
}

async function otherActiveSuperAdmins(db: Sql, profileId: string) {
  const result = await db.query(
    `select count(*)::int as total
       from user_roles ur
       join profiles p on p.id = ur.profile_id
      where ur.role_key = 'super_admin' and p.status = 'active' and p.id <> $1`,
    [profileId],
  );
  return Number(result.rows[0]?.total ?? 0);
}

router.get(
  '/staff/roles',
  requirePerm('staff.read'),
  asyncRoute(async (req, res) => {
    const roles = await withUserDb(req, async (db) => {
      const list = await db.query<{
        key: string;
        name: string;
        description: string;
        is_staff: boolean;
      }>('select key, name, description, is_staff from roles order by is_staff desc, name');
      const permissions = await db.query<{ role_key: string; permission_key: string }>(
        'select role_key, permission_key from role_permissions order by role_key, permission_key',
      );
      const grouped = new Map<string, string[]>();
      for (const entry of permissions.rows) {
        const current = grouped.get(entry.role_key) ?? [];
        current.push(entry.permission_key);
        grouped.set(entry.role_key, current);
      }
      return list.rows.map((role) => ({
        key: role.key,
        name: role.name,
        description: role.description,
        isStaff: role.is_staff,
        permissions: grouped.get(role.key) ?? [],
      }));
    });
    res.json({ roles });
  }),
);

router.get(
  '/staff',
  requirePerm('staff.read'),
  asyncRoute(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query, { page: 1, pageSize: 25 });
    const filters = parse(listQuerySchema, req.query);
    const search = filters.q ? `%${filters.q}%` : null;

    const data = await withUserDb(req, async (db) => {
      const count = await db.query<{ total: number }>(
        `select count(*)::int as total from (${staffSelect}) s
          where ($1::text = 'all' or s.status = $1)
            and ($2::text is null or s.email ilike $2 or s.full_name ilike $2)`,
        [filters.status, search],
      );
      const rows = await db.query<StaffRow>(
        `select * from (${staffSelect}) s
          where ($1::text = 'all' or s.status = $1)
            and ($2::text is null or s.email ilike $2 or s.full_name ilike $2)
          order by s.full_name
          limit $3 offset $4`,
        [filters.status, search, pageSize, offset],
      );
      return { total: Number(count.rows[0]?.total ?? 0), rows: rows.rows };
    });

    res.json({
      staff: data.rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        phone: row.phone,
        status: row.status,
        roles: roleList(row.roles),
        createdAt: new Date(row.created_at).toISOString(),
        lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
      })),
      pagination: paginationMeta(page, pageSize, data.total),
    });
  }),
);

router.get(
  '/staff/:id',
  requirePerm('staff.read'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const data = await withUserDb(req, async (db) => {
      const profile = await db.query<StaffRow>(`${staffSelect} and p.id = $1 limit 1`, [id]);
      const row = profile.rows[0];
      if (!row) throw notFound('Staff member not found');
      const roles = roleList(row.roles);
      const permissions = await db.query<{ permission_key: string }>(
        `select distinct rp.permission_key
           from user_roles ur
           join role_permissions rp on rp.role_key = ur.role_key
          where ur.profile_id = $1
          order by rp.permission_key`,
        [id],
      );
      return {
        row,
        roles,
        permissions: permissions.rows.map((entry) => entry.permission_key),
      };
    });

    res.json({
      staff: {
        id: data.row.id,
        email: data.row.email,
        fullName: data.row.full_name,
        phone: data.row.phone,
        status: data.row.status,
        roles: data.roles,
        permissions: data.permissions,
        isSelf: data.row.id === req.auth?.id,
        createdAt: new Date(data.row.created_at).toISOString(),
        lastLoginAt: data.row.last_login_at ? new Date(data.row.last_login_at).toISOString() : null,
      },
    });
  }),
);

router.post(
  '/staff',
  requirePerm('staff.write'),
  asyncRoute(async (req, res) => {
    const input = parse(createSchema, req.body);
    const roles = [...new Set(input.roles)];
    if (roles.includes('super_admin') && !isSuperAdmin(req)) {
      throw forbidden('Only a super administrator can assign the super administrator role.');
    }

    const db = await getDatabase();
    const email = input.email.toLowerCase();
    if (await db.query('select 1 from profiles where lower(email) = $1 limit 1', [email]).then((r) => r.rows.length > 0)) {
      throw conflict('An account with that email address already exists.');
    }
    await assertStaffRoles(db, roles);

    const passwordHash = await hashPassword(input.password);
    let profileId = '';
    try {
      profileId = await db.transaction(async (tx) => {
        const inserted = await tx.query<{ id: string }>(
          `insert into profiles (email, full_name, phone, status)
           values ($1, $2, $3, 'active')
           returning id`,
          [email, input.fullName, input.phone || null],
        );
        const id = inserted.rows[0].id;
        await tx.query(
          'insert into auth_credentials (profile_id, password_hash, email_verified_at) values ($1, $2, now())',
          [id, passwordHash],
        );
        for (const role of roles) {
          await tx.query('insert into user_roles (profile_id, role_key) values ($1, $2)', [id, role]);
        }
        return id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('An account with that email address already exists.');
      throw error;
    }

    await recordAudit(req, {
      action: 'staff.created',
      entityType: 'staff',
      entityId: profileId,
      after: { email, fullName: input.fullName, roles, status: 'active' },
    });

    res.status(201).json({
      staff: {
        id: profileId,
        email,
        fullName: input.fullName,
        phone: input.phone || null,
        status: 'active',
        roles,
      },
    });
  }),
);

router.patch(
  '/staff/:id',
  requirePerm('staff.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const input = parse(updateSchema, req.body);
    const roles = input.roles ? [...new Set(input.roles)] : null;

    const before = await withUserDb(req, async (db) => {
      const existing = await db.query<StaffRow>(`${staffSelect} and p.id = $1 limit 1`, [id]);
      const row = existing.rows[0];
      if (!row) throw notFound('Staff member not found');
      const currentRoles = roleList(row.roles);
      const nextRoles = roles ?? currentRoles;
      const targetIsSuper = currentRoles.includes('super_admin');
      const nextIsSuper = nextRoles.includes('super_admin');

      if (id === req.auth?.id && input.status === 'suspended') {
        throw forbidden('You cannot suspend your own account.');
      }
      if (id === req.auth?.id && targetIsSuper && !nextIsSuper) {
        throw forbidden('You cannot remove your own super administrator role.');
      }
      if ((targetIsSuper !== nextIsSuper) && !isSuperAdmin(req)) {
        throw forbidden('Only a super administrator can grant or revoke that role.');
      }
      if (targetIsSuper && (!nextIsSuper || input.status === 'suspended')) {
        const remaining = await otherActiveSuperAdmins(db, id);
        if (remaining === 0) {
          throw unprocessable('At least one active super administrator must remain.');
        }
      }
      if (roles) await assertStaffRoles(db, roles);

      await db.query(
        `update profiles set
           full_name = coalesce($2, full_name),
           phone = case when $3::boolean then nullif($4, '') else phone end,
           status = coalesce($5, status),
           updated_at = now()
         where id = $1`,
        [
          id,
          input.fullName ?? null,
          input.phone !== undefined,
          input.phone ?? null,
          input.status ?? null,
        ],
      );

      if (roles) {
        const removed = currentRoles.filter((role) => !nextRoles.includes(role));
        const added = nextRoles.filter((role) => !currentRoles.includes(role));
        for (const role of removed) {
          await db.query('delete from user_roles where profile_id = $1 and role_key = $2', [id, role]);
        }
        for (const role of added) {
          await db.query('insert into user_roles (profile_id, role_key) values ($1, $2)', [id, role]);
        }
      }

      const after = await db.query<{ full_name: string; phone: string | null; status: string }>(
        'select full_name, phone, status from profiles where id = $1',
        [id],
      );
      return {
        email: row.email,
        before: { fullName: row.full_name, phone: row.phone, status: row.status, roles: currentRoles },
        after: {
          fullName: after.rows[0]?.full_name,
          phone: after.rows[0]?.phone,
          status: after.rows[0]?.status,
          roles: nextRoles,
        },
      };
    });

    if (input.status === 'suspended') {
      const db = await getDatabase();
      await db.query(
        'update sessions set revoked_at = now() where profile_id = $1 and revoked_at is null',
        [id],
      );
    }

    await recordAudit(req, {
      action: 'staff.updated',
      entityType: 'staff',
      entityId: id,
      before: before.before,
      after: before.after,
    });

    res.json({ updated: true, staff: { id, email: before.email, ...before.after } });
  }),
);

router.post(
  '/staff/:id/password',
  requirePerm('staff.write'),
  asyncRoute(async (req, res) => {
    const id = parse(uuidSchema, req.params.id);
    const input = parse(resetPasswordSchema, req.body);
    const db = await getDatabase();

    const target = await db.query<{ email: string }>(
      `select p.email from profiles p
        where p.id = $1
          and exists (select 1 from user_roles ur join roles r on r.key = ur.role_key
                       where ur.profile_id = p.id and r.is_staff)
        limit 1`,
      [id],
    );
    if (!target.rows[0]) throw notFound('Staff member not found');

    const passwordHash = await hashPassword(input.password);
    await db.transaction(async (tx) => {
      await tx.query(
        'update auth_credentials set password_hash = $2, password_changed_at = now(), failed_attempts = 0, locked_until = null where profile_id = $1',
        [id, passwordHash],
      );
      await tx.query('update sessions set revoked_at = now() where profile_id = $1 and revoked_at is null', [id]);
    });

    await recordAudit(req, {
      action: 'staff.password_reset',
      entityType: 'staff',
      entityId: id,
      after: { email: target.rows[0].email },
    });

    res.json({ updated: true, sessionsRevoked: true });
  }),
);

export default router;
