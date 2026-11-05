create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text,
  marketing_opt_in boolean not null default false,
  marketing_opt_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_consent_timestamp check (
    (marketing_opt_in and marketing_opt_in_at is not null)
    or (not marketing_opt_in and marketing_opt_in_at is null)
  )
);

create table public.pools (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  label text not null,
  address text not null,
  pool_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  pool_id uuid references public.pools (id) on delete set null,
  service_type text not null check (service_type in ('pis', 'jac', 'lim', 'agua')),
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'completed', 'cancelled')),
  visit_date date,
  time_preference text,
  details jsonb not null default '{}'::jsonb,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint visit_date_required_for_maintenance check (
    service_type not in ('lim', 'agua') or visit_date is not null
  )
);

create index pools_user_id_idx on public.pools (user_id);
create index service_requests_user_created_idx on public.service_requests (user_id, created_at desc);
create index service_requests_visit_reminder_idx on public.service_requests (visit_date)
  where visit_date is not null and reminder_sent_at is null;

alter table public.profiles enable row level security;
alter table public.pools enable row level security;
alter table public.service_requests enable row level security;

create policy "Users can read their profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can manage their pools"
  on public.pools for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can read their service history"
  on public.service_requests for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their service requests"
  on public.service_requests for insert to authenticated
  with check ((select auth.uid()) = user_id);

create or replace function public.check_service_pool_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pool_id is not null and not exists (
    select 1 from public.pools where id = new.pool_id and user_id = new.user_id
  ) then
    raise exception 'Pool does not belong to this user';
  end if;
  return new;
end;
$$;

create trigger service_requests_check_pool_owner
  before insert or update of pool_id, user_id on public.service_requests
  for each row execute procedure public.check_service_pool_owner();

revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, marketing_opt_in, marketing_opt_in_at) on public.profiles to authenticated;
grant select, insert, update, delete on public.pools to authenticated;
grant select, insert on public.service_requests to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end,
        updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger pools_set_updated_at
  before update on public.pools
  for each row execute procedure public.set_updated_at();