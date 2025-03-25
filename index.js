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

// Armazenamento de arquivos temporários
const tempFiles = new Map();

// Adicionar um mapa para rastrear tarefas em andamento
const pendingTasks = new Map();

// Configuração da API Assembly AI
const ASSEMBLY_API_KEY = process.env.ASSEMBLY_API_KEY || 'SUA_CHAVE_DA_API_AQUI';
const ENABLE_TRANSCRIPTION = process.env.ENABLE_TRANSCRIPTION === 'true' || false;

// Armazenar as transcrições
const transcriptions = new Map();

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

// Limpar arquivos temporários periodicamente
setInterval(() => {
  const now = Date.now();
  let countRemoved = 0;
  let transcriptionsRemoved = 0;
  
  // Limpar arquivos de áudio
  for (const [fileId, fileInfo] of tempFiles.entries()) {
    if (now > fileInfo.expiresAt) {
      if (fs.existsSync(fileInfo.path)) {
        fs.unlinkSync(fileInfo.path);
        countRemoved++;
      }
      tempFiles.delete(fileId);
      
      // Remover tarefas relacionadas
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
}, 15 * 60 * 1000); // Verificar a cada 15 minutos

// Exportar app para testes
module.exports = app;

// Função para validar URL do YouTube
function validateYouTubeUrl(url) {
  return url.includes('youtube.com/') || url.includes('youtu.be/');
}

// Função para executar comandos do yt-dlp diretamente com mais controle
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
  
  // Configure o proxy com as credenciais fornecidas do arquivo .env
  const proxyUrl = `http://${process.env.IPROYAL_USERNAME}:${process.env.IPROYAL_PASSWORD}@geo.iproyal.com:12321`;
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  
  // Extrair ID do vídeo para uso em várias abordagens
  let videoId = '';
  if (youtubeUrl.includes('youtube.com/watch?v=')) {
    videoId = new URL(youtubeUrl).searchParams.get('v');
  } else if (youtubeUrl.includes('youtu.be/')) {
    videoId = youtubeUrl.split('youtu.be/')[1].split('?')[0];
  }
  
  if (!videoId) {
    throw new Error('Não foi possível extrair o ID do vídeo');
  }
  
  // Abordagem 1: Usar proxy residencial iproyal
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
      '--limit-rate', '500K', // Limitando a taxa de download para evitar detecção
      '--user-agent', userAgent, // User agent mais comum
      '-o', outputTemplate,
      youtubeUrl
    ];
    
    await executeYtDlp(proxyOptions);
    console.log(`[${new Date().toISOString()}] Abordagem com proxy residencial bem-sucedida!`);
    return { success: true };
  } catch (errorProxy) {
    console.log(`[${new Date().toISOString()}] Abordagem com proxy residencial falhou: ${errorProxy.message}`);
    
    // Abordagem 2: Tentar proxy Invidious
    try {
      console.log(`[${new Date().toISOString()}] Tentando abordagem 2: Proxy Invidious`);
      
      // Verificar se tem transcrição e se foi solicitada inclusão
      if (includeTranscription && transcriptions.has(taskId)) {
        response.transcription = {
          text: transcriptions.get(taskId).text,
          language: transcriptions.get(taskId).language,
          completedAt: new Date(transcriptions.get(taskId).created).toISOString()
        };
      }
      
      return res.json(response);
});

// Rota para obter a transcrição
app.get('/transcription/:fileId', (req, res) => {
  const { fileId } = req.params;
  const format = req.query.format || 'text'; // Formato padrão: texto simples
  
  if (!transcriptions.has(fileId)) {
    return res.status(404).json({ error: 'Transcrição não encontrada ou expirada' });
  }
  
  const transcription = transcriptions.get(fileId);
  
  // Verificar se a transcrição expirou
  if (Date.now() > transcription.expiresAt) {
    transcriptions.delete(fileId);
    return res.status(404).json({ error: 'Transcrição expirada' });
  }
  
  // Retornar no formato solicitado
  switch (format.toLowerCase()) {
    case 'json':
      return res.json({
        text: transcription.text,
        language: transcription.language,
        created: new Date(transcription.created).toISOString(),
        expiresAt: new Date(transcription.expiresAt).toISOString()
      });
    case 'text':
    default:
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(transcription.text);
  }
});
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
  
  // Adicionar informações de transcrição se solicitado
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
}); Lista de instâncias Invidious para tentar
      const invidiousInstances = [
        'yewtu.be',
        'invidious.snopyta.org',
        'vid.puffyan.us',
        'invidious.kavin.rocks',
        'invidious.namazso.eu',
        'inv.riverside.rocks'
      ];
      
      // Tentar cada instância
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
            '--proxy', proxyUrl, // Usar proxy residencial para Invidious
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
          // Continue para a próxima instância
        }
      }
      
      throw new Error('Todas as instâncias Invidious falharam');
    } catch (error3) {
      console.log(`[${new Date().toISOString()}] Abordagem 2 (Invidious) falhou: ${error3.message}`);
      
      // Abordagem 3: Tentar com o modo nativo e configurações avançadas
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
          '--proxy', proxyUrl, // Usar proxy residencial
          '--limit-rate', '500K',
          '--user-agent', userAgent,
          '--extractor-args', 'youtube:skip_webpage=True',
          '-o', outputTemplate,
          youtubeUrl
        ];
        
        await executeYtDlp(advancedOptions);
        console.log(`[${new Date().toISOString()}] Abordagem 3 bem-sucedida!`);
        return { success: true };
      } catch (error4) {
        console.log(`[${new Date().toISOString()}] Abordagem 3 falhou: ${error4.message}`);
        
        // Abordagem 4: Tentar YouTube Music
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
            '--proxy', proxyUrl, // Usar proxy residencial
            '--limit-rate', '500K',
            '--user-agent', userAgent,
            '-o', outputTemplate,
            ytMusicUrl
          ];
          
          await executeYtDlp(ytMusicOptions);
          console.log(`[${new Date().toISOString()}] Abordagem 4 bem-sucedida!`);
          return { success: true };
        } catch (error5) {
          console.log(`[${new Date().toISOString()}] Abordagem 4 falhou: ${error5.message}`);
          
          // Abordagem 5: tentativa final com Piped (outro front-end alternativo)
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
              '--proxy', proxyUrl, // Usar proxy residencial
              '--limit-rate', '500K',
              '--user-agent', userAgent,
              '--force-ipv4',
              '-o', outputTemplate,
              pipedUrl
            ];
            
            await executeYtDlp(pipedOptions);
            console.log(`[${new Date().toISOString()}] Abordagem 5 bem-sucedida!`);
            return { success: true };
          } catch (error6) {
            console.log(`[${new Date().toISOString()}] Abordagem 5 falhou: ${error6.message}`);
            throw new Error('Todas as abordagens de download falharam. O YouTube está bloqueando acessos automatizados.');
          }
        }
      }
    }
  }
}

// Função para obter informações do vídeo (com tratamento de erro avançado)
async function getVideoInfo(youtubeUrl) {
  try {
    console.log(`[${new Date().toISOString()}] Buscando informações do vídeo: ${youtubeUrl}`);
    
    // Extrair ID do vídeo
    let videoId = '';
    if (youtubeUrl.includes('youtube.com/watch?v=')) {
      videoId = new URL(youtubeUrl).searchParams.get('v');
    } else if (youtubeUrl.includes('youtu.be/')) {
      videoId = youtubeUrl.split('youtu.be/')[1].split('?')[0];
    }
    
    if (!videoId) {
      throw new Error('Não foi possível extrair o ID do vídeo');
    }
    
    // Configuração do proxy residencial do arquivo .env
    const proxyUrl = `http://${process.env.IPROYAL_USERNAME}:${process.env.IPROYAL_PASSWORD}@geo.iproyal.com:12321`;
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    
    // Primeira tentativa: usar proxy residencial
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
      
      // Tentar através de Invidious como fallback
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
        
        // Tente diretamente com flags especiais como fallback
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
    
    // Se não conseguir obter informações, retorne um objeto com título genérico
    return {
      title: `YouTube Video - ${videoId || 'Unknown'}`
    };
  }
}

// Função para transcrever áudio usando Assembly AI
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

    // Atualizar o status da tarefa
    if (pendingTasks.has(fileId)) {
      const taskInfo = pendingTasks.get(fileId);
      taskInfo.transcriptionStatus = 'uploading';
      pendingTasks.set(fileId, taskInfo);
    }

    // Ler o arquivo de áudio
    const audioFile = fs.readFileSync(audioFilePath);
    const audioSize = fs.statSync(audioFilePath).size;
    console.log(`[${new Date().toISOString()}] Tamanho do arquivo de áudio: ${audioSize} bytes`);

    // Upload do áudio para Assembly AI
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

    // Atualizar status
    if (pendingTasks.has(fileId)) {
      const taskInfo = pendingTasks.get(fileId);
      taskInfo.transcriptionStatus = 'processing';
      pendingTasks.set(fileId, taskInfo);
    }

    // Iniciar a transcrição
    const transcriptResponse = await axios.post('https://api.assemblyai.com/v2/transcript', {
      audio_url: audioUrl,
      language_detection: true // Detectar automaticamente o idioma
    }, {
      headers: {
        'Authorization': ASSEMBLY_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const transcriptId = transcriptResponse.data.id;
    console.log(`[${new Date().toISOString()}] Transcrição iniciada com ID: ${transcriptId}`);

    // Verificar o status da transcrição até que esteja completa
    let transcriptResult;
    let isCompleted = false;
    
    while (!isCompleted) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Esperar 3 segundos entre verificações
      
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

    // Obter o texto da transcrição (sem formatação markdown)
    const transcriptionText = transcriptResult.text;
    const detectedLanguage = transcriptResult.language_code || 'Não detectado';
    
    // Salvar a transcrição como texto simples
    transcriptions.set(fileId, {
      text: transcriptionText,
      raw: transcriptResult,
      language: detectedLanguage,
      created: Date.now(),
      expiresAt: Date.now() + EXPIRATION_TIME
    });

    // Atualizar o status da tarefa
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
    
    // Atualizar o status da tarefa
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

// Modificar a rota /convert para processar a solicitação em segundo plano
app.post('/convert', async (req, res) => {
  try {
    const { youtubeUrl, transcribe } = req.body;
    
    if (!youtubeUrl) {
      return res.status(400).json({ error: 'URL do YouTube é obrigatória' });
    }
    
    // Validar a URL do YouTube
    if (!validateYouTubeUrl(youtubeUrl)) {
      return res.status(400).json({ error: 'URL do YouTube inválida' });
    }
    
    console.log(`[${new Date().toISOString()}] Processando URL: ${youtubeUrl}`);
    
    // Gerar ID único para o arquivo e a tarefa
    const fileId = uuidv4();
    const videoPath = path.join(TEMP_DIR, `${fileId}.mp4`);
    const audioPath = path.join(TEMP_DIR, `${fileId}.mp3`);
    
    // Verificar se a transcrição foi solicitada
    const shouldTranscribe = (transcribe === true || transcribe === 'true') && ENABLE_TRANSCRIPTION;
    
    // Obter informações básicas do vídeo, mas não esperar pela conclusão completa
    let videoTitle = `YouTube Video - ${fileId}`;
    let taskStatus = 'pending';
    
    // Registrar a tarefa como pendente
    pendingTasks.set(fileId, {
      status: taskStatus,
      title: videoTitle,
      url: youtubeUrl,
      created: Date.now(),
      downloadUrl: `/download/${fileId}`,
      transcriptionRequested: shouldTranscribe,
      transcriptionStatus: shouldTranscribe ? 'pending' : null,
      hasTranscription: false
    });
    
    // Iniciar o processo de download em segundo plano
    (async () => {
      try {
        // Obter informações do vídeo
        try {
          const videoInfo = await getVideoInfo(youtubeUrl);
          videoTitle = videoInfo.title || `YouTube Video - ${fileId}`;
          const sanitizedTitle = videoTitle.replace(/[^\w\s]/gi, '');
          
          // Atualizar o título da tarefa
          if (pendingTasks.has(fileId)) {
            const taskInfo = pendingTasks.get(fileId);
            taskInfo.title = videoTitle;
            pendingTasks.set(fileId, taskInfo);
          }
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Erro ao obter informações do vídeo:`, error);
        }
        
        // Baixar o vídeo
        await downloadYouTubeAudio(youtubeUrl, videoPath);
        
        // Verificar se o arquivo foi baixado
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
        
        // Se o arquivo baixado não for MP3, converter para MP3
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
        
        // Armazenar informações do arquivo no mapa de arquivos temporários
        const sanitizedTitle = videoTitle.replace(/[^\w\s]/gi, '');
        tempFiles.set(fileId, {
          path: audioPath,
          filename: `${sanitizedTitle}.mp3`,
          expiresAt: Date.now() + EXPIRATION_TIME
        });
        
        // Marcar a tarefa de download como concluída
        if (pendingTasks.has(fileId)) {
          const taskInfo = pendingTasks.get(fileId);
          taskInfo.status = 'completed';
          pendingTasks.set(fileId, taskInfo);
        }
        
        // Iniciar transcrição se solicitado
        if (shouldTranscribe) {
          console.log(`[${new Date().toISOString()}] Iniciando processo de transcrição para ${fileId}`);
          
          // Não aguardar a conclusão da transcrição, executar em segundo plano
          transcribeAudio(audioPath, fileId).then(transcriptResult => {
            console.log(`[${new Date().toISOString()}] Resultado da transcrição:`, 
                       transcriptResult.success ? 'Sucesso' : 'Falha');
          }).catch(err => {
            console.error(`[${new Date().toISOString()}] Erro ao iniciar transcrição:`, err);
          });
        }
        
        // Configurar limpeza do arquivo
        setTimeout(() => {
          if (tempFiles.has(fileId)) {
            const fileInfo = tempFiles.get(fileId);
            if (fs.existsSync(fileInfo.path)) {
              fs.unlinkSync(fileInfo.path);
            }
            tempFiles.delete(fileId);
          }
          // Também remover da lista de tarefas pendentes
          if (pendingTasks.has(fileId)) {
            pendingTasks.delete(fileId);
          }
          // Remover transcrição
          if (transcriptions.has(fileId)) {
            transcriptions.delete(fileId);
          }
        }, EXPIRATION_TIME);
        
        console.log(`[${new Date().toISOString()}] Processamento concluído para ${fileId}`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Erro no processamento:`, error);
        // Marcar a tarefa como falha
        if (pendingTasks.has(fileId)) {
          const taskInfo = pendingTasks.get(fileId);
          taskInfo.status = 'failed';
          taskInfo.error = error.message;
          pendingTasks.set(fileId, taskInfo);
        }
      }
    })();
    
    // Responder imediatamente com o ID da tarefa e URL de status
    const response = {
      success: true,
      message: 'Tarefa de download iniciada',
      taskId: fileId,
      statusUrl: `/status/${fileId}`,
      downloadUrl: `/download/${fileId}`,
      estimatedDuration: 'Alguns minutos, dependendo do tamanho do vídeo'
    };
    
    // Adicionar informações de transcrição se solicitada
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

// Adicionar rota para verificar o status da tarefa
app.get('/status/:taskId', (req, res) => {
  const { taskId } = req.params;
  const includeTranscription = req.query.includeTranscription === 'true';
  
  if (!pendingTasks.has(taskId)) {
    // Verificar se já foi concluído e está disponível para download
    if (tempFiles.has(taskId)) {
      const response = {
        status: 'completed',
        downloadUrl: `/download/${taskId}`,
        expiresAt: new Date(tempFiles.get(taskId).expiresAt).toISOString()
      };
      
      //
