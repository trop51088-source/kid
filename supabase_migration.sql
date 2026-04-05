-- Таблица пользователей
create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  phone      text unique not null,
  name       text,
  created_at timestamptz default now()
);

-- Таблица SMS-кодов
create table if not exists sms_codes (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  code       text not null,
  attempts   int default 0,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- Индекс для быстрого поиска по телефону
create index if not exists idx_sms_codes_phone on sms_codes(phone);
create index if not exists idx_sms_codes_expires on sms_codes(expires_at);

-- RLS: включить строчную безопасность
alter table users enable row level security;
alter table sms_codes enable row level security;

-- Политики — разрешить service_role всё (для Netlify Functions через anon key с bypass)
-- Для anon key разрешаем вставку и чтение через политику
create policy "allow_insert_sms_codes" on sms_codes for insert with check (true);
create policy "allow_select_sms_codes" on sms_codes for select using (true);
create policy "allow_update_sms_codes" on sms_codes for update using (true);
create policy "allow_delete_sms_codes" on sms_codes for delete using (true);

create policy "allow_insert_users" on users for insert with check (true);
create policy "allow_select_users" on users for select using (true);
