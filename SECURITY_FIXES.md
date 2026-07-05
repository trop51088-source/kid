# Исправления безопасности — 2026-07-05

## Что исправлено

1. **Критично — RLS Supabase.** Политики `using (true)` на `sms_codes` и `users` позволяли любому с публичным anon-ключом читать все SMS-коды входа (угон любого аккаунта) и телефоны пользователей. → Выполните `supabase_security_fix.sql` в Supabase SQL Editor.
2. **Ключ Yandex Search API** был захардкожен в `netlify/functions/pharmacy-search.js` и `api/pharmacy-search.js`. → Вынесен в env `YANDEX_SEARCH_API_KEY`. **Старый ключ (`15eeb52b-…`) скомпрометирован — отзовите его в кабинете Яндекса и выпустите новый.**
3. **Path traversal в `api.py`** — имя загружаемого файла подставлялось в путь без проверки. → Своё имя (uuid), белый список расширений, лимит 10 МБ.
4. **SMS-код через `Math.random()`** → `crypto.randomInt` (send-code.js).
5. **CORS `*`** на всех эндпоинтах → белый список доменов (env `ALLOWED_ORIGINS`).
6. **Netlify Functions переведены на `SUPABASE_SERVICE_ROLE_KEY`** — anon-ключу доступ к `sms_codes`/`users` теперь полностью закрыт.
7. **server.js**: security-заголовки (nosniff, X-Frame-Options, HSTS и др.), rate limit 30 req/мин на IP, валидация `name`, убран лог тела ответов.
8. **verify-code.js**: сравнение кода без утечки по времени, счётчик попыток инкрементируется до сверки (защита от гонки), проверка наличия `JWT_SECRET`, деталь ошибок SMSC не отдаётся клиенту.

## Что нужно сделать вручную

1. Выполнить `supabase_security_fix.sql` в Supabase.
2. Отозвать старый Yandex-ключ `15eeb52b-…`, новый положить в env `YANDEX_SEARCH_API_KEY` (Netlify/Amvera).
3. Добавить env `SUPABASE_SERVICE_ROLE_KEY` в Netlify (Site settings → Environment variables). Никогда не коммитить его.
4. (Опционально) env `ALLOWED_ORIGINS` — список доменов через запятую; по умолчанию `https://mypillbox.online,https://www.mypillbox.online`.
5. Ключ Yandex Maps JS API в `index.html` — публичный по дизайну, но в кабинете Яндекса ограничьте его по HTTP Referer (только ваш домен).
6. Anon-ключ Supabase в `App.jsx` — публичный по дизайну; безопасен только при корректных RLS-политиках (п. 1).
