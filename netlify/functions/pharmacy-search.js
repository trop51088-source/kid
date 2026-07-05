const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://mypillbox.online,https://www.mypillbox.online').split(',');

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
});

const COORD_RE = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;

export const handler = async (event) => {
  const CORS = corsHeaders(event.headers?.origin || '');
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const apikey = process.env.YANDEX_SEARCH_API_KEY;
  if (!apikey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Service not configured' }) };
  }

  let { ll, text = 'аптека', spn = '0.1,0.1' } = event.queryStringParameters || {};

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
    return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
  } catch (e) {
    console.error('pharmacy-search error:', e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Search failed' }) };
  }
};
