-- GoMove · schema inicial para Supabase/PostgreSQL
-- Execute no SQL Editor de um projeto novo. O frontend atual usa os mesmos nomes
-- de entidades e poderá migrar da camada demo sem alterar os fluxos de tela.

create extension if not exists pgcrypto;

create type public.user_role as enum ('ADMIN_MASTER', 'ASSOCIATE');
create type public.user_status as enum ('ACTIVE', 'PENDING', 'BLOCKED');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  username text not null unique check (username ~ '^[a-z0-9_]{3,40}$'),
  email text not null unique,
  phone text,
  role public.user_role not null default 'ASSOCIATE',
  status public.user_status not null default 'PENDING',
  sponsor_id uuid references public.profiles(id) on delete set null,
  invite_code text not null unique,
  country text default 'Brasil',
  two_factor_login boolean not null default false,
  two_factor_withdraw boolean not null default false,
  pix_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profile_cannot_sponsor_itself check (sponsor_id is null or sponsor_id <> id)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid references public.profiles(id) on delete set null,
  plate text unique,
  model text not null,
  category text not null,
  location text,
  battery smallint not null default 0 check (battery between 0 and 100),
  status text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.investments (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  pack text not null, amount numeric(14,2) not null check (amount >= 0),
  profit numeric(14,2) not null default 0, contract_days integer not null default 0 check (contract_days >= 0),
  status text not null default 'Pendente', contracted_at date not null default current_date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.orders (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  description text not null, quantity integer not null default 1 check (quantity > 0),
  total numeric(14,2) not null check (total >= 0), status text not null default 'Processando',
  ordered_at date not null default current_date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  description text not null, amount numeric(14,2) not null check (amount >= 0),
  remaining numeric(14,2) not null default 0 check (remaining >= 0), due_date date not null,
  status text not null default 'Pendente', paid_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete restrict,
  description text not null, amount numeric(14,2) not null, type text not null,
  occurred_at timestamptz not null default now(), metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0), method text not null, account text not null,
  status text not null default 'Pendente', requested_at timestamptz not null default now(), paid_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  subject text not null, message text, department text not null, category text,
  priority text not null default 'Média', status text not null default 'Aberto',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), resolved_at timestamptz, deleted_at timestamptz
);

create table public.commission_rules (
  id uuid primary key default gen_random_uuid(), name text not null,
  event_type text not null default 'INVESTMENT_CONFIRMED', levels jsonb not null,
  active boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.bonus_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete restrict,
  investment_id uuid references public.investments(id) on delete set null,
  amount_cents bigint not null, status text not null default 'PENDING', type text not null,
  level integer, reason text, reversal_of_id uuid references public.bonus_entries(id) on delete restrict,
  idempotency_key text unique, created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null,
  action text not null, target_type text not null, target_id text not null,
  old_values jsonb, new_values jsonb, metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index profiles_sponsor_idx on public.profiles(sponsor_id) where deleted_at is null;
create index profiles_status_idx on public.profiles(status) where deleted_at is null;
create index vehicles_user_status_idx on public.vehicles(user_id, status) where deleted_at is null;
create index investments_user_date_idx on public.investments(user_id, contracted_at desc) where deleted_at is null;
create index orders_user_date_idx on public.orders(user_id, ordered_at desc) where deleted_at is null;
create index invoices_user_status_idx on public.invoices(user_id, status, due_date) where deleted_at is null;
create index transactions_user_date_idx on public.transactions(user_id, occurred_at desc) where deleted_at is null;
create index withdrawals_user_status_idx on public.withdrawals(user_id, status) where deleted_at is null;
create index tickets_user_status_idx on public.tickets(user_id, status, created_at desc) where deleted_at is null;
create index bonuses_user_status_idx on public.bonus_entries(user_id, status, created_at desc);
create index audit_target_idx on public.audit_logs(target_type, target_id, created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare table_name text; begin
  foreach table_name in array array['profiles','vehicles','investments','orders','invoices','withdrawals','tickets','commission_rules'] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

create or replace function public.is_master() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'ADMIN_MASTER' and status = 'ACTIVE' and deleted_at is null)
$$;

create or replace function public.protect_profile_admin_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_master() and (
    new.role is distinct from old.role or new.status is distinct from old.status or
    new.sponsor_id is distinct from old.sponsor_id or new.invite_code is distinct from old.invite_code or
    new.deleted_at is distinct from old.deleted_at
  ) then raise exception 'Campos administrativos só podem ser alterados pelo MASTER'; end if;
  return new;
end $$;

create trigger profiles_protect_admin_fields before update on public.profiles
for each row execute function public.protect_profile_admin_fields();

-- Cria o perfil mínimo de novos usuários do Supabase Auth. A ativação e o
-- patrocinador continuam sob controle do MASTER/Edge Function.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare generated_username text;
begin
  generated_username := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g'));
  if length(generated_username) < 3 or exists(select 1 from public.profiles where username = generated_username) then
    generated_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  insert into public.profiles(id, name, username, email, invite_code)
  values(new.id, coalesce(new.raw_user_meta_data->>'name', generated_username), generated_username, new.email, generated_username || substr(replace(new.id::text, '-', ''), 1, 4));
  return new;
end $$;

create trigger auth_user_created after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.investments enable row level security;
alter table public.orders enable row level security;
alter table public.invoices enable row level security;
alter table public.transactions enable row level security;
alter table public.withdrawals enable row level security;
alter table public.tickets enable row level security;
alter table public.commission_rules enable row level security;
alter table public.bonus_entries enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_master());
create policy profiles_self_update on public.profiles for update using (id = auth.uid() or public.is_master()) with check (id = auth.uid() or public.is_master());
create policy profiles_master_all on public.profiles for all using (public.is_master()) with check (public.is_master());

do $$ declare table_name text; begin
  foreach table_name in array array['vehicles','investments','orders','invoices','transactions','withdrawals','tickets','bonus_entries'] loop
    execute format('create policy %I_owner_read on public.%I for select using (user_id = auth.uid() or public.is_master())', table_name, table_name);
    execute format('create policy %I_master_all on public.%I for all using (public.is_master()) with check (public.is_master())', table_name, table_name);
  end loop;
end $$;

create policy tickets_owner_create on public.tickets for insert with check (user_id = auth.uid());
create policy withdrawals_owner_create on public.withdrawals for insert with check (user_id = auth.uid());
create policy investments_owner_create on public.investments for insert with check (user_id = auth.uid());
create policy orders_owner_create on public.orders for insert with check (user_id = auth.uid());
create policy commission_rules_master on public.commission_rules for all using (public.is_master()) with check (public.is_master());
create policy audit_master_read on public.audit_logs for select using (public.is_master());
create policy audit_master_insert on public.audit_logs for insert with check (public.is_master());
