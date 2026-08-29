-- ============================================================
-- 우리집가계부 — Supabase 스키마 (한 번만 실행)
--
-- 사용법:
-- 1. supabase.com 에서 새 프로젝트를 만듭니다 (이 앱 전용, 다른 프로젝트와 분리 권장).
-- 2. 프로젝트 대시보드 > SQL Editor 에서 이 파일 전체를 붙여넣고 실행(Run)합니다.
-- 3. 프로젝트 Settings > API 에서 Project URL과 anon public key를 복사해
--    js/supabase-client.js 의 SUPABASE_URL / SUPABASE_ANON_KEY에 넣습니다.
-- 4. Authentication > Providers 에서 Email(비밀번호)이 켜져 있는지 확인합니다(기본 켜짐).
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- 테이블 ----------

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  color text,
  joined_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash','card','bank')),
  color text,
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('expense','income')),
  icon text not null,
  is_default boolean not null default false,
  sort_order int not null default 0
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  member_id uuid not null references members(id) on delete cascade,
  amount numeric not null check (amount > 0),
  type text not null check (type in ('expense','income')),
  memo text,
  date date not null default current_date,
  receipt_photo_url text,
  source text not null default 'manual' check (source in ('manual','paste','fixed')),
  fixed_expense_id uuid,
  created_at timestamptz not null default now()
);

create table fixed_expenses (
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

alter table transactions add constraint transactions_fixed_expense_id_fkey
  foreign key (fixed_expense_id) references fixed_expenses(id) on delete set null;

create table budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  year_month text not null, -- 'YYYY-MM' 형식
  limit_amount numeric not null default 0,
  unique (household_id, category_id, year_month)
);

-- ---------- RLS ----------

alter table households enable row level security;
alter table members enable row level security;
alter table accounts enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table budgets enable row level security;
alter table fixed_expenses enable row level security;

create or replace function is_household_member(hh_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from members
    where household_id = hh_id and user_id = auth.uid()
  );
$$;

create policy "select own households" on households
  for select using (is_household_member(id));
create policy "insert household" on households
  for insert with check (auth.uid() is not null);
create policy "update own household" on households
  for update using (is_household_member(id));

create policy "select members of my household" on members
  for select using (is_household_member(household_id));
create policy "insert my own membership" on members
  for insert with check (user_id = auth.uid());
-- 같은 가구 구성원이면 서로를 내보낼 수 있음(가구원 전부 동등권한 원칙, 기획서 3번).
-- 본인 탈퇴도 이 정책으로 커버됨(자기 자신도 같은 가구 구성원이므로).
create policy "delete member (any household member)" on members
  for delete using (is_household_member(household_id));

create policy "select accounts" on accounts for select using (is_household_member(household_id));
create policy "modify accounts" on accounts for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "select categories" on categories for select using (is_household_member(household_id));
create policy "modify categories" on categories for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "select transactions" on transactions for select using (is_household_member(household_id));
create policy "modify transactions" on transactions for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "select budgets" on budgets for select using (is_household_member(household_id));
create policy "modify budgets" on budgets for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

create policy "select fixed_expenses" on fixed_expenses for select using (is_household_member(household_id));
create policy "modify fixed_expenses" on fixed_expenses for all
  using (is_household_member(household_id)) with check (is_household_member(household_id));

-- ---------- RPC (초대코드 발급/가구 생성·참여는 RLS를 우회해야 해서 함수로 처리) ----------

create or replace function create_household(p_name text, p_nickname text)
returns households
language plpgsql
security definer
as $$
declare
  v_household households;
  v_code text;
begin
  loop
    v_code := lpad(floor(random()*1000000)::text, 6, '0');
    exit when not exists (select 1 from households where invite_code = v_code);
  end loop;

  insert into households (name, invite_code) values (p_name, v_code) returning * into v_household;
  insert into members (household_id, user_id, nickname) values (v_household.id, auth.uid(), p_nickname);

  -- 기본 카테고리 시드 (기획서 4-1)
  insert into categories (household_id, name, type, icon, is_default, sort_order) values
    (v_household.id, '식비/장보기', 'expense', '🍚', true, 1),
    (v_household.id, '외식/카페', 'expense', '🍽️', true, 2),
    (v_household.id, '교통/차량', 'expense', '🚌', true, 3),
    (v_household.id, '주거/공과금', 'expense', '🏠', true, 4),
    (v_household.id, '통신비', 'expense', '📱', true, 5),
    (v_household.id, '쇼핑/미용', 'expense', '🛍️', true, 6),
    (v_household.id, '의료/건강', 'expense', '🏥', true, 7),
    (v_household.id, '보험', 'expense', '🛡️', true, 8),
    (v_household.id, '문화/여가', 'expense', '🎬', true, 9),
    (v_household.id, '육아/교육', 'expense', '👶', true, 10),
    (v_household.id, '경조사/선물', 'expense', '🎁', true, 11),
    (v_household.id, '시댁용돈', 'expense', '🧧', true, 12),
    (v_household.id, '친정용돈', 'expense', '🧧', true, 13),
    (v_household.id, '남편용돈', 'expense', '🧧', true, 14),
    (v_household.id, '아내용돈', 'expense', '🧧', true, 15),
    (v_household.id, '자녀용돈', 'expense', '🧧', true, 16),
    (v_household.id, '저축/예금/투자', 'expense', '💰', true, 17),
    (v_household.id, '기타', 'expense', '🗂️', true, 18),
    (v_household.id, '급여', 'income', '💵', true, 1),
    (v_household.id, '부수입/용돈', 'income', '💼', true, 2),
    (v_household.id, '이자/투자수익', 'income', '📈', true, 3),
    (v_household.id, '기타수입', 'income', '🗂️', true, 4);

  insert into accounts (household_id, name, type) values
    (v_household.id, '현금', 'cash');

  return v_household;
end;
$$;

create or replace function join_household(p_code text, p_nickname text)
returns households
language plpgsql
security definer
as $$
declare
  v_household households;
begin
  select * into v_household from households where invite_code = p_code;
  if v_household.id is null then
    raise exception '초대코드를 찾을 수 없어요';
  end if;

  insert into members (household_id, user_id, nickname)
  values (v_household.id, auth.uid(), p_nickname)
  on conflict (household_id, user_id) do update set nickname = excluded.nickname;

  return v_household;
end;
$$;

create or replace function reissue_invite_code(p_household_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_code text;
begin
  if not is_household_member(p_household_id) then
    raise exception '권한이 없어요';
  end if;
  loop
    v_code := lpad(floor(random()*1000000)::text, 6, '0');
    exit when not exists (select 1 from households where invite_code = v_code);
  end loop;
  update households set invite_code = v_code where id = p_household_id;
  return v_code;
end;
$$;

grant execute on function is_household_member(uuid) to authenticated;
grant execute on function create_household(text, text) to authenticated;
grant execute on function join_household(text, text) to authenticated;
grant execute on function reissue_invite_code(uuid) to authenticated;
