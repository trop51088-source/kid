import jwt from 'jsonwebtoken';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const verifyToken = (event) => {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
};

export const handler = async (event) => {
  const fullPath = event.path || '';
  const path = fullPath.toLowerCase().replace(/^.*?\/(api|functions\/api)/, '');

  console.log(`[Function] Method: ${event.httpMethod}, FullPath: ${fullPath}, CleanPath: ${path}`);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  // Проверка JWT для защищённых роутов
  const user = verifyToken(event);
  if (!user) {
    return {
      statusCode: 401,
      headers: CORS,
      body: JSON.stringify({ success: false, error: 'Unauthorized' }),
    };
  }

  // Роут для получения инфо по тексту (коду)
  if ((path === '/scan-text' || path === 'scan-text') && event.httpMethod === 'POST') {
    try {
      const { text } = JSON.parse(event.body);
      if (!text) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ success: false, error: 'No text provided' }),
        };
      }

      console.log(`Checking code: ${text}`);

      const url = `https://mobile.api.crpt.ru/mobile/check?cis=${encodeURIComponent(text)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) throw new Error(`CRPT API error: ${response.status}`);

      const data = await response.json();
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ success: true, cis: text, data }),
      };
    } catch (error) {
      console.error('Error in scan-text:', error);
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({ success: false, error: error.message }),
      };
    }
  }

  // Роут для сканирования изображения
  if ((path === '/scan' || path === 'scan') && event.httpMethod === 'POST') {
    return {
      statusCode: 501,
      headers: CORS,
      body: JSON.stringify({
        success: false,
        error: 'Серверное распознавание фото временно недоступно на Netlify. Используйте камеру или локальное распознавание.',
      }),
    };
  }

  return {
    statusCode: 404,
    headers: CORS,
    body: JSON.stringify({ error: 'Not Found' }),
  };
};
