const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'memories.json');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT_DIR, 'uploads');

const DEFAULT_MEMORIES = [
  {
    id: '1',
    title: 'O Primeiro Olhar',
    description: 'Foi aqui que nossos olhos se encontraram pela primeira vez. Eu sabia, naquele exato segundo, que algo mágico estava prestes a acontecer.',
    image: 'http://static.photos/cityscape/640x360/101',
    spotifyEmbed: 'https://open.spotify.com/embed/track/1dGr1c8CrMLDpV6aMbGInw?utm_source=generator&theme=0',
    lat: -22.9068,
    lng: -43.1729,
    label: 'Primeiro Encontro',
  },
  {
    id: '2',
    title: 'Cristo Redentor',
    description: 'Um dos lugares mais especiais do Rio. Daqui de cima, o mundo parece pequeno, mas nosso amor parece infinito.',
    image: 'http://static.photos/nature/640x360/42',
    spotifyEmbed: 'https://open.spotify.com/embed/track/4iV5W8uOJ0OGid8xwOQDch?utm_source=generator&theme=0',
    lat: -22.9519,
    lng: -43.2105,
    label: 'Cristo Redentor',
  },
  {
    id: '3',
    title: 'O Pedido',
    description: 'Com as mãos trêmulas e o coração a mil, te pedi para ser minha pessoa favorita no mundo. Você disse sim.',
    image: 'http://static.photos/night/640x360/7',
    spotifyEmbed: '',
    lat: -23.5505,
    lng: -46.6333,
    label: 'O Sim',
  },
];

[DATA_DIR, UPLOADS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function readMemories() {
  if (!fs.existsSync(DATA_FILE)) {
    writeMemories(DEFAULT_MEMORIES);
    return [...DEFAULT_MEMORIES];
  }
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(data) ? data : [...DEFAULT_MEMORIES];
  } catch {
    return [...DEFAULT_MEMORIES];
  }
}

function writeMemories(memories) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(memories, null, 2), 'utf8');
}

function generateId() {
  return Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}

function isLocalUpload(imagePath) {
  return typeof imagePath === 'string' && imagePath.startsWith('/uploads/');
}

function deleteLocalImage(imagePath) {
  if (!isLocalUpload(imagePath)) return;
  const filePath = path.join(ROOT_DIR, imagePath);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas.'));
  },
});

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(ROOT_DIR));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storage: 'filesystem' });
});

app.get('/api/memories', (_req, res) => {
  res.json(readMemories());
});

app.post('/api/memories', (req, res) => {
  const memories = readMemories();
  const memory = {
    id: generateId(),
    label: req.body.label?.trim() || '',
    title: req.body.title?.trim() || '',
    description: req.body.description?.trim() || '',
    image: req.body.image || '',
    spotifyEmbed: req.body.spotifyEmbed || '',
    lat: Number(req.body.lat),
    lng: Number(req.body.lng),
  };

  if (!memory.title || !memory.label || !memory.image || Number.isNaN(memory.lat) || Number.isNaN(memory.lng)) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }

  memories.push(memory);
  writeMemories(memories);
  res.status(201).json(memory);
});

app.put('/api/memories/:id', (req, res) => {
  const memories = readMemories();
  const index = memories.findIndex((m) => m.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Memória não encontrada.' });

  const oldImage = memories[index].image;
  const updated = {
    ...memories[index],
    label: req.body.label?.trim() ?? memories[index].label,
    title: req.body.title?.trim() ?? memories[index].title,
    description: req.body.description?.trim() ?? memories[index].description,
    image: req.body.image ?? memories[index].image,
    spotifyEmbed: req.body.spotifyEmbed ?? memories[index].spotifyEmbed,
    lat: req.body.lat !== undefined ? Number(req.body.lat) : memories[index].lat,
    lng: req.body.lng !== undefined ? Number(req.body.lng) : memories[index].lng,
  };

  memories[index] = updated;
  writeMemories(memories);

  if (isLocalUpload(oldImage) && oldImage !== updated.image) {
    deleteLocalImage(oldImage);
  }

  res.json(updated);
});

app.delete('/api/memories/:id', (req, res) => {
  const memories = readMemories();
  const index = memories.findIndex((m) => m.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Memória não encontrada.' });

  const removed = memories.splice(index, 1)[0];
  writeMemories(memories);
  deleteLocalImage(removed.image);
  res.json({ ok: true });
});

app.post('/api/memories/import', (req, res) => {
  const imported = req.body;
  if (!Array.isArray(imported) || imported.length === 0) {
    return res.status(400).json({ error: 'Lista inválida.' });
  }

  const current = readMemories();
  current.forEach((m) => deleteLocalImage(m.image));

  const cleaned = imported.map((m) => ({
    id: m.id || generateId(),
    label: m.label?.trim() || '',
    title: m.title?.trim() || '',
    description: m.description?.trim() || '',
    image: m.image || '',
    spotifyEmbed: m.spotifyEmbed || '',
    lat: Number(m.lat),
    lng: Number(m.lng),
  }));

  writeMemories(cleaned);
  res.json(cleaned);
});

app.post('/api/upload', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Erro no upload.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    }
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

app.listen(PORT, () => {
  console.log(`Nossa História rodando em http://localhost:${PORT}`);
});
