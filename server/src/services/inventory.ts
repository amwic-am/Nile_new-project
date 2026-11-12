import type { Sql } from '../db/index.js';
import { conflict, unprocessable } from '../lib/errors.js';

export interface StockLine {
  variantId: string;
  quantity: number;
  label: string;
}

type InventoryRow = { quantity: number; reserved: number };

async function aggregateOrderLines(tx: Sql, orderId: string): Promise<StockLine[]> {
  const result = await tx.query<{ variant_id: string; quantity: number; label: string }>(
    `select oi.variant_id, sum(oi.quantity)::int as quantity,
            min(oi.product_name) as label
       from order_items oi
      where oi.order_id = $1 and oi.variant_id is not null
      group by oi.variant_id`,
    [orderId],
  );
  return result.rows.map((row) => ({
    variantId: row.variant_id,
    quantity: Number(row.quantity),
    label: row.label,
  }));
}

async function lockInventory(tx: Sql, variantId: string): Promise<InventoryRow> {
  const result = await tx.query<InventoryRow>(
    'select quantity, reserved from inventory where variant_id = $1 for update',
    [variantId],
  );
  if (!result.rows[0]) throw conflict('Inventory record is missing for this variant');
  return { quantity: Number(result.rows[0].quantity), reserved: Number(result.rows[0].reserved) };
}

/**
 * Holds stock for an order without removing it from on-hand quantity.
 * Availability is always `quantity - reserved`.
 */
export async function reserveStock(
  tx: Sql,
  orderId: string,
  lines: StockLine[],
  createdBy?: string | null,
): Promise<void> {
  for (const line of lines) {
    const inventory = await lockInventory(tx, line.variantId);
    const available = inventory.quantity - inventory.reserved;
    if (available < line.quantity) {
      throw unprocessable(
        `Only ${Math.max(available, 0)} left of ${line.label}. Please update your cart.`,
      );
    }
    await tx.query(
      'update inventory set reserved = reserved + $2, updated_at = now() where variant_id = $1',
      [line.variantId, line.quantity],
    );
    await tx.query(
      `insert into inventory_movements
         (variant_id, delta, reason, reference_type, reference_id, note, balance_after, created_by)
       values ($1, 0, 'reservation', 'order', $2, $3, $4, $5)`,
      [
        line.variantId,
        orderId,
        `Reserved ${line.quantity} for order`,
        inventory.quantity,
        createdBy ?? null,
      ],
    );
  }
}

export async function hasSaleMovement(tx: Sql, orderId: string): Promise<boolean> {
  const result = await tx.query<{ exists: boolean }>(
    `select exists (
       select 1 from inventory_movements
        where reference_type = 'order' and reference_id = $1 and reason = 'sale'
     ) as exists`,
    [orderId],
  );
  return Boolean(result.rows[0]?.exists);
}

/**
 * Converts a reservation into a sale: removes on-hand stock exactly once per
 * order and records the movement plus lifetime product sales counts.
 */
export async function commitOrderStock(
  tx: Sql,
  orderId: string,
  createdBy?: string | null,
): Promise<boolean> {
  if (await hasSaleMovement(tx, orderId)) return false;
  const lines = await aggregateOrderLines(tx, orderId);
  for (const line of lines) {
    const inventory = await lockInventory(tx, line.variantId);
    if (inventory.quantity < line.quantity) {
      throw conflict(`Stock for ${line.label} is no longer sufficient to fulfil this order`);
    }
    const nextQuantity = inventory.quantity - line.quantity;
    const nextReserved = Math.max(0, inventory.reserved - line.quantity);
    await tx.query(
      `update inventory
          set quantity = $2, reserved = $3, updated_at = now()
        where variant_id = $1`,
      [line.variantId, nextQuantity, nextReserved],
    );
    await tx.query(
      `insert into inventory_movements
         (variant_id, delta, reason, reference_type, reference_id, note, balance_after, created_by)
       values ($1, $2, 'sale', 'order', $3, $4, $5, $6)`,
      [
        line.variantId,
        -line.quantity,
        orderId,
        `Sold ${line.quantity} on order`,
        nextQuantity,
        createdBy ?? null,
      ],
    );
  }

  await tx.query(
    `update products p
        set sold_count = p.sold_count + totals.quantity, updated_at = now()
       from (
         select product_id, sum(quantity)::int as quantity
           from order_items
          where order_id = $1 and product_id is not null
          group by product_id
       ) totals
      where p.id = totals.product_id`,
    [orderId],
  );
  return true;
}

/**
 * Returns reserved stock to the available pool. Does nothing once a sale has
 * been committed for the order.
 */
export async function releaseOrderStock(
  tx: Sql,
  orderId: string,
  createdBy?: string | null,
): Promise<boolean> {
  if (await hasSaleMovement(tx, orderId)) return false;
  const released = await tx.query<{ exists: boolean }>(
    `select exists (
       select 1 from inventory_movements
        where reference_type = 'order' and reference_id = $1 and reason = 'release'
     ) as exists`,
    [orderId],
  );
  if (released.rows[0]?.exists) return false;

  const lines = await aggregateOrderLines(tx, orderId);
  for (const line of lines) {
    const inventory = await lockInventory(tx, line.variantId);
    const nextReserved = Math.max(0, inventory.reserved - line.quantity);
    await tx.query(
      'update inventory set reserved = $2, updated_at = now() where variant_id = $1',
      [line.variantId, nextReserved],
    );
    await tx.query(
      `insert into inventory_movements
         (variant_id, delta, reason, reference_type, reference_id, note, balance_after, created_by)
       values ($1, 0, 'release', 'order', $2, $3, $4, $5)`,
      [
        line.variantId,
        orderId,
        `Released ${line.quantity} reserved units`,
        inventory.quantity,
        createdBy ?? null,
      ],
    );
  }
  return true;
}

export async function adjustStock(
  tx: Sql,
  input: {
    variantId: string;
    delta: number;
    reason: 'restock' | 'adjustment' | 'return' | 'damage' | 'import';
    note?: string;
    createdBy?: string | null;
    referenceType?: string;
    referenceId?: string;
  },
): Promise<number> {
  const inventory = await lockInventory(tx, input.variantId);
  const nextQuantity = inventory.quantity + input.delta;
  if (nextQuantity < inventory.reserved || nextQuantity < 0) {
    throw unprocessable('The adjustment would leave less stock than is reserved for open orders');
  }
  await tx.query(
    'update inventory set quantity = $2, updated_at = now() where variant_id = $1',
    [input.variantId, nextQuantity],
  );
  await tx.query(
    `insert into inventory_movements
       (variant_id, delta, reason, reference_type, reference_id, note, balance_after, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.variantId,
      input.delta,
      input.reason,
      input.referenceType ?? null,
      input.referenceId ?? null,
      input.note ?? null,
      nextQuantity,
      input.createdBy ?? null,
    ],
  );
  return nextQuantity;
}
