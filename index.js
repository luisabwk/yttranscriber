// youtube-to-mp3-api/index.js
const express = require('express');
const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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
    
    console.log('Processando URL:', youtubeUrl);
    
    // Gerar ID único para o arquivo
    const fileId = uuidv4();
    const videoPath = path.join(TEMP_DIR, `${fileId}.mp4`);
    const audioPath = path.join(TEMP_DIR, `${fileId}.mp3`);
    
    // Obter informações do vídeo usando youtube-dl
    console.log('Buscando informações do vídeo...');
    const videoInfo = await youtubedl(youtubeUrl, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true
    });
    
    const videoTitle = videoInfo.title;
    const sanitizedTitle = videoTitle.replace(/[^\w\s]/gi, '');
    console.log(`Título do vídeo: ${videoTitle}`);
    
    // Baixar o vídeo usando youtube-dl
    console.log('Baixando o vídeo...');
    await youtubedl(youtubeUrl, {
      output: videoPath,
      format: 'bestaudio[ext=m4a]/bestaudio'
    });
    
    console.log('Vídeo baixado com sucesso. Iniciando conversão para MP3...');
    
    // Converter para MP3 usando ffmpeg
    ffmpeg(videoPath)
      .outputOptions('-q:a', '0') // Melhor qualidade
      .saveToFile(audioPath)
      .on('progress', (progress) => {
        console.log(`Progresso da conversão: ${progress.percent}% concluído`);
      })
      .on('end', () => {
        console.log('Conversão para MP3 concluída com sucesso');
        
        // Remover o arquivo de vídeo após a conversão
        try {
          fs.unlinkSync(videoPath);
          console.log('Arquivo de vídeo temporário removido');
        } catch (err) {
          console.error('Erro ao remover arquivo de vídeo temporário:', err);
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
              console.log(`Arquivo expirado removido: ${fileId}`);
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
      })
      .on('error', (err) => {
        console.error('Erro na conversão para MP3:', err);
        res.status(500).json({ error: 'Erro ao converter o vídeo', details: err.message });
      });
      
  } catch (error) {
    console.error('Erro no processamento:', error);
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
  res.json({ status: 'online' });
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
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
    console.log(`Limpeza automática: ${countRemoved} arquivo(s) expirado(s) removido(s)`);
  }
}, 15 * 60 * 1000); // Verificar a cada 15 minutos
