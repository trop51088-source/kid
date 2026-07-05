const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://mypillbox.online,https://www.mypillbox.online').split(',');
const COORD_RE = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const apikey = process.env.YANDEX_SEARCH_API_KEY;
  if (!apikey) { res.status(500).json({ error: 'Service not configured' }); return; }

  let { ll, text = 'аптека', spn = '0.1,0.1' } = req.query;

  // Валидация входных данных
  text = String(text).slice(0, 100);
  if (ll && !COORD_RE.test(ll)) ll = undefined;
  if (!COORD_RE.test(spn)) spn = '0.1,0.1';

  try {
    const params = new URLSearchParams({
      text,
      type: 'biz',
      lang: 'ru_RU',
      apikey,
      spn,
      results: '30',
    });
    if (ll) params.set('ll', ll);

    const response = await fetch(`https://search-maps.yandex.ru/v1/?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    console.error('pharmacy-search error:', e);
    res.status(500).json({ error: 'Search failed' });
  }
}
