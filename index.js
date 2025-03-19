// youtube-to-mp3-api/index.js
const express = require('express');
const ytdl = require('ytdl-core');
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

// Rota principal - recebe a URL do YouTube
app.post('/convert', async (req, res) => {
  try {
    const { youtubeUrl } = req.body;
    
    if (!youtubeUrl) {
      return res.status(400).json({ error: 'URL do YouTube é obrigatória' });
    }
    
    // Validar a URL do YouTube
    if (!ytdl.validateURL(youtubeUrl)) {
      return res.status(400).json({ error: 'URL do YouTube inválida' });
    }
    
    // Obter informações do vídeo
    const videoInfo = await ytdl.getInfo(youtubeUrl);
    const videoTitle = videoInfo.videoDetails.title;
    const sanitizedTitle = videoTitle.replace(/[^\w\s]/gi, '');
    
    // Gerar ID único para o arquivo
    const fileId = uuidv4();
    const videoPath = path.join(TEMP_DIR, `${fileId}.mp4`);
    const audioPath = path.join(TEMP_DIR, `${fileId}.mp3`);
    
    // Baixar o vídeo
    const videoStream = ytdl(youtubeUrl, { quality: 'highestaudio' });
    const videoWriteStream = fs.createWriteStream(videoPath);
    
    videoStream.pipe(videoWriteStream);
    
    videoWriteStream.on('finish', () => {
      // Converter para MP3 usando ffmpeg
      ffmpeg(videoPath)
        .outputOptions('-q:a', '0') // Melhor qualidade
        .saveToFile(audioPath)
        .on('end', () => {
          // Remover o arquivo de vídeo após a conversão
          fs.unlinkSync(videoPath);
          
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
          console.error('Erro na conversão:', err);
          res.status(500).json({ error: 'Erro ao converter o vídeo' });
        });
    });
    
    videoWriteStream.on('error', (err) => {
      console.error('Erro ao baixar o vídeo:', err);
      res.status(500).json({ error: 'Erro ao baixar o vídeo' });
    });
    
  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
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
  for (const [fileId, fileInfo] of tempFiles.entries()) {
    if (now > fileInfo.expiresAt) {
      if (fs.existsSync(fileInfo.path)) {
        fs.unlinkSync(fileInfo.path);
      }
      tempFiles.delete(fileId);
    }
  }
}, 15 * 60 * 1000); // Verificar a cada 15 minutos
