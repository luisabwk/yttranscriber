// Adicione estas dependências no início do arquivo
require('dotenv').config();
const axios = require('axios');

// Adicione estas configurações após as outras configurações no topo do arquivo
const ASSEMBLY_API_KEY = process.env.ASSEMBLY_API_KEY || '';
const ENABLE_TRANSCRIPTION = process.env.ENABLE_TRANSCRIPTION === 'true' || false;

// Adicione este mapa para armazenar as transcrições
const transcriptions = new Map();

// Adicione esta função para realizar a transcrição do áudio
async function transcribeAudio(audioFilePath, fileId) {
  try {
    console.log(`[${new Date().toISOString()}] Iniciando transcrição para ${fileId}`);
    
    if (!ENABLE_TRANSCRIPTION || !ASSEMBLY_API_KEY) {
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

    // Iniciar a transcrição com detecção automática de idioma
    const transcriptResponse = await axios.post('https://api.assemblyai.com/v2/transcript', {
      audio_url: audioUrl,
      language_detection: true // Usar detecção automática de idioma
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

    // Formatar a transcrição em markdown
    const transcriptionText = transcriptResult.text;
    const detectedLanguage = transcriptResult.language_code || 'Automático';
    const transcriptionMarkdown = `# Transcrição do áudio (Idioma: ${detectedLanguage})\n\n${transcriptionText}`;
    
    // Salvar a transcrição
    transcriptions.set(fileId, {
      markdown: transcriptionMarkdown,
      text: transcriptionText,
      language: detectedLanguage,
      raw: transcriptResult,
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

    console.log(`[${new Date().toISOString()}] Transcrição concluída com sucesso para ${fileId} (Idioma: ${detectedLanguage})`);
    return {
      success: true,
      transcription: transcriptionMarkdown,
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

// Modifique a rota /convert para aceitar o parâmetro de transcrição
app.post('/convert', async (req, res) => {
  try {
    const { youtubeUrl, format = 'mp3', transcribe = false } = req.body;
    
    if (!youtubeUrl) {
      return res.status(400).json({ error: 'URL do YouTube é obrigatória' });
    }
    
    // Validar a URL do YouTube
    if (!validateYouTubeUrl(youtubeUrl)) {
      return res.status(400).json({ error: 'URL do YouTube inválida' });
    }
    
    // Validar formato
    const supportedFormats = ['mp3'];
    if (!supportedFormats.includes(format)) {
      return res.status(400).json({ 
        error: 'Formato não suportado', 
        message: `Os formatos suportados são: ${supportedFormats.join(', ')}` 
      });
    }
    
    console.log(`[${new Date().toISOString()}] Processando URL: ${youtubeUrl}`);
    
    // Verificar se a transcrição foi solicitada
    const shouldTranscribe = (transcribe === true || transcribe === 'true') && ENABLE_TRANSCRIPTION;
    
    // Gerar ID único para o arquivo e a tarefa
    const fileId = uuidv4();
    const videoPath = path.join(TEMP_DIR, `${fileId}.mp4`);
    const audioPath = path.join(TEMP_DIR, `${fileId}.${format}`);
    
    // Obter informações básicas do vídeo, mas não esperar pela conclusão completa
    let videoTitle = `YouTube Video - ${fileId}`;
    let taskStatus = 'pending';
    
    // Registrar a tarefa como pendente
    pendingTasks.set(fileId, {
      status: taskStatus,
      title: videoTitle,
      url: youtubeUrl,
      created: Date.now(),
      format: format,
      downloadUrl: `/download/${fileId}`,
      progress: 0,
      transcriptionRequested: shouldTranscribe,
      transcriptionStatus: shouldTranscribe ? 'pending' : null,
      hasTranscription: false
    });
    
    // Iniciar o processo de download em segundo plano
    (async () => {
      try {
        // Atualizar o status da tarefa para processando
        if (pendingTasks.has(fileId)) {
          const taskInfo = pendingTasks.get(fileId);
          taskInfo.status = 'processing';
          pendingTasks.set(fileId, taskInfo);
        }
        
        // Obter informações do vídeo
        try {
          const videoInfo = await getVideoInfo(youtubeUrl);
          videoTitle = videoInfo.title || `YouTube Video - ${fileId}`;
          const sanitizedTitle = videoTitle.replace(/[^\w\s]/gi, '');
          
          // Atualizar o título da tarefa
          if (pendingTasks.has(fileId)) {
            const taskInfo = pendingTasks.get(fileId);
            taskInfo.title = videoTitle;
            taskInfo.progress = 10; // 10% após obter informações
            pendingTasks.set(fileId, taskInfo);
          }
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Erro ao obter informações do vídeo:`, error);
        }
        
        // Baixar o vídeo
        if (pendingTasks.has(fileId)) {
          const taskInfo = pendingTasks.get(fileId);
          taskInfo.status = 'downloading';
          taskInfo.progress = 20; // 20% ao iniciar o download
          pendingTasks.set(fileId, taskInfo);
        }
        
        await downloadYouTubeAudio(youtubeUrl, videoPath);
        
        if (pendingTasks.has(fileId)) {
          const taskInfo = pendingTasks.get(fileId);
          taskInfo.progress = 60; // 60% após o download
          pendingTasks.set(fileId, taskInfo);
        }
        
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
        
        // Se o arquivo baixado não for no formato solicitado, converter
        if (!existingFile.endsWith(`.${format}`)) {
          if (pendingTasks.has(fileId)) {
            const taskInfo = pendingTasks.get(fileId);
            taskInfo.status = 'converting';
            taskInfo.progress = 70; // 70% ao iniciar a conversão
            pendingTasks.set(fileId, taskInfo);
          }
          
          await new Promise((resolve, reject) => {
            ffmpeg(existingFile)
              .outputOptions('-q:a', '0') // Melhor qualidade
              .on('progress', (progress) => {
                // Atualizar o progresso da conversão
                if (pendingTasks.has(fileId)) {
                  const taskInfo = pendingTasks.get(fileId);
                  // Progresso vai de 70% a 90%
                  if (progress.percent) {
                    taskInfo.progress = 70 + Math.min(20, (progress.percent / 100) * 20);
                    pendingTasks.set(fileId, taskInfo);
                  }
                }
              })
              .saveToFile(audioPath)
              .on('end', () => {
                try {
                  fs.unlinkSync(existingFile);
                  console.log(`[${new Date().toISOString()}] Arquivo original removido`);
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
        
        if (pendingTasks.has(fileId)) {
          const taskInfo = pendingTasks.get(fileId);
          taskInfo.progress = 90; // 90% após a conversão
          pendingTasks.set(fileId, taskInfo);
        }
        
        // Armazenar informações do arquivo no mapa de arquivos temporários
        const sanitizedTitle = videoTitle.replace(/[^\w\s]/gi, '');
        tempFiles.set(fileId, {
          path: audioPath,
          filename: `${sanitizedTitle}.${format}`,
          format: format,
          expiresAt: Date.now() + EXPIRATION_TIME
        });
        
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
              console.log(`[${new Date().toISOString()}] Arquivo expirado removido: ${fileId}`);
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
        
        // Marcar a tarefa como concluída
        if (pendingTasks.has(fileId)) {
          const taskInfo = pendingTasks.get(fileId);
          taskInfo.status = 'completed';
          taskInfo.progress = 100; // 100% concluído
          pendingTasks.set(fileId, taskInfo);
        }
        
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

// Atualizar a rota de status para incluir informações de transcrição
app.get('/status/:taskId', (req, res) => {
  const { taskId } = req.params;
  const includeTranscription = req.query.includeTranscription === 'true';
  
  if (!pendingTasks.has(taskId)) {
    // Verificar se já foi concluído e está disponível para download
    if (tempFiles.has(taskId)) {
      const response = {
        taskId,
        status: 'completed',
        downloadUrl: `/download/${taskId}`,
        format: tempFiles.get(taskId).format || 'mp3',
        expiresAt: new Date(tempFiles.get(taskId).expiresAt).toISOString(),
        progress: 100
      };
      
      // Adicionar informações de transcrição se solicitado e disponível
      if (includeTranscription && transcriptions.has(taskId)) {
        const transcriptionInfo = transcriptions.get(taskId);
        response.transcription = {
          available: true,
          url: `/transcription/${taskId}`,
          language: transcriptionInfo.language,
          completedAt: new Date(transcriptionInfo.created).toISOString()
        };
        
        // Incluir o texto completo da transcrição se solicitado
        if (includeTranscription) {
          response.transcription.text = transcriptionInfo.text;
        }
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
    progress: taskInfo.progress || 0,
    format: taskInfo.format || 'mp3',
    downloadUrl: taskInfo.status === 'completed' ? taskInfo.downloadUrl : null,
    error: taskInfo.error || null
  };
  
  // Adicionar informações de transcrição se solicitado
  if (taskInfo.transcriptionRequested) {
    response.transcriptionStatus = taskInfo.transcriptionStatus || 'pending';
    
    if (taskInfo.hasTranscription) {
      response.transcriptionUrl = taskInfo.transcriptionUrl;
      response.detectedLanguage = taskInfo.detectedLanguage;
      
      // Incluir o texto completo da transcrição se solicitado e disponível
      if (includeTranscription && transcriptions.has(taskId)) {
        response.transcription = {
          text: transcriptions.get(taskId).text,
          language: transcriptions.get(taskId).language
        };
      }
    }
    
    if (taskInfo.transcriptionError) {
      response.transcriptionError = taskInfo.transcriptionError;
    }
  }
  
  res.json(response);
});

// Adicionar rota para obter a transcrição
app.get('/transcription/:fileId', (req, res) => {
  const { fileId } = req.params;
  const format = req.query.format || 'markdown'; // Opções: markdown, json, text
  
  if (!transcriptions.has(fileId)) {
    return res.status(404).json({ error: 'Transcrição não encontrada ou expirada' });
  }
  
  const transcriptionInfo = transcriptions.get(fileId);
  
  // Verificar se a transcrição expirou
  if (Date.now() > transcriptionInfo.expiresAt) {
    transcriptions.delete(fileId);
    return res.status(404).json({ error: 'Transcrição expirada' });
  }
  
  // Retornar no formato solicitado
  switch (format) {
    case 'json':
      return res.json({
        text: transcriptionInfo.text,
        language: transcriptionInfo.language,
        created: new Date(transcriptionInfo.created).toISOString(),
        raw: transcriptionInfo.raw
      });
    
    case 'text':
      res.setHeader('Content-Type', 'text/plain');
      return res.send(transcriptionInfo.text);
    
    case 'markdown':
    default:
      res.setHeader('Content-Type', 'text/markdown');
      return res.send(transcriptionInfo.markdown);
  }
});
