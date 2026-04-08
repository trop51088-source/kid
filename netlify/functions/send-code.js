import { createClient } from '@supabase/supabase-js';

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

  let phone;
  try { ({ phone } = JSON.parse(event.body || '{}')); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const normalized = normalizePhone(phone || '');
  if (!normalized) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Неверный формат номера телефона' }) };

  // Rate limit: не более 3 SMS за последний час
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('sms_codes')
    .select('*', { count: 'exact', head: true })
    .eq('phone', normalized)
    .gte('created_at', hourAgo);

  if (count >= 3) {
    return { statusCode: 429, headers: CORS, body: JSON.stringify({ error: 'Превышен лимит SMS. Попробуйте через час.' }) };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { error: dbError } = await supabase
    .from('sms_codes')
    .insert({ phone: normalized, code, expires_at: expiresAt, attempts: 0 });

  if (dbError) {
    console.error('Supabase insert error:', dbError);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Ошибка базы данных' }) };
  }

  const smsText = encodeURIComponent(`Ваш код для входа в Аптечку: ${code}. Действует 5 минут.`);
  const smsUrl = `https://smsc.ru/sys/send.php?login=${process.env.SMSC_LOGIN}&psw=${process.env.SMSC_PASSWORD}&phones=${encodeURIComponent(normalized)}&mes=${smsText}&charset=utf-8&fmt=3`;

  try {
    const smsRes = await fetch(smsUrl);
    const smsData = await smsRes.json();
    if (smsData.error) {
      console.error('SMSC error:', smsData);
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Ошибка отправки SMS: ' + smsData.error_code }) };
    }
  } catch (err) {
    console.error('SMSC fetch error:', err);
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Ошибка отправки SMS' }) };
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, phone: normalized }) };
};
