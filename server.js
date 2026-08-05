import express from 'express'; 
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 80;

app.disable('x-powered-by');

// Базовые security-заголовки
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(express.static(path.join(__dirname, 'dist')));

// Простой rate limit в памяти: 30 запросов/мин с одного IP
const hits = new Map();
const RATE_LIMIT = 30;
const WINDOW_MS = 60 * 1000;
setInterval(() => hits.clear(), WINDOW_MS).unref();

const rateLimit = (req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  const n = (hits.get(ip) || 0) + 1;
  hits.set(ip, n);
  if (n > RATE_LIMIT) return res.status(429).json({ error: 'Too many requests' });
  next();
};

app.get('/api/medicine-info', rateLimit, async (req, res) => {
  const { name } = req.query;
  if (!name || typeof name !== 'string') return res.json({ error: 'No name' });
  if (name.length > 200) return res.status(400).json({ error: 'Name too long' });

  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    'Referer': 'https://grls.rosminzdrav.ru/',
    'Origin': 'https://grls.rosminzdrav.ru',
  };

  const endpoints = [
    `https://grls.rosminzdrav.ru/GRLS/v2/Medicines/SearchAsync?nameLp=${encodeURIComponent(name)}&pageSize=5&pageNum=1`,
    `https://grls.rosminzdrav.ru/GRLS/v2/Medicines/SearchAsync?mnn=${encodeURIComponent(name)}&pageSize=5&pageNum=1`,
    `https://grls.rosminzdrav.ru/GRLS/v2/Medicines/SearchAsync?name=${encodeURIComponent(name)}&pageSize=5&pageNum=1`,
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      const text = await response.text();
      if (!response.ok) continue;
      try {
        const data = JSON.parse(text);
        const rows = data.rows || data.data || data.medicines || (Array.isArray(data) ? data : []);
        if (rows.length > 0) return res.json({ ok: true, rows });
      } catch { continue; }
    } catch (e) {
      console.error('[GRLS] fetch error:', e.message);
    }
  }

  res.json({ ok: false, rows: [] });
});

app.get('/api/check-cis', rateLimit, async (req, res) => {
  const { cis } = req.query;
  if (!cis || typeof cis !== 'string') return res.status(400).json({ success: false, error: 'No cis' });
  if (cis.length > 300) return res.status(400).json({ success: false, error: 'cis too long' });

  // Diagnostic: check if outbound HTTPS works at all from this container
  let networkTest = 'not run';
  try {
    const testRes = await fetch('https://api.github.com/zen', { signal: AbortSignal.timeout(5000) });
    networkTest = `control fetch OK, status ${testRes.status}`;
  } catch (e) {
    networkTest = `control fetch FAILED: ${e.message}`;
  }

  const attempts = [];
  const headerVariants = [
    { 'Accept': 'application/json, text/plain, */*', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
    { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
    { 'Accept': '*/*' },
  ];

  const endpoints = [
    `https://mobile.api.crpt.ru/mobile/check?cis=${encodeURIComponent(cis)}`,
    `https://ismotp.crpt.ru/api/v1/facade/check?cis=${encodeURIComponent(cis)}`,
  ];

  for (const url of endpoints) {
    for (const headers of headerVariants) {
      try {
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
        attempts.push({ url, headers: headers['User-Agent'] || 'minimal', status: response.status });
        if (response.ok) {
          const data = await response.json();
          return res.json({ success: true, cis, data, networkTest, attempts });
        }
      } catch (e) {
        attempts.push({ url, headers: headers['User-Agent'] || 'minimal', error: e.message });
      }
    }
  }

  res.json({ success: false, error: 'Не удалось получить данные о препарате.', networkTest, attempts });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Server on port ${PORT}`));
