const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const WORKSPACE_DIR = __dirname;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Estado de la cola de descargas
const downloadQueue = []; // Array de objetos { id, videoId, url, title, artist, quality, status, progress, speed, eta, error, addedAt }
let activeDownload = null;
let currentProcess = null;

// Función para sanitizar nombres de carpeta
function sanitizeFolderName(artist) {
  const cleanName = artist.trim().replace(/[\\/:"*?<>|]/g, '').replace(/\s+/g, '_');
  return `musica_${cleanName || 'Desconocido'}`;
}

// Búsqueda de canciones usando yt-dlp --dump-json
app.post('/api/search', async (req, res) => {
  const { artist, amount = 5 } = req.body;
  if (!artist || typeof artist !== 'string' || artist.trim() === '') {
    return res.status(400).json({ error: 'El nombre del artista es obligatorio' });
  }

  const num = Math.min(Math.max(parseInt(amount) || 5, 1), 30);
  const query = `ytsearch${num}:${artist.trim()} audio oficial`;

  console.log(`[*] Buscando ${num} canciones para: "${artist}"...`);

  try {
    const ytdlp = spawn('yt-dlp', [
      '--dump-json',
      '--flat-playlist',
      '--no-warnings',
      query
    ]);

    let outputData = '';
    let errorData = '';

    ytdlp.stdout.on('data', (data) => {
      outputData += data.toString('utf8');
    });

    ytdlp.stderr.on('data', (data) => {
      errorData += data.toString('utf8');
    });

    ytdlp.on('close', (code) => {
      if (code !== 0 && !outputData.trim()) {
        console.error('Error al buscar con yt-dlp:', errorData);
        return res.status(500).json({ error: 'No se pudieron obtener resultados de búsqueda.' });
      }

      const results = [];
      const lines = outputData.trim().split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          const videoId = json.id || json.url;
          const title = json.title || 'Título desconocido';
          const duration = json.duration ? formatDuration(json.duration) : '--:--';
          const url = json.webpage_url || json.url || `https://www.youtube.com/watch?v=${videoId}`;
          
          let thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          if (json.thumbnails && json.thumbnails.length > 0) {
            thumbnail = json.thumbnails[json.thumbnails.length - 1].url || thumbnail;
          }

          results.push({
            id: videoId,
            title,
            duration,
            url,
            thumbnail,
            artist: artist.trim(),
            channel: json.uploader || json.channel || artist.trim()
          });
        } catch (err) {
          console.warn('No se pudo parsear linea JSON:', err.message);
        }
      }

      res.json({ artist: artist.trim(), results });
    });

  } catch (err) {
    console.error('Excepción en /api/search:', err);
    res.status(500).json({ error: err.message });
  }
});

// Formatear duración en mm:ss
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Endpoint para agregar items a la cola de descargas
app.post('/api/queue/add', (req, res) => {
  const { items, quality = '192' } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Debes proporcionar una lista de canciones' });
  }

  const validQualities = ['128', '192', '320'];
  const selectedQuality = validQualities.includes(String(quality)) ? String(quality) : '192';

  const addedItems = [];

  for (const item of items) {
    // Evitar duplicar en cola si ya está pendiente o descargando
    const exists = downloadQueue.some(
      q => q.id === item.id && (q.status === 'pending' || q.status === 'downloading' || q.status === 'converting')
    );

    if (!exists) {
      const queueItem = {
        queueId: `${item.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        id: item.id,
        url: item.url || `https://www.youtube.com/watch?v=${item.id}`,
        title: item.title,
        artist: item.artist || 'Desconocido',
        thumbnail: item.thumbnail,
        quality: selectedQuality,
        status: 'pending', // pending, downloading, converting, completed, error
        progress: 0,
        speed: '0 KiB/s',
        eta: '--:--',
        error: null,
        addedAt: new Date().toISOString()
      };

      downloadQueue.push(queueItem);
      addedItems.push(queueItem);
    }
  }

  broadcastQueue();
  processQueue();

  res.json({ message: `Se agregaron ${addedItems.length} canciones a la cola`, addedCount: addedItems.length });
});

// Endpoint para obtener estado de la cola
app.get('/api/queue', (req, res) => {
  res.json({ queue: downloadQueue, activeDownload });
});

// Endpoint para limpiar completadas o fallidas
app.post('/api/queue/clear', (req, res) => {
  for (let i = downloadQueue.length - 1; i >= 0; i--) {
    if (downloadQueue[i].status === 'completed' || downloadQueue[i].status === 'error') {
      downloadQueue.splice(i, 1);
    }
  }
  broadcastQueue();
  res.json({ success: true, queue: downloadQueue });
});

// Cancelar un item específico
app.post('/api/queue/cancel', (req, res) => {
  const { queueId } = req.body;
  const index = downloadQueue.findIndex(q => q.queueId === queueId);

  if (index !== -1) {
    const item = downloadQueue[index];
    if (activeDownload && activeDownload.queueId === queueId && currentProcess) {
      currentProcess.kill('SIGKILL');
      currentProcess = null;
      activeDownload = null;
    }
    downloadQueue.splice(index, 1);
    broadcastQueue();
    processQueue();
    return res.json({ success: true, message: 'Descarga cancelada' });
  }

  res.status(404).json({ error: 'Elemento no encontrado en la cola' });
});

// Emitir estado de la cola a clientes conectados vía Socket.IO
function broadcastQueue() {
  io.emit('queue_update', { queue: downloadQueue, activeDownload });
}

// Gestor de cola secuencial
function processQueue() {
  if (activeDownload) return; // Ya hay una descarga en proceso

  const nextItem = downloadQueue.find(q => q.status === 'pending');
  if (!nextItem) return; // Nada pendiente

  activeDownload = nextItem;
  nextItem.status = 'downloading';
  nextItem.progress = 0;
  broadcastQueue();

  const folderName = sanitizeFolderName(nextItem.artist);
  const outputDir = path.join(WORKSPACE_DIR, folderName);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputTemplate = path.join(outputDir, '%(title)s.%(ext)s');

  console.log(`[*] Iniciando descarga de: "${nextItem.title}" en carpeta: "${folderName}" (${nextItem.quality}k MP3)`);

  const args = [
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', `${nextItem.quality}k`,
    '-o', outputTemplate,
    '--no-playlist',
    '--ignore-errors',
    '--newline',
    nextItem.url
  ];

  const ytdlp = spawn('yt-dlp', args);
  currentProcess = ytdlp;

  ytdlp.stdout.on('data', (data) => {
    const output = data.toString('utf8');
    parseProgress(output, nextItem);
  });

  ytdlp.stderr.on('data', (data) => {
    const output = data.toString('utf8');
    parseProgress(output, nextItem);
  });

  ytdlp.on('close', (code) => {
    currentProcess = null;
    if (code === 0) {
      nextItem.status = 'completed';
      nextItem.progress = 100;
      nextItem.speed = 'Completado';
      nextItem.eta = '00:00';
      console.log(`[✓] Descarga completada: ${nextItem.title}`);
    } else {
      if (nextItem.status !== 'error') {
        nextItem.status = 'error';
        nextItem.error = `Error durante la descarga (código ${code})`;
        console.error(`[!] Error al descargar: ${nextItem.title}`);
      }
    }

    activeDownload = null;
    broadcastQueue();
    // Procesar la siguiente en cola
    setTimeout(processQueue, 500);
  });
}

// Parsear progreso de la salida de yt-dlp
function parseProgress(text, item) {
  const lines = text.split('\n');
  let updated = false;

  for (const line of lines) {
    if (line.includes('[ExtractAudio]') || line.includes('[ffmpeg]')) {
      item.status = 'converting';
      item.speed = 'Procesando audio MP3...';
      item.progress = 95;
      item.eta = 'Codificando...';
      updated = true;
    }

    // Ejemplo de línea: [download]  45.2% of ~ 4.12MiB at  1.23MiB/s ETA 00:03
    const downloadMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([\d\.]+\s*\w+)?\s+at\s+([\d\.]+\s*\w+\/s)?\s+ETA\s+([\d:]+)?/i);
    if (downloadMatch && item.status !== 'converting') {
      const pct = parseFloat(downloadMatch[1]);
      if (!isNaN(pct)) {
        item.progress = Math.min(Math.max(Math.floor(pct * 0.9), 0), 90);
      }
      if (downloadMatch[3]) item.speed = downloadMatch[3].trim();
      if (downloadMatch[4]) item.eta = downloadMatch[4].trim();
      updated = true;
    }
  }

  if (updated) {
    broadcastQueue();
  }
}

// Manejo de conexiones Socket.IO
io.on('connection', (socket) => {
  console.log(`[+] Cliente conectado: ${socket.id}`);
  socket.emit('queue_update', { queue: downloadQueue, activeDownload });

  socket.on('disconnect', () => {
    console.log(`[-] Cliente desconectado: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});
