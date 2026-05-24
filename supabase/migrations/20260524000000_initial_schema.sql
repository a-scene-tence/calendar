-- 개인 대시보드 / 가계부 공유 스키마 (spec.md §4)
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣기, 또는 `npx supabase db push`

-- 계정/지갑
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text,
  created_at timestamptz default now()
);

-- 카테고리
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income', 'expense'))
);

-- 거래
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric(14, 2) not null,
  currency text default 'KRW',
  occurred_at timestamptz not null,
  memo text,
  created_at timestamptz default now()
);

-- 대시보드 월별 요약 조회 가속
create index if not exists idx_transactions_user_occurred
  on transactions (user_id, occurred_at desc);

-- Row Level Security: 본인 데이터만 접근 (누락 시 전체 노출 위험)
alter table accounts enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;

create policy "own accounts" on accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own categories" on categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own transactions" on transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
