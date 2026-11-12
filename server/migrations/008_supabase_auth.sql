-- ---------------------------------------------------------------------------
-- Supabase Auth integration
-- Profiles are keyed by the Supabase auth.users id. Password hashes and email
-- tokens move to GoTrue; auth_credentials/auth_tokens remain only for the
-- local development/test provider.
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists email_verified_at timestamptz;

update profiles p
   set email_verified_at = c.email_verified_at
  from auth_credentials c
 where c.profile_id = p.id
   and p.email_verified_at is null
   and c.email_verified_at is not null;

-- Some managed providers create an empty `auth` schema of their own, so the
-- schema name alone is not enough: only link to Supabase when auth.users exists.
do $$
begin
  if to_regclass('auth.users') is not null
     and not exists (select 1 from pg_constraint where conname = 'profiles_id_auth_fkey') then
    alter table profiles
      add constraint profiles_id_auth_fkey
      foreign key (id) references auth.users(id) on delete cascade not valid;
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, full_name, phone, email_verified_at, marketing_opt_in
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    new.email_confirmed_at,
    coalesce((new.raw_user_meta_data ->> 'marketing_opt_in')::boolean, false)
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        phone = coalesce(excluded.phone, public.profiles.phone),
        email_verified_at = coalesce(excluded.email_verified_at, public.profiles.email_verified_at),
        updated_at = now();

  insert into public.user_roles (profile_id, role_key)
  values (new.id, 'customer')
  on conflict do nothing;

  return new;
end;
$$;

do $$
begin
  if to_regclass('auth.users') is not null then
    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created
      after insert or update of email, email_confirmed_at, raw_user_meta_data on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;
