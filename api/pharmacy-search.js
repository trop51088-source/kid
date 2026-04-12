export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { ll, text = 'аптека', spn = '0.1,0.1' } = req.query;

  try {
    const params = new URLSearchParams({
      text,
      type: 'biz',
      lang: 'ru_RU',
      apikey: '15eeb52b-7848-405c-9982-01d006b1a34e',
      spn,
      results: '30',
    });
    if (ll) params.set('ll', ll);

    const response = await fetch(`https://search-maps.yandex.ru/v1/?${params}`);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
