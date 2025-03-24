// Adicionar informações de transcrição, se disponível
      if (transcriptions.has(taskId)) {
        response.hasTranscription = true;
        response.transcriptionUrl = `/transcription/${taskId}`;
        
        // Incluir a transcrição na resposta se solicitado
        if (includeTranscription) {
          const transcriptionInfo = transcriptions.get(taskId);
          response.transcription = transcriptionInfo.text;
          response.transcriptionCompletedAt = new Date(transcriptionInfo.created).toISOString();
        }
      }
      
      return res.json(response);
    }
    return res.status(404).json({ error: 'Tarefa não encontrada' });
  }
  
  const taskInfo = pendingTasks.get(taskId);
  
  // Preparar a resposta básica
  const response = {
    taskId,
    status: taskInfo.status,
    title: taskInfo.title,
    created: new Date(taskInfo.created).toISOString(),
    downloadUrl: taskInfo.status === 'completed' ? taskInfo.downloadUrl : null,
    error: taskInfo.error || null
  };
  
  // Adicionar informações de transcrição, se solicitada
  if (taskInfo.transcriptionRequested) {
    response.transcriptionRequested = true;
    response.transcriptionStatus = taskInfo.transcriptionStatus;
    
    if (taskInfo.hasTranscription) {
      response.transcriptionUrl = taskInfo.transcriptionUrl;
      
      // Incluir a transcrição completa se solicitado e disponível
      if (includeTranscription && transcriptions.has(taskId)) {
        const transcriptionInfo = transcriptions.get(taskId);
        response.transcription = transcriptionInfo.text;
        response.transcriptionCompletedAt = new Date(transcriptionInfo.created).toISOString();
      }
    }
    
    if (taskInfo.transcriptionError) {
      response.transcriptionError = taskInfo.transcriptionError;
    }
  }
  
  res.json(response);
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

// Adicionar rota para obter a transcrição
app.get('/transcription/:fileId', (req, res) => {
  const { fileId } = req.params;
  const format = req.query.format || 'text'; // Alterado o padrão para 'text'
  
  if (!transcriptions.has(fileId)) {
    // Verificar se a transcrição ainda está sendo processada
    if (pendingTasks.has(fileId) && 
        pendingTasks.get(fileId).transcriptionRequested && 
        pendingTasks.get(fileId).transcriptionStatus !== 'failed') {
      return res.status(202).json({ 
        message: 'Transcrição ainda está sendo processada',
        status: pendingTasks.get(fileId).transcriptionStatus
      });
    }
    
    return res.status(404).json({ error: 'Transcrição não encontrada ou expirada' });
  }
  
  const transcriptionInfo = transcriptions.get(fileId);
  
  // Verificar se a transcrição expirou
  if (Date.now() > transcriptionInfo.expiresAt) {
    transcriptions.delete(fileId);
    return res.status(404).json({ error: 'Transcrição expirada' });
  }
  
  // Retornar a transcrição no formato solicitado
  if (format === 'json') {
    return res.json(transcriptionInfo.raw);
  } else {
    // Formato padrão: texto simples
    res.setHeader('Content-Type', 'text/plain');
    return res.send(transcriptionInfo.text);
  }
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
  let countTranscriptionsRemoved = 0;
  
  // Limpar arquivos de áudio
  for (const [fileId, fileInfo] of tempFiles.entries()) {
    if (now > fileInfo.expiresAt) {
      if (fs.existsSync(fileInfo.path)) {
        fs.unlinkSync(fileInfo.path);
        countRemoved++;
      }
      tempFiles.delete(fileId);
      
      // Também remover da lista de tarefas pendentes
      if (pendingTasks.has(fileId)) {
        pendingTasks.delete(fileId);
      }
    }
  }
  
  // Limpar transcrições expiradas
  for (const [fileId, transcriptionInfo] of transcriptions.entries()) {
    if (now > transcriptionInfo.expiresAt) {
      transcriptions.delete(fileId);
      countTranscriptionsRemoved++;
    }
  }
  
  if (countRemoved > 0 || countTranscriptionsRemoved > 0) {
    console.log(`[${new Date().toISOString()}] Limpeza automática: ${countRemoved} arquivo(s) expirado(s) e ${countTranscriptionsRemoved} transcrição(ões) removido(s)`);
  }
}, 15 * 60 * 1000); // Verificar a cada 15 minutos
