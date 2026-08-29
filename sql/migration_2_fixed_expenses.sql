-- ============================================================
-- 고정지출 관리 기능 추가 (2026-08-30)
-- 이미 sql/schema.sql을 실행해서 운영 중인 프로젝트는 이 파일만 SQL Editor에서
-- 추가로 한 번 실행하면 됩니다. (새로 만드는 프로젝트는 schema.sql에 이미 포함되어 있어
-- 이 파일을 따로 실행할 필요 없습니다.)
-- ============================================================

create table if not exists fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  account_id uuid references accounts(id) on delete set null,
  name text not null,
  amount numeric not null check (amount > 0),
  day_of_month int not null check (day_of_month between 1 and 28),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table transactions add column if not exists fixed_expense_id uuid references fixed_expenses(id) on delete set null;

alter table transactions drop constraint if exists transactions_source_check;
alter table transactions add constraint transactions_source_check check (source in ('manual','paste','fixed'));

alter table fixed_expenses enable row level security;

drop policy if exists "select fixed_expenses" on fixed_expenses;
create policy "select fixed_expenses" on fixed_expenses for select using (is_household_member(household_id));

drop policy if exists "modify fixed_expenses" on fixed_expenses;
create policy "modify fixed_expenses" on fixed_expenses for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));
