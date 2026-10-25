-- Chạy một lần trong Supabase → SQL Editor.
-- Mỗi tên đăng nhập là một dòng; không có mật khẩu (app học cá nhân).
create table if not exists public.progress (
  username   text primary key check (username ~ '^[a-z0-9._-]{3,32}$'),
  data       jsonb not null check (octet_length(data::text) < 2000000),
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

-- Khoá anon (công khai trong app) được đọc/ghi mọi dòng, nhưng không được xoá.
create policy "anon read"   on public.progress for select to anon using (true);
create policy "anon insert" on public.progress for insert to anon with check (true);
create policy "anon update" on public.progress for update to anon using (true) with check (true);
