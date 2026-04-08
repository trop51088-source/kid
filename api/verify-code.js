import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const normalizePhone = (raw) => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) return '+7' + digits.slice(1);
  if (digits.length === 10) return '+7' + digits;
  return null;
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, code } = req.body || {};
  const normalized = normalizePhone(phone || '');
  if (!normalized || !code) return res.status(400).json({ error: 'Укажите номер телефона и код' });

  const now = new Date().toISOString();
  const { data: rows, error: fetchError } = await supabase
    .from('sms_codes')
    .select('*')
    .eq('phone', normalized)
    .gte('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1);

  if (fetchError || !rows || rows.length === 0) {
    return res.status(400).json({ error: 'Код не найден или истёк срок действия' });
  }

  const record = rows[0];

  if (record.attempts >= 5) {
    await supabase.from('sms_codes').delete().eq('id', record.id);
    return res.status(400).json({ error: 'Превышено количество попыток. Запросите новый код.' });
  }

  if (record.code !== String(code).trim()) {
    await supabase.from('sms_codes').update({ attempts: record.attempts + 1 }).eq('id', record.id);
    const left = 4 - record.attempts;
    return res.status(400).json({ error: `Неверный код. Осталось попыток: ${left}` });
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
      return res.status(500).json({ error: 'Ошибка создания пользователя' });
    }
    userId = newUser.id;
  }

  const token = jwt.sign(
    { userId, phone: normalized },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  return res.status(200).json({ success: true, token, phone: normalized, userId });
}
