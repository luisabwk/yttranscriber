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

// Tempo de expiração (em milissegundos) - 1 hora
const EXPIRATION_TIME = 60 * 60 * 1000;

// Armazenamento de arquivos temporários e transcrições
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
const MAX_CONCURRENT_JOBS = 1; // Em droplet com 1 vCPU, limite para 1 job simultâneo

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

// Rota para iniciar a conversão
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
    // Obter informações do vídeo e atualizar título e canal
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
    // Enfileira a tarefa de conversão
    enqueueJob(async () => {
      try {
        // Baixar vídeo e extrair áudio
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
        // Configurar limpeza após expiração
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
    // Responde imediatamente
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
// Iniciar o servidor
// ----------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Servidor rodando na porta ${PORT}`);
});

// Exportar app para testes
module.exports = app;
