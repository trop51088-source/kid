-- ============================================================
-- SECURITY FIX: закрыть публичный доступ к sms_codes и users
-- Выполнить в Supabase → SQL Editor.
-- ВАЖНО: перед этим задайте SUPABASE_SERVICE_ROLE_KEY в env
-- Netlify Functions (send-code / verify-code) — service_role
-- обходит RLS, публичные политики им не нужны.
-- ============================================================

-- Старые политики позволяли ЛЮБОМУ с anon-ключом читать все
-- SMS-коды входа (= угон аккаунта) и телефоны пользователей.

drop policy if exists "allow_insert_sms_codes" on sms_codes;
drop policy if exists "allow_select_sms_codes" on sms_codes;
drop policy if exists "allow_update_sms_codes" on sms_codes;
drop policy if exists "allow_delete_sms_codes" on sms_codes;

drop policy if exists "allow_insert_users" on users;
drop policy if exists "allow_select_users" on users;

-- RLS остаётся включённым; без политик anon/authenticated
-- не имеют никакого доступа. service_role работает всегда.
alter table sms_codes enable row level security;
alter table users enable row level security;

-- Автоочистка просроченных кодов (опционально, требует pg_cron):
-- select cron.schedule('purge-sms-codes', '*/15 * * * *',
--   $$delete from sms_codes where expires_at < now() - interval '1 hour'$$);
