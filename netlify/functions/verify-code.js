import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const normalizePhone = (raw) => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) return '+7' + digits.slice(1);
  if (digits.length === 10) return '+7' + digits;
  return null;
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

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

  if (record.code !== String(code).trim()) {
    await supabase.from('sms_codes').update({ attempts: record.attempts + 1 }).eq('id', record.id);
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
