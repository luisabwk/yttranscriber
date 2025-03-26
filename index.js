// yttranscriber/index.js
require('dotenv').config(); // Carregar variáveis do arquivo .env

const express = require('express');
const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const axios = require('axios');
const puppeteer = require('puppeteer'); // Para obter dados renderizados via Puppeteer

const app = express();
const PORT = process.env.PORT || 3000;

// Função para validar URL do YouTube
function validateYouTubeUrl(url) {
  return url.includes('youtube.com/') || url.includes('youtu.be/');
}

// Função auxiliar para interpretar a contagem de inscritos com abreviações
function parseSubscriberCount(text) {
  // Regex para capturar o valor numérico e o sufixo opcional (m ou k)
  const regex = /([\d.,]+)\s*([mk])?/i;
  const match = text.match(regex);
  if (match) {
    const num = parseFloat(match[1].replace(',', '.'));
    let multiplier = 1;
    if (match[2]) {
      const suffix = match[2].toLowerCase();
      if (suffix === 'm') {
        multiplier = 1000000;
      } else if (suffix === 'k') {
        multiplier = 1000;
      }
    }
    return Math.round(num * multiplier);
  }
  return 0;
}

// Função para buscar o número de inscritos usando Puppeteer a partir da página do vídeo
async function fetchChannelSubscribersWithPuppeteer(videoUrl) {
  let browser;
  try {
    console.log(`[${new Date().toISOString()}] Puppeteer - Iniciando navegador para ${videoUrl}`);
    browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(videoUrl, { waitUntil: 'networkidle2' });
    // Aguarda que o seletor esteja presente (timeout de 15 segundos)
    await page.waitForSelector('#owner-sub-count', { timeout: 15000 });
    const subText = await page.$eval('#owner-sub-count', el => el.textContent);
    console.log(`[${new Date().toISOString()}] Puppeteer - Texto obtido de #owner-sub-count: "${subText}"`);
    const count = parseSubscriberCount(subText);
    console.log(`[${new Date().toISOString()}] Puppeteer - Número de inscritos extraído: ${count}`);
    return count;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Puppeteer - Erro ao extrair inscritos: ${error.message}`);
    return 0;
  } finally {
    if (browser) await browser.close();
  }
}

// Pasta para armazenar os arquivos temporários
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Tempo de expiração (em milissegundos) - 1 hora
const EXPIRATION_TIME = 60 * 60 * 1000;

// Armazenamento de arquivos temporários, tarefas pendentes e transcrições
const tempFiles = new Map();
const pendingTasks = new Map();
const transcriptions = new Map();

// Configurações da API Assembly AI e transcrição
const ASSEMBLY_API_KEY = process.env.ASSEMBLY_API_KEY || 'SUA_CHAVE_DA_API_AQUI';
const ENABLE_TRANSCRIPTION = process.env.ENABLE_TRANSCRIPTION === 'true' || false;

// ----------------------------------------------------------------
// Fila de Conversão (Job Queue) e Controle de Concorrência
// ----------------------------------------------------------------
const conversionQueue = [];
let activeJobs = 0;
const MAX_CONCURRENT_JOBS = 1; // Para droplet com 1 vCPU

function enqueueJob(job) {
  conversionQueue.push(job);
  processQueue();
}

async function processQueue() {
  if (activeJobs < MAX_CONCURRENT_JOBS && conversionQueue.length > 0) {
    activeJobs++;
    const job = conversionQueue.shift();
    try {
      await job();
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Erro no job:`, e);
    }
    activeJobs--;
    processQueue();
  }
}

// ----------------------------------------------------------------
// Middlewares
// ----------------------------------------------------------------
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// ----------------------------------------------------------------
// Rotas
// ----------------------------------------------------------------

// Rota para download do arquivo
app.get('/download/:fileId', (req, res) => {
  const { fileId } = req.params;
  if (!tempFiles.has(fileId)) {
    return res.status(404).json({ error: 'Arquivo não encontrado ou expirado' });
  }
  const fileInfo = tempFiles.get(fileId);
  if (!fs.existsSync(fileInfo.path)) {
    tempFiles.delete(fileId);
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }
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

// Rota de status geral da API
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.1.0',
    message: 'API funcionando normalmente'
  });
});

// Rota para obter a transcrição com a estrutura solicitada
app.get('/transcription/:fileId', (req, res) => {
  const { fileId } = req.params;
  if (!transcriptions.has(fileId)) {
    return res.status(404).json({ error: 'Transcrição não encontrada ou expirada' });
  }
  const transcription = transcriptions.get(fileId);
  if (Date.now() > transcription.expiresAt) {
    transcriptions.delete(fileId);
    return res.status(404).json({ error: 'Transcrição expirada' });
  }
  return res.json({
    videoTitle: transcription.videoTitle,
    channel: transcription.channel,
    transcription: transcription.text
  });
});

// Rota para verificar o status de uma tarefa
app.get('/status/:taskId', (req, res) => {
  const { taskId } = req.params;
  const includeTranscription = req.query.includeTranscription === 'true';
  if (!pendingTasks.has(taskId)) {
    if (tempFiles.has(taskId)) {
      const response = {
        status: 'completed',
        downloadUrl: `/download/${taskId}`,
        expiresAt: new Date(tempFiles.get(taskId).expiresAt).toISOString()
      };
      if (includeTranscription && transcriptions.has(taskId)) {
        response.transcription = {
          text: transcriptions.get(taskId).text,
          language: transcriptions.get(taskId).language,
          completedAt: new Date(transcriptions.get(taskId).created).toISOString()
        };
      }
      return res.json(response);
    }
    return res.status(404).json({ error: 'Tarefa não encontrada' });
  }
  const taskInfo = pendingTasks.get(taskId);
  const response = {
    taskId,
    status: taskInfo.status,
    title: taskInfo.title,
    created: new Date(taskInfo.created).toISOString(),
    downloadUrl: taskInfo.status === 'completed' ? taskInfo.downloadUrl : null,
    error: taskInfo.error || null
  };
  if (taskInfo.transcriptionRequested) {
    response.transcriptionRequested = true;
    response.transcriptionStatus = taskInfo.transcriptionStatus;
    response.detectedLanguage = taskInfo.detectedLanguage || null;
    if (taskInfo.hasTranscription && includeTranscription && transcriptions.has(taskId)) {
      response.transcription = {
        text: transcriptions.get(taskId).text,
        language: transcriptions.get(taskId).language,
        completedAt: new Date(transcriptions.get(taskId).created).toISOString()
      };
    }
    if (taskInfo.transcriptionStatus === 'completed') {
      response.transcriptionUrl = taskInfo.transcriptionUrl;
    }
    if (taskInfo.transcriptionError) {
      response.transcriptionError = taskInfo.transcriptionError;
    }
  }
  res.json(response);
});

// Novo Endpoint /stats para buscar estatísticas do vídeo
// Aqui usamos os metadados do yt-dlp para a maioria dos dados e, para o número de inscritos,
// usamos o Puppeteer para extrair o conteúdo do seletor "#owner-sub-count" na página do vídeo,
// e a função parseSubscriberCount para interpretar valores como "1.46M".
app.post('/stats', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] /stats - Requisição recebida para ${req.body.youtubeUrl}`);
    const { youtubeUrl } = req.body;
    if (!youtubeUrl) {
      console.log(`[${new Date().toISOString()}] /stats - URL do YouTube não fornecida`);
      return res.status(400).json({ error: 'URL do YouTube é obrigatória' });
    }
    if (!validateYouTubeUrl(youtubeUrl)) {
      console.log(`[${new Date().toISOString()}] /stats - URL inválida: ${youtubeUrl}`);
      return res.status(400).json({ error: 'URL do YouTube inválida' });
    }
    
    // Obter metadados do vídeo usando yt-dlp
    const info = await getVideoInfo(youtubeUrl);
    console.log(`[${new Date().toISOString()}] /stats - Metadados obtidos:`, info);

    // Formatar a data de publicação (assumindo formato YYYYMMDD)
    let uploadDate = 'Unknown';
    if (info.upload_date && info.upload_date.length === 8) {
      uploadDate = `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6)}`;
      console.log(`[${new Date().toISOString()}] /stats - Data de publicação: ${uploadDate}`);
    }
    
    // Obter o número de inscritos usando Puppeteer e converter valores abreviados corretamente
    const subscriberCount = await fetchChannelSubscribersWithPuppeteer(youtubeUrl);
    console.log(`[${new Date().toISOString()}] /stats - Subscriber count (via Puppeteer): ${subscriberCount}`);
    
    const stats = {
      videoTitle: info.title || 'Unknown',
      description: info.description || 'No description',
      views: info.view_count || 0,
      likes: info.like_count || 0,
      dislikes: info.dislike_count || 0,
      commentCount: info.comment_count || 0,
      subscriberCount: subscriberCount,
      uploadDate: uploadDate
    };
    console.log(`[${new Date().toISOString()}] /stats - Dados finais:`, stats);
    return res.json(stats);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] /stats - Erro ao buscar estatísticas:`, error);
    return res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
});

// Rota /convert para processar a solicitação usando a fila
app.post('/convert', async (req, res) => {
  try {
    const { youtubeUrl, transcribe } = req.body;
    if (!youtubeUrl) {
      return res.status(400).json({ error: 'URL do YouTube é obrigatória' });
    }
    if (!validateYouTubeUrl(youtubeUrl)) {
      return res.status(400).json({ error: 'URL do YouTube inválida' });
    }
    console.log(`[${new Date().toISOString()}] Processando URL: ${youtubeUrl}`);
    const fileId = uuidv4();
    const videoPath = path.join(TEMP_DIR, `${fileId}.mp4`);
    const audioPath = path.join(TEMP_DIR, `${fileId}.mp3`);
    const shouldTranscribe = (transcribe === true || transcribe === 'true') && ENABLE_TRANSCRIPTION;
    let videoTitle = `YouTube Video - ${fileId}`;
    let taskStatus = 'pending';
    pendingTasks.set(fileId, {
      status: taskStatus,
      title: videoTitle,
      channel: 'Unknown',
      url: youtubeUrl,
      created: Date.now(),
      downloadUrl: `/download/${fileId}`,
      transcriptionRequested: shouldTranscribe,
      transcriptionStatus: shouldTranscribe ? 'pending' : null,
      hasTranscription: false
    });
    try {
      const videoInfo = await getVideoInfo(youtubeUrl);
      videoTitle = videoInfo.title || `YouTube Video - ${fileId}`;
      const channel = videoInfo.uploader || videoInfo.channel || 'Unknown';
      if (pendingTasks.has(fileId)) {
        const taskInfo = pendingTasks.get(fileId);
        taskInfo.title = videoTitle;
        taskInfo.channel = channel;
        pendingTasks.set(fileId, taskInfo);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Erro ao obter informações do vídeo:`, error);
    }
    enqueueJob(async () => {
      try {
        await downloadYouTubeAudio(youtubeUrl, videoPath);
        const possiblePaths = [
          videoPath,
          videoPath.replace('.mp4', '.mp3'),
          videoPath.replace('.mp4', '.m4a'),
          videoPath.replace('.mp4', '.webm')
        ];
        let existingFile = null;
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            existingFile = p;
            break;
          }
        }
        if (!existingFile) {
          throw new Error('Arquivo baixado não encontrado. O download falhou.');
        }
        if (!existingFile.endsWith('.mp3')) {
          await new Promise((resolve, reject) => {
            ffmpeg(existingFile)
              .outputOptions('-q:a', '0')
              .saveToFile(audioPath)
              .on('end', () => {
                try {
                  fs.unlinkSync(existingFile);
                } catch (err) {
                  console.error(`[${new Date().toISOString()}] Erro ao remover arquivo original:`, err);
                }
                resolve();
              })
              .on('error', reject);
          });
        } else {
          fs.renameSync(existingFile, audioPath);
        }
        const sanitizedTitle = videoTitle.replace(/[^\w\s]/gi, '');
        tempFiles.set(fileId, {
          path: audioPath,
          filename: `${sanitizedTitle}.mp3`,
          expiresAt: Date.now() + EXPIRATION_TIME
        });
        if (pendingTasks.has(fileId)) {
          const taskInfo = pendingTasks.get(fileId);
          taskInfo.status = 'completed';
          pendingTasks.set(fileId, taskInfo);
        }
        if (shouldTranscribe) {
          console.log(`[${new Date().toISOString()}] Iniciando processo de transcrição para ${fileId}`);
          transcribeAudio(audioPath, fileId).then(transcriptResult => {
            console.log(`[${new Date().toISOString()}] Resultado da transcrição:`, transcriptResult.success ? 'Sucesso' : 'Falha');
          }).catch(err => {
            console.error(`[${new Date().toISOString()}] Erro ao iniciar transcrição:`, err);
          });
        }
        setTimeout(() => {
          if (tempFiles.has(fileId)) {
            const fileInfo = tempFiles.get(fileId);
            if (fs.existsSync(fileInfo.path)) {
              fs.unlinkSync(fileInfo.path);
            }
            tempFiles.delete(fileId);
          }
          if (pendingTasks.has(fileId)) {
            pendingTasks.delete(fileId);
          }
          if (transcriptions.has(fileId)) {
            transcriptions.delete(fileId);
          }
        }, EXPIRATION_TIME);
        console.log(`[${new Date().toISOString()}] Processamento concluído para ${fileId}`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Erro no processamento:`, error);
        if (pendingTasks.has(fileId)) {
          const taskInfo = pendingTasks.get(fileId);
          taskInfo.status = 'failed';
          taskInfo.error = error.message;
          pendingTasks.set(fileId, taskInfo);
        }
      }
    });
    const response = {
      success: true,
      message: 'Tarefa de download iniciada',
      taskId: fileId,
      statusUrl: `/status/${fileId}`,
      downloadUrl: `/download/${fileId}`,
      estimatedDuration: 'Alguns minutos, dependendo do tamanho do vídeo'
    };
    if (shouldTranscribe) {
      response.transcriptionRequested = true;
      response.transcriptionStatus = 'pending';
      response.transcriptionUrl = `/transcription/${fileId}`;
      response.message += '. Transcrição será processada automaticamente após o download.';
    }
    res.json(response);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Erro ao iniciar processo:`, error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
});

// ----------------------------------------------------------------
// Funções Auxiliares
// ----------------------------------------------------------------

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
  
  // Abordagem 1: Proxy Residencial iProyal
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
    // Abordagem 2: Instâncias Invidious
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

// ----------------------------------------------------------------
// Função para obter informações do vídeo
// ----------------------------------------------------------------
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
          console.log(`[${new Date().toISOString()}] Todas as tentativas de obter informações falharam`);
          throw err3;
        }
      }
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Erro ao obter informações do vídeo:`, error);
    return { title: `YouTube Video - ${videoId || 'Unknown'}` };
  }
}

// ----------------------------------------------------------------
// Função para transcrever áudio usando Assembly AI
// ----------------------------------------------------------------
async function transcribeAudio(audioFilePath, fileId) {
  try {
    console.log(`[${new Date().toISOString()}] Iniciando transcrição para ${fileId}`);
    if (!ENABLE_TRANSCRIPTION || !ASSEMBLY_API_KEY || ASSEMBLY_API_KEY === 'SUA_CHAVE_DA_API_AQUI') {
      console.log(`[${new Date().toISOString()}] Transcrição desativada ou chave da API não configurada`);
      return {
        success: false,
        message: 'Transcrição desativada ou chave da API não configurada'
      };
    }
    if (pendingTasks.has(fileId)) {
      const taskInfo = pendingTasks.get(fileId);
      taskInfo.transcriptionStatus = 'uploading';
      pendingTasks.set(fileId, taskInfo);
    }
    const audioFile = fs.readFileSync(audioFilePath);
    const audioSize = fs.statSync(audioFilePath).size;
    console.log(`[${new Date().toISOString()}] Tamanho do arquivo de áudio: ${audioSize} bytes`);
    const uploadResponse = await axios.post('https://api.assemblyai.com/v2/upload', audioFile, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Authorization': ASSEMBLY_API_KEY
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    const audioUrl = uploadResponse.data.upload_url;
    console.log(`[${new Date().toISOString()}] Áudio enviado com sucesso para Assembly AI: ${audioUrl}`);
    if (pendingTasks.has(fileId)) {
      const taskInfo = pendingTasks.get(fileId);
      taskInfo.transcriptionStatus = 'processing';
      pendingTasks.set(fileId, taskInfo);
    }
    const transcriptResponse = await axios.post('https://api.assemblyai.com/v2/transcript', {
      audio_url: audioUrl,
      language_detection: true
    }, {
      headers: {
        'Authorization': ASSEMBLY_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    const transcriptId = transcriptResponse.data.id;
    console.log(`[${new Date().toISOString()}] Transcrição iniciada com ID: ${transcriptId}`);
    let transcriptResult;
    let isCompleted = false;
    while (!isCompleted) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const checkResponse = await axios.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: {
          'Authorization': ASSEMBLY_API_KEY
        }
      });
      const status = checkResponse.data.status;
      console.log(`[${new Date().toISOString()}] Status da transcrição: ${status}`);
      if (status === 'completed') {
        isCompleted = true;
        transcriptResult = checkResponse.data;
      } else if (status === 'error') {
        throw new Error(`Erro na transcrição: ${checkResponse.data.error}`);
      }
    }
    const transcriptionText = transcriptResult.text;
    const detectedLanguage = transcriptResult.language_code || 'Não detectado';
    const taskInfo = pendingTasks.get(fileId) || {};
    const videoTitle = taskInfo.title || `YouTube Video - ${fileId}`;
    const channel = taskInfo.channel || 'Unknown';
    transcriptions.set(fileId, {
      text: transcriptionText,
      raw: transcriptResult,
      language: detectedLanguage,
      created: Date.now(),
      expiresAt: Date.now() + EXPIRATION_TIME,
      videoTitle,
      channel
    });
    if (pendingTasks.has(fileId)) {
      const taskInfo = pendingTasks.get(fileId);
      taskInfo.transcriptionStatus = 'completed';
      taskInfo.hasTranscription = true;
      taskInfo.transcriptionUrl = `/transcription/${fileId}`;
      taskInfo.detectedLanguage = detectedLanguage;
      pendingTasks.set(fileId, taskInfo);
    }
    console.log(`[${new Date().toISOString()}] Transcrição concluída com sucesso para ${fileId} no idioma ${detectedLanguage}`);
    return {
      success: true,
      transcription: transcriptionText,
      language: detectedLanguage
    };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Erro na transcrição:`, error.message);
    if (pendingTasks.has(fileId)) {
      const taskInfo = pendingTasks.get(fileId);
      taskInfo.transcriptionStatus = 'failed';
      taskInfo.transcriptionError = error.message;
      pendingTasks.set(fileId, taskInfo);
    }
    return {
      success: false,
      error: error.message
    };
  }
}

// ----------------------------------------------------------------
// Iniciar o servidor
// ----------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Servidor rodando na porta ${PORT}`);
});

// Exportar app para testes
module.exports = app;
