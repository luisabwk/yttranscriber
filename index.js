// youtube-to-mp3-api/index.js
const express = require('express');
const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');

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

// Middleware para analisar JSON
app.use(express.json());

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
  
  // Abordagem 1: Usar cookies do Chrome
  try {
    console.log(`[${new Date().toISOString()}] Tentando abordagem 1: Cookies do navegador`);
    const browserOptions = [
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--no-warnings',
      '--cookies-from-browser', 'chrome',
      '--no-check-certificate',
      '--geo-bypass',
      '--ignore-errors',
      '--force-ipv4',
      '-o', outputTemplate,
      youtubeUrl
    ];
    
    await executeYtDlp(browserOptions);
    console.log(`[${new Date().toISOString()}] Abordagem 1 bem-sucedida!`);
    return { success: true };
  } catch (error) {
    console.log(`[${new Date().toISOString()}] Abordagem 1 falhou: ${error.message}`);
    
    // Abordagem 2: Tentar YouTube Music (às vezes tem menos restrições)
    try {
      console.log(`[${new Date().toISOString()}] Tentando abordagem 2: API alternativa`);
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
        '--force-ipv4',
        '-o', outputTemplate,
        ytMusicUrl
      ];
      
      await executeYtDlp(ytMusicOptions);
      console.log(`[${new Date().toISOString()}] Abordagem 2 bem-sucedida!`);
      return { success: true };
    } catch (error2) {
      console.log(`[${new Date().toISOString()}] Abordagem 2 falhou: ${error2.message}`);
      
      // Abordagem 3: Tentar com formatos específicos e configurações adicionais
      try {
        console.log(`[${new Date().toISOString()}] Tentando abordagem 3: Formatos específicos`);
        const specificOptions = [
          '--extract-audio',
          '--audio-format', 'mp3',
          '--audio-quality', '0',
          '--no-warnings',
          '--format', 'bestaudio[ext=m4a]/bestaudio/best',
          '--no-check-certificate',
          '--geo-bypass',
          '--ignore-errors',
          '-o', outputTemplate,
          youtubeUrl
        ];
        
        await executeYtDlp(specificOptions);
        console.log(`[${new Date().toISOString()}] Abordagem 3 bem-sucedida!`);
        return { success: true };
      } catch (error3) {
        console.log(`[${new Date().toISOString()}] Abordagem 3 falhou: ${error3.message}`);
        
        // Abordagem 4: Tentar proxy Invidious
        try {
          console.log(`[${new Date().toISOString()}] Tentando abordagem 4: Proxy Invidious`);
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
          
          const invidiousUrl = `https://invidious.snopyta.org/watch?v=${videoId}`;
          console.log(`[${new Date().toISOString()}] Usando URL do Invidious: ${invidiousUrl}`);
          
          const invidiousOptions = [
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '--no-warnings',
            '--no-check-certificate',
            '--geo-bypass',
            '--ignore-errors',
            '-o', outputTemplate,
            invidiousUrl
          ];
          
          await executeYtDlp(invidiousOptions);
          console.log(`[${new Date().toISOString()}] Abordagem 4 bem-sucedida!`);
          return { success: true };
        } catch (error4) {
          console.log(`[${new Date().toISOString()}] Abordagem 4 falhou: ${error4.message}`);
          throw new Error('Todas as abordagens de download falharam. O YouTube está bloqueando acessos automatizados.');
        }
      }
    }
  }
}

// Função para obter informações do vídeo (com tratamento de erro avançado)
async function getVideoInfo(youtubeUrl) {
  try {
    console.log(`[${new Date().toISOString()}] Buscando informações do vídeo: ${youtubeUrl}`);
    
    // Primeiro, tente com cookies do navegador
    try {
      const info = await youtubedl(youtubeUrl, {
        dumpSingleJson: true,
        noWarnings: true,
        noCallHome: true,
        cookiesFromBrowser: 'chrome'
      });
      return info;
    } catch (err) {
      console.log(`[${new Date().toISOString()}] Falha ao obter informações com cookies do navegador: ${err.message}`);
      
      // Tente sem cookies como fallback
      const info = await youtubedl(youtubeUrl, {
        dumpSingleJson: true,
        noWarnings: true,
        noCallHome: true,
        preferFreeFormats: true,
        youtubeSkipDashManifest: true
      });
      return info;
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Erro ao obter informações do vídeo:`, error);
    
    // Se não conseguir obter informações, retorne um objeto com título genérico
    return {
      title: `YouTube Video - ${new URL(youtubeUrl).searchParams.get('v') || 'Unknown'}`
    };
  }
}

// Rota principal - recebe a URL do YouTube
app.post('/convert', async (req, res) => {
  try {
    const { youtubeUrl } = req.body;
    
    if (!youtubeUrl) {
      return res.status(400).json({ error: 'URL do YouTube é obrigatória' });
    }
    
    // Validar a URL do YouTube
    if (!validateYouTubeUrl(youtubeUrl)) {
      return res.status(400).json({ error: 'URL do YouTube inválida' });
    }
    
    console.log(`[${new Date().toISOString()}] Processando URL: ${youtubeUrl}`);
    
    // Gerar ID único para o arquivo
    const fileId = uuidv4();
    const videoPath = path.join(TEMP_DIR, `${fileId}.mp4`);
    const audioPath = path.join(TEMP_DIR, `${fileId}.mp3`);
    
    // Obter informações do vídeo
    let videoInfo;
    try {
      videoInfo = await getVideoInfo(youtubeUrl);
      console.log(`[${new Date().toISOString()}] Título do vídeo: ${videoInfo.title}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Erro ao obter informações do vídeo:`, error);
      videoInfo = { title: `YouTube Video - ${fileId}` };
    }
    
    const videoTitle = videoInfo.title || `YouTube Video - ${fileId}`;
    const sanitizedTitle = videoTitle.replace(/[^\w\s]/gi, '');
    
    // Baixar o vídeo usando a função avançada
    try {
      console.log(`[${new Date().toISOString()}] Iniciando download do vídeo...`);
      await downloadYouTubeAudio(youtubeUrl, videoPath);
      
      // Verificar se o arquivo MP3 já foi gerado (alguns backends de yt-dlp fazem isso automaticamente)
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
      
      console.log(`[${new Date().toISOString()}] Arquivo baixado: ${existingFile}`);
      
      // Se o arquivo baixado não for MP3, converter para MP3
      if (!existingFile.endsWith('.mp3')) {
        console.log(`[${new Date().toISOString()}] Iniciando conversão para MP3...`);
        
        await new Promise((resolve, reject) => {
          ffmpeg(existingFile)
            .outputOptions('-q:a', '0') // Melhor qualidade
            .saveToFile(audioPath)
            .on('progress', (progress) => {
              console.log(`[${new Date().toISOString()}] Progresso da conversão: ${progress.percent}% concluído`);
            })
            .on('end', () => {
              console.log(`[${new Date().toISOString()}] Conversão para MP3 concluída com sucesso`);
              
              // Remover o arquivo original após a conversão
              try {
                fs.unlinkSync(existingFile);
                console.log(`[${new Date().toISOString()}] Arquivo original removido`);
              } catch (err) {
                console.error(`[${new Date().toISOString()}] Erro ao remover arquivo original:`, err);
              }
              
              resolve();
            })
            .on('error', (err) => {
              console.error(`[${new Date().toISOString()}] Erro na conversão para MP3:`, err);
              reject(err);
            });
        });
      } else {
        // Se já for MP3, apenas renomear
        fs.renameSync(existingFile, audioPath);
      }
      
      // Gerar URL para download
      const downloadUrl = `/download/${fileId}`;
      
      // Armazenar informações do arquivo
      tempFiles.set(fileId, {
        path: audioPath,
        filename: `${sanitizedTitle}.mp3`,
        expiresAt: Date.now() + EXPIRATION_TIME
      });
      
      // Configurar limpeza do arquivo após o tempo de expiração
      setTimeout(() => {
        if (tempFiles.has(fileId)) {
          const fileInfo = tempFiles.get(fileId);
          if (fs.existsSync(fileInfo.path)) {
            fs.unlinkSync(fileInfo.path);
            console.log(`[${new Date().toISOString()}] Arquivo expirado removido: ${fileId}`);
          }
          tempFiles.delete(fileId);
        }
      }, EXPIRATION_TIME);
      
      res.json({
        success: true,
        title: videoTitle,
        downloadUrl: downloadUrl,
        expiresIn: 'Uma hora',
      });
      
    } catch (downloadError) {
      console.error(`[${new Date().toISOString()}] Erro no download/conversão:`, downloadError);
      res.status(500).json({ 
        error: 'Erro ao baixar o vídeo', 
        details: downloadError.message,
        tips: 'O YouTube pode estar bloqueando downloads. Tente novamente mais tarde ou com outro vídeo.'
      });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Erro no processamento:`, error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
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
  
  for (const [fileId, fileInfo] of tempFiles.entries()) {
    if (now > fileInfo.expiresAt) {
      if (fs.existsSync(fileInfo.path)) {
        fs.unlinkSync(fileInfo.path);
        countRemoved++;
      }
      tempFiles.delete(fileId);
    }
  }
  
  if (countRemoved > 0) {
    console.log(`[${new Date().toISOString()}] Limpeza automática: ${countRemoved} arquivo(s) expirado(s) removido(s)`);
  }
}, 15 * 60 * 1000); // Verificar a cada 15 minutos
