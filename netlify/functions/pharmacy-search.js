const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { ll, text = 'аптека', spn = '0.1,0.1' } = event.queryStringParameters || {};

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
    return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
