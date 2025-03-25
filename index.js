// youtube-to-mp3-api/index.js
require('dotenv').config(); // Carregar variáveis do arquivo .env

const express = require('express');
const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Pasta para armazenar os arquivos temporários
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Configurar tempo de expiração (em milissegundos) - 1 hora
const EXPIRATION_TIME = 60 * 60 * 1000;

// Armazenamento de arquivos temporários e tarefas pendentes
const tempFiles = new Map();
const pendingTasks = new Map();
// Armazenar transcrições
const transcriptions = new Map();

// Configuração do job queue e workers
const jobQueue = [];
const maxConcurrentJobs = 3; // Número máximo de trabalhos simultâneos (workers)
let currentJobs = 0;

function processQueue() {
  while (currentJobs < maxConcurrentJobs && jobQueue.length > 0) {
    const job = jobQueue.shift();
    currentJobs++;
    job().finally(() => {
      currentJobs--;
      processQueue();
    });
  }
}

// Middleware para analisar JSON
app.use(express.json());

// Middleware para CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Rota para download do arquivo
app.get('/download/:fileId', (req, res) => {
  const { fileId } = req.params;
  
  if (!tempFiles.has(fileId)) {
    return res.status(404).json({ error: 'Arquivo não encontrado ou expirado' });
  }
  
  const fileInfo = tempFiles.get(fileId);
  
  // Verificar se o arquivo ainda existe
  if (!fs.existsSync(fileInfo.path)) {
    tempFiles.delete(fileId);
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }
  
  // Verificar se o arquivo expirou
  if (Date.now() > fileInfo.expiresAt) {
    fs.unlinkSync(fileInfo.path);
    tempFiles.delete(fileId);
    return res.status(404).json({ error: 'Arquivo expirado' });
  }
  
  res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
  res.setHeader('Content-Type', 'audio/mpeg');
  
  const fileStream = fs.createReadStream(fileInfo.path);
  fileStream.pipe(res);
});

// Rota de status
app.get('/status', (req, res) => {
  res.json({ 
    status: 'online',
    version: '1.1.0',
    message: 'API funcionando normalmente'
  });
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Servidor rodando na porta ${PORT}`);
});

// Limpar arquivos e transcrições expirados periodicamente
setInterval(() => {
  const now = Date.now();
  let countRemoved = 0;
  let transcriptionsRemoved = 0;
  
  // Limpar arquivos de áudio expirados
  for (const [fileId, fileInfo] of tempFiles.entries()) {
    if (now > fileInfo.expiresAt) {
      if (fs.existsSync(fileInfo.path)) {
        fs.unlinkSync(fileInfo.path);
        countRemoved++;
      }
      tempFiles.delete(fileId);
      if (pendingTasks.has(fileId)) {
        pendingTasks.delete(fileId);
      }
    }
  }
  
  // Limpar transcrições expiradas
  for (const [fileId, transcription] of transcriptions.entries()) {
    if (now > transcription.expiresAt) {
      transcriptions.delete(fileId);
      transcriptionsRemoved++;
    }
  }
  
  if (countRemoved > 0 || transcriptionsRemoved > 0) {
    console.log(`[${new Date().toISOString()}] Limpeza automática: ${countRemoved} arquivo(s) e ${transcriptionsRemoved} transcrição(ões) expirado(s) removido(s)`);
  }
}, 15 * 60 * 1000); // A cada 15 minutos

// Exportar app para testes
module.exports = app;

// Função para validar URL do YouTube
function validateYouTubeUrl(url) {
  return url.includes('youtube.com/') || url.includes('youtu.be/');
}

// Função para executar comandos do yt-dlp
function executeYtDlp(args) {
  return new Promise((resolve, reject) => {
    console.log(`[${new Date().toISOString()}] Executando yt-dlp com argumentos:`, args.join(' '));
    
    const ytDlp = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';

    ytDlp.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(`[${new Date().toISOString()}] yt-dlp stdout: ${output.trim()}`);
    });

    ytDlp.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.log(`[${new Date().toISOString()}] yt-dlp stderr: ${output.trim()}`);
    });

    ytDlp.on('close', (code) => {
      if (code !== 0) {
        console.log(`[${new Date().toISOString()}] ERRO: yt-dlp falhou com código ${code}`);
        console.log(`[${new Date().toISOString()}] Detalhes: ${stderr}`);
        reject(new Error(stderr || `yt-dlp exit code: ${code}`));
        return;
      }
      
      resolve(stdout);
    });

    ytDlp.on('error', (err) => {
      console.log(`[${new Date().toISOString()}] Erro ao executar yt-dlp: ${err.message}`);
      reject(err);
    });
  });
}

// Função avançada para baixar áudio do YouTube com múltiplas abordagens
async function downloadYouTubeAudio(youtubeUrl, outputPath) {
  const outputTemplate = outputPath.replace(/\.\w+$/, '') + '.%(ext)s';
  console.log(`[${new Date().toISOString()}] Iniciando download de: ${youtubeUrl}`);
  console.log(`[${new Date().toISOString()}] Template de saída: ${outputTemplate}`);
  
  const proxyUrl = `http://${process.env.IPROYAL_USERNAME}:${process.env.IPROYAL_PASSWORD}@geo.iproyal.com:12321`;
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  
  let videoId = '';
  if (youtubeUrl.includes('youtube.com/watch?v=')) {
    videoId = new URL(youtubeUrl).searchParams.get('v');
  } else if (youtubeUrl.includes('youtu.be/')) {
    videoId = youtubeUrl.split('youtu.be/')[1].split('?')[0];
  }
  
  if (!videoId) {
    throw new Error('Não foi possível extrair o ID do vídeo');
  }
  
  // Abordagem 1: Proxy residencial
  try {
    console.log(`[${new Date().toISOString()}] Tentando abordagem 1: Proxy Residencial iProyal`);
    
    const proxyOptions = [
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--no-warnings',
      '--proxy', proxyUrl,
      '--no-check-certificate',
      '--geo-bypass',
      '--ignore-errors',
      '--limit-rate', '500K',
      '--user-agent', userAgent,
      '-o', outputTemplate,
      youtubeUrl
    ];
    
    await executeYtDlp(proxyOptions);
    console.log(`[${new Date().toISOString()}] Abordagem com proxy residencial bem-sucedida!`);
    return { success: true };
  } catch (errorProxy) {
    console.log(`[${new Date().toISOString()}] Abordagem com proxy residencial falhou: ${errorProxy.message}`);
    
    // Outras abordagens (Invidious, avançada, YouTube Music, Piped.video) seguem...
    // Para simplificação, mantemos as mesmas abordagens já existentes.
    try {
      console.log(`[${new Date().toISOString()}] Tentando abordagem 2: Proxy Invidious`);
      
      const invidiousInstances = [
        'yewtu.be',
        'invidious.snopyta.org',
        'vid.puffyan.us',
        'invidious.kavin.rocks',
        'invidious.namazso.eu',
        'inv.riverside.rocks'
      ];
      
      for (const instance of invidiousInstances) {
        try {
          const invidiousUrl = `https://${instance}/watch?v=${videoId}`;
          console.log(`[${new Date().toISOString()}] Usando URL do Invidious: ${invidiousUrl}`);
          
          const invidiousOptions = [
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '--no-warnings',
            '--no-check-certificate',
            '--geo-bypass',
            '--ignore-errors',
            '--proxy', proxyUrl,
            '--limit-rate', '500K',
            '--user-agent', userAgent,
            '-o', outputTemplate,
            invidiousUrl
          ];
          
          await executeYtDlp(invidiousOptions);
          console.log(`[${new Date().toISOString()}] Download com ${instance} bem-sucedido!`);
          return { success: true };
        } catch (err) {
          console.log(`[${new Date().toISOString()}] Falha com ${instance}: ${err.message}`);
        }
      }
      
      throw new Error('Todas as instâncias Invidious falharam');
    } catch (error2) {
      console.log(`[${new Date().toISOString()}] Abordagem 2 (Invidious) falhou: ${error2.message}`);
      
      // Abordagem 3: Configurações avançadas
      try {
        console.log(`[${new Date().toISOString()}] Tentando abordagem 3: Configurações avançadas`);
        const advancedOptions = [
          '--extract-audio',
          '--audio-format', 'mp3',
          '--audio-quality', '0',
          '--no-warnings',
          '--format', 'bestaudio[ext=m4a]/bestaudio/best',
          '--no-check-certificate',
          '--geo-bypass',
          '--ignore-errors',
          '--no-playlist',
          '--proxy', proxyUrl,
          '--limit-rate', '500K',
          '--user-agent', userAgent,
          '--extractor-args', 'youtube:skip_webpage=True',
          '-o', outputTemplate,
          youtubeUrl
        ];
        
        await executeYtDlp(advancedOptions);
        console.log(`[${new Date().toISOString()}] Abordagem 3 bem-sucedida!`);
        return { success: true };
      } catch (error3) {
        console.log(`[${new Date().toISOString()}] Abordagem 3 falhou: ${error3.message}`);
        
        // Abordagem 4: YouTube Music
        try {
          console.log(`[${new Date().toISOString()}] Tentando abordagem 4: YouTube Music`);
          const ytMusicUrl = youtubeUrl.replace('youtube.com', 'music.youtube.com');
          console.log(`[${new Date().toISOString()}] Usando URL do YouTube Music: ${ytMusicUrl}`);
          
          const ytMusicOptions = [
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '--no-warnings',
            '--no-check-certificate',
            '--geo-bypass',
            '--ignore-errors',
            '--no-playlist',
            '--proxy', proxyUrl,
            '--limit-rate', '500K',
            '--user-agent', userAgent,
            '-o', outputTemplate,
            ytMusicUrl
          ];
          
          await executeYtDlp(ytMusicOptions);
          console.log(`[${new Date().toISOString()}] Abordagem 4 bem-sucedida!`);
          return { success: true };
        } catch (error4) {
          console.log(`[${new Date().toISOString()}] Abordagem 4 falhou: ${error4.message}`);
          
          // Abordagem 5: Piped.video
          try {
            console.log(`[${new Date().toISOString()}] Tentando abordagem 5: Piped.video`);
            const pipedUrl = `https://piped.video/watch?v=${videoId}`;
            console.log(`[${new Date().toISOString()}] Usando URL do Piped: ${pipedUrl}`);
            
            const pipedOptions = [
              '--extract-audio',
              '--audio-format', 'mp3',
              '--audio-quality', '0',
              '--no-warnings',
              '--no-check-certificate',
              '--geo-bypass',
              '--ignore-errors',
              '--no-playlist',
              '--proxy', proxyUrl,
              '--limit-rate', '500K',
              '--user-agent', userAgent,
              '--force-ipv4',
              '-o', outputTemplate,
              pipedUrl
            ];
            
            await executeYtDlp(pipedOptions);
            console.log(`[${new Date().toISOString()}] Abordagem 5 bem-sucedida!`);
            return { success: true };
          } catch (error5) {
            console.log(`[${new Date().toISOString()}] Abordagem 5 falhou: ${error5.message}`);
            throw new Error('Todas as abordagens de download falharam. O YouTube está bloqueando acessos automatizados.');
          }
        }
      }
    }
  }
}

// Função para obter informações do vídeo com tratamento de erros
async function getVideoInfo(youtubeUrl) {
  try {
    console.log(`[${new Date().toISOString()}] Buscando informações do vídeo: ${youtubeUrl}`);
    
    let videoId = '';
    if (youtubeUrl.includes('youtube.com/watch?v=')) {
      videoId = new URL(youtubeUrl).searchParams.get('v');
    } else if (youtubeUrl.includes('youtu.be/')) {
      videoId = youtubeUrl.split('youtu.be/')[1].split('?')[0];
    }
    
    if (!videoId) {
      throw new Error('Não foi possível extrair o ID do vídeo');
    }
    
    const proxyUrl = `http://${process.env.IPROYAL_USERNAME}:${process.env.IPROYAL_PASSWORD}@geo.iproyal.com:12321`;
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    
    try {
      console.log(`[${new Date().toISOString()}] Tentando obter informações via proxy residencial`);
      const info = await youtubedl(youtubeUrl, {
        dumpSingleJson: true,
        noWarnings: true,
        noCallHome: true,
        proxy: proxyUrl,
        userAgent: userAgent,
        noCheckCertificate: true,
        geoBypass: true,
        noPlaylist: true
      });
      
      return info;
    } catch (err) {
      console.log(`[${new Date().toISOString()}] Falha ao obter informações via proxy residencial: ${err.message}`);
      try {
        console.log(`[${new Date().toISOString()}] Tentando obter informações via Invidious`);
        const invidiousUrl = `https://yewtu.be/watch?v=${videoId}`;
        const info = await youtubedl(invidiousUrl, {
          dumpSingleJson: true,
          noWarnings: true,
          noCallHome: true,
          proxy: proxyUrl,
          userAgent: userAgent,
          noCheckCertificate: true,
          geoBypass: true,
          noPlaylist: true
        });
        return info;
      } catch (err2) {
        console.log(`[${new Date().toISOString()}] Falha ao obter informações via Invidious: ${err2.message}`);
        try {
          const info = await youtubedl(youtubeUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            preferFreeFormats: true,
            youtubeSkipDashManifest: true,
            proxy: proxyUrl,
            userAgent: userAgent,
            noCheckCertificate: true,
            geoBypass: true,
            noPlaylist: true,
            skipDownload: true
          });
          return info;
        } catch (err3) {
          console.log(`[${new
