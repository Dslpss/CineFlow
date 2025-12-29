import express from 'express';
import http from 'node:http';
import https from 'node:https';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// IPTV Server config from environment (keeps credentials private)
const IPTV_HOST = process.env.IPTV_HOST || 'tiralit.shop';
const IPTV_PORT = parseInt(process.env.IPTV_PORT || '8880');

// M3U Playlist source (URL or Base64)
const M3U_URL = process.env.M3U_URL || '';
const M3U_BASE64 = process.env.M3U_BASE64 || '';

// Cache for playlist
let playlistCache = null;
let playlistCacheTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// CORS headers for all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Debug endpoint - shows server info
app.get('/api/debug', (req, res) => {
  const dataPath = path.join(__dirname, 'data', 'playlist.m3u');
  const publicPath = path.join(__dirname, 'public', 'canais.m3u');
  
  let rootFiles = [];
  let dataFiles = [];
  
  try { rootFiles = fs.readdirSync(__dirname); } catch(e) { rootFiles = ['Error: ' + e.message]; }
  try { dataFiles = fs.readdirSync(path.join(__dirname, 'data')); } catch(e) { dataFiles = ['Error: ' + e.message]; }
  
  res.json({
    dirname: __dirname,
    cwd: process.cwd(),
    env: {
      IPTV_HOST: IPTV_HOST,
      IPTV_PORT: IPTV_PORT,
      M3U_URL: M3U_URL ? 'SET' : 'NOT SET',
      M3U_BASE64: M3U_BASE64 ? 'SET (' + M3U_BASE64.length + ' chars)' : 'NOT SET'
    },
    files: {
      root: rootFiles,
      data: dataFiles,
      dataPathExists: fs.existsSync(dataPath),
      publicPathExists: fs.existsSync(publicPath)
    }
  });
});

// API: Serve playlist from environment variable
app.get('/api/playlist', async (req, res) => {
  try {
    // Check cache
    if (playlistCache && (Date.now() - playlistCacheTime) < CACHE_DURATION) {
      res.setHeader('Content-Type', 'audio/x-mpegurl');
      return res.send(playlistCache);
    }

    let content = '';
    
    // Debug: Log directory contents
    console.log('[Debug] __dirname:', __dirname);
    console.log('[Debug] Files in root:', fs.readdirSync(__dirname));
    
    const dataDir = path.join(__dirname, 'data');
    if (fs.existsSync(dataDir)) {
      console.log('[Debug] Files in data/:', fs.readdirSync(dataDir));
    } else {
      console.log('[Debug] data/ folder does not exist');
    }

    // Priority 1: Base64 encoded playlist
    if (M3U_BASE64) {
      console.log('[Playlist] Loading from Base64 env var');
      content = Buffer.from(M3U_BASE64, 'base64').toString('utf-8');
    }
    // Priority 2: External URL
    else if (M3U_URL) {
      console.log('[Playlist] Loading from URL:', M3U_URL);
      content = await fetchUrl(M3U_URL);
    }
    // Priority 3: Local file in data folder (private, for production)
    else {
      const dataPath = path.join(__dirname, 'data', 'playlist.m3u');
      const publicPath = path.join(__dirname, 'public', 'canais.m3u');
      
      console.log('[Debug] Checking dataPath:', dataPath, 'exists:', fs.existsSync(dataPath));
      console.log('[Debug] Checking publicPath:', publicPath, 'exists:', fs.existsSync(publicPath));
      
      if (fs.existsSync(dataPath)) {
        console.log('[Playlist] Loading from data/playlist.m3u');
        content = fs.readFileSync(dataPath, 'utf-8');
      } else if (fs.existsSync(publicPath)) {
        console.log('[Playlist] Loading from public/canais.m3u (dev fallback)');
        content = fs.readFileSync(publicPath, 'utf-8');
      } else {
        console.error('[Playlist] No playlist file found!');
        return res.status(404).json({ 
          error: 'Playlist not configured', 
          dirname: __dirname,
          files: fs.readdirSync(__dirname)
        });
      }
    }

    console.log('[Playlist] Loaded', content.length, 'characters');
    
    // Cache the result
    playlistCache = content;
    playlistCacheTime = Date.now();

    res.setHeader('Content-Type', 'audio/x-mpegurl');
    res.send(content);
  } catch (err) {
    console.error('[Playlist] Error:', err);
    res.status(500).json({ error: 'Failed to load playlist', details: err.message, stack: err.stack });
  }
});

// Helper: Fetch URL content
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Manual Stream Proxy - full control over headers
app.use('/stream-proxy', (req, res) => {
  const targetPath = req.url;
  
  console.log(`[Proxy] ${req.method} -> ${IPTV_HOST}:${IPTV_PORT}${targetPath}`);
  
  const proxyOptions = {
    hostname: IPTV_HOST,
    port: IPTV_PORT,
    path: targetPath,
    method: req.method,
    headers: {
      'User-Agent': 'Lavf/60.3.100',  // FFmpeg/mpv style user agent
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
      'Connection': 'keep-alive',
      'Host': `${IPTV_HOST}:${IPTV_PORT}`,
      'Icy-MetaData': '1'
    }
  };

  // Forward Range header for seeking in videos
  if (req.headers.range) {
    proxyOptions.headers['Range'] = req.headers.range;
  }

  const proxyReq = http.request(proxyOptions, (proxyRes) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
    
    // Forward original headers (except problematic ones)
    Object.keys(proxyRes.headers).forEach(key => {
      if (!['transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, proxyRes.headers[key]);
      }
    });
    
    res.status(proxyRes.statusCode);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[Proxy] Error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Stream unavailable', details: err.message });
    }
  });

  req.on('close', () => proxyReq.destroy());
  proxyReq.end();
});

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎬 CineFlow server running on port ${PORT}`);
  console.log(`   Playlist API: /api/playlist`);
  console.log(`   Stream proxy: /stream-proxy/* -> ${IPTV_HOST}:${IPTV_PORT}`);
  console.log(`   M3U Source: ${M3U_BASE64 ? 'Base64 env' : M3U_URL ? 'URL env' : 'Local file (dev)'}`);
});

