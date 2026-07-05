import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';

// SERVICE_ROLE ключ обходит RLS — публичные политики на sms_codes/users больше не нужны.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://mypillbox.online,https://www.mypillbox.online').split(',');

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const normalizePhone = (raw) => {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) return '+7' + digits.slice(1);
  if (digits.length === 10) return '+7' + digits;
  return null;
};

// Сравнение без утечки по времени
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

export const handler = async (event) => {
  const CORS = corsHeaders(event.headers?.origin || '');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set');
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Service not configured' }) };
  }

  let phone, code;
  try { ({ phone, code } = JSON.parse(event.body || '{}')); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const normalized = normalizePhone(phone || '');
  if (!normalized || !code) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Укажите номер телефона и код' }) };

  const now = new Date().toISOString();
  const { data: rows, error: fetchError } = await supabase
    .from('sms_codes')
    .select('*')
    .eq('phone', normalized)
    .gte('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1);

  if (fetchError || !rows || rows.length === 0) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Код не найден или истёк срок действия' }) };
  }

  const record = rows[0];

  if (record.attempts >= 5) {
    await supabase.from('sms_codes').delete().eq('id', record.id);
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Превышено количество попыток. Запросите новый код.' }) };
  }

  // Сначала увеличиваем счётчик попыток (защита от гонки), потом сверяем код
  await supabase.from('sms_codes').update({ attempts: record.attempts + 1 }).eq('id', record.id);

  if (!safeEqual(record.code, String(code).trim())) {
    const left = 4 - record.attempts;
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: `Неверный код. Осталось попыток: ${left}` }) };
  }

  await supabase.from('sms_codes').delete().eq('id', record.id);

  let userId;
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('phone', normalized)
    .single();

  if (existingUser) {
    userId = existingUser.id;
  } else {
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({ phone: normalized })
      .select('id')
      .single();
    if (createError) {
      console.error('Create user error:', createError);
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Ошибка создания пользователя' }) };
    }
    userId = newUser.id;
  }

  const token = jwt.sign(
    { userId, phone: normalized },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, token, phone: normalized, userId }) };
};
