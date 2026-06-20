import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 80;

// Статические файлы
app.use(express.static(path.join(__dirname, 'dist')));

// Прокси к GRLS — поиск по названию
app.get('/api/medicine-info', async (req, res) => {
  const { name } = req.query;
  if (!name) return res.json({ error: 'No name provided' });

  try {
    const searchUrl = `https://grls.rosminzdrav.ru/GRLS/v2/Medicines/SearchAsync?nameLp=${encodeURIComponent(name)}&pageSize=5&pageNum=1`;
    const response = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });

    if (!response.ok) throw new Error(`GRLS returned ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Прокси к GRLS — инструкция по ID
app.get('/api/medicine-instruction/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const url = `https://grls.rosminzdrav.ru/GRLS/v2/Medicines/${id}/InstructionText`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error(`GRLS returned ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
