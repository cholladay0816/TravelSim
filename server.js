import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const app = express();
app.use(express.json({ limit: '1mb' }));

// Simple CORS headers for development so file:// or other origins can reach the API
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.OPENAI_API_KEY;
if(!API_KEY){
  console.warn('WARNING: OPENAI_API_KEY not set in .env');
}

app.post('/api/chat', async (req, res) => {
  try {
    if(!API_KEY) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
    const { messages = [], model = 'gpt-4o-mini', temperature = 0.4, max_tokens = 600 } = req.body;
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens })
    });
    if(!resp.ok){
      const text = await resp.text();
      return res.status(resp.status).send(text);
    }
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content || '';
    res.json({ content });
  } catch(err){
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Serve static index.html
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`TravelSim server running on http://localhost:${port}`);
});
