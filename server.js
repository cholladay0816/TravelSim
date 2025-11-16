import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import os from 'os';
import fs from 'fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

dotenv.config();
const app = express();
// Basic security headers
app.use(helmet());

app.use(express.json({ limit: '1mb' }));

// CORS handling: allow explicit ALLOWED_ORIGINS (comma-separated) or fallback to echoing Origin
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (!origin) {
    // no Origin header (curl, same-origin requests) — allow
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (ALLOWED_ORIGINS.length === 0) {
    // no explicit allow list: echo the origin (safe for simple deployments)
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    return res.status(403).json({ error: 'Forbidden origin' });
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Rate limiter for API endpoints. Configurable via env vars RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.'
});

// Basic HTTP auth for /api routes if API_BASIC_USER/API_BASIC_PASS are set
function basicAuth(req, res, next) {
  const user = process.env.API_BASIC_USER;
  const pass = process.env.API_BASIC_PASS;
  if (!user || !pass) return next(); // not configured -> allow
  const auth = req.get('Authorization') || '';
  if (!auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="TravelSim API"');
    return res.status(401).send('Authentication required');
  }
  const b64 = auth.slice(6);
  const [u, p] = Buffer.from(b64, 'base64').toString().split(':');
  if (u === user && p === pass) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="TravelSim API"');
  return res.status(401).send('Invalid credentials');
}

// Apply basic auth and rate limiter to API routes
app.use('/api', basicAuth, limiter);

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

// === Whisper transcription endpoint ===
// Accepts multipart/form-data with fields: file (audio), model (optional), language (required for narrowing)
// Returns JSON: { text, model }
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, 'whisper_' + Date.now() + '_' + (file.originalname||'audio'))
  }),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

app.post('/api/whisper', upload.single('file'), async (req, res) => {
  const cleanup = () => { try { if(req.file && req.file.path) fs.unlinkSync(req.file.path); } catch(e){} };
  try {
    if(!API_KEY) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
    if(!req.file) return res.status(400).json({ error: 'No audio file provided (field "file")' });
    const { model = 'whisper-1', language } = req.body;
    if(!language || typeof language !== 'string' || language.length < 2){
      cleanup();
      return res.status(400).json({ error: 'Language parameter required (ISO code)' });
    }
    // Build form-data to forward to OpenAI
    const form = new FormData();
    form.append('model', model);
    form.append('file', new Blob([fs.readFileSync(req.file.path)]), req.file.originalname || 'audio.webm');
    form.append('language', language); // Force language to avoid omnilingual mis-recognition
    // Optional: temperature/response_format
    form.append('temperature', '0');
    try { form.append('response_format', 'json'); } catch(e){}

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      body: form
    });
    if(!resp.ok){
      const txt = await resp.text();
      cleanup();
      return res.status(resp.status).json({ error: 'OpenAI error', detail: txt });
    }
    const data = await resp.json();
    cleanup();
    // Standardize output field name
    const text = data.text || data.transcript || '';
    res.json({ text, model, language });
  } catch(err){
    cleanup();
    console.error('Whisper endpoint error', err);
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
