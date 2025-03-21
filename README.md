# YouTube to MP3 API

Uma API robusta e eficiente para baixar vídeos do YouTube, extrair o áudio em formato MP3, disponibilizar através de URLs temporárias e opcionalmente transcrever o conteúdo em texto.

![YouTube to MP3](https://img.shields.io/badge/YouTube-MP3-red)
![Node.js](https://img.shields.io/badge/Node.js-14%2B-green)
![Express](https://img.shields.io/badge/Express-4.x-blue)

## ✨ Características

- ⬇️ Download de vídeos do YouTube com múltiplas abordagens de fallback
- 🔄 Suporte a proxy residencial para contornar restrições anti-bot
- 🎵 Conversão para MP3 em alta qualidade
- 🔗 URLs temporárias para download
- 📝 Transcrição automática do conteúdo de áudio para texto
- ⏱️ Expiração automática após 1 hora
- 🧹 Limpeza automática de arquivos temporários

## 📋 Pré-requisitos

- Node.js (versão 14 ou superior)
- npm ou yarn
- FFmpeg instalado no sistema
- Python 3 e pip (para yt-dlp)
- Chave de API do AssemblyAI (para a funcionalidade de transcrição)

## 🔧 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/youtube-to-mp3-api.git
cd youtube-to-mp3-api
```

### 2. Instale as dependências

```bash
# Instalar dependências do Node.js
npm install

# Instalar yt-dlp (substituto moderno do youtube-dl)
pip3 install --upgrade yt-dlp

# Instalar FFmpeg (se ainda não tiver)
# Para Ubuntu/Debian:
sudo apt update
sudo apt install -y ffmpeg
```

### 3. Configure o ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```
# API do AssemblyAI para transcrição
ASSEMBLY_API_KEY=sua_chave_da_api_aqui

# Ativar/desativar transcrição (true/false)
ENABLE_TRANSCRIPTION=true

# Proxy Residencial IPRoyal (substitua pelas suas credenciais)
IPROYAL_USERNAME=seu_usuario_iproyal
IPROYAL_PASSWORD=sua_senha_iproyal

# Porta do servidor (opcional)
PORT=3000
```

#### Obtenção de Credenciais

- **AssemblyAI**: Acesse [AssemblyAI](https://www.assemblyai.com/) e crie uma conta para obter uma chave de API.
- **IPRoyal**: É necessário ter uma conta no [IPRoyal](https://iproyal.com/) com um plano de proxy residencial ativo para obter as credenciais. Estas credenciais são essenciais para contornar as restrições anti-bot do YouTube.

### 4. Inicie o servidor

```bash
# Diretamente:
node index.js

# Ou com PM2 para manter rodando em segundo plano:
pm2 start index.js --name yt2mp3
```

Por padrão, o servidor iniciará na porta 3000. Você pode alterar isso definindo a variável de ambiente `PORT`.

## 📝 Como usar

### Converter um vídeo do YouTube para MP3

**Endpoint:** `POST /convert`

**Corpo da requisição (JSON):**
```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=exemplo",
  "transcribe": true
}
```

**Parâmetros:**
- `youtubeUrl` (obrigatório): URL do vídeo do YouTube
- `transcribe` (opcional): Se `true`, o áudio será transcrito para texto

**Resposta de sucesso:**
```json
{
  "success": true,
  "message": "Tarefa de download iniciada. Transcrição será processada automaticamente após o download.",
  "taskId": "123e4567-e89b-12d3-a456-426614174000",
  "statusUrl": "/status/123e4567-e89b-12d3-a456-426614174000",
  "downloadUrl": "/download/123e4567-e89b-12d3-a456-426614174000",
  "transcriptionRequested": true,
  "transcriptionStatus": "pending",
  "transcriptionUrl": "/transcription/123e4567-e89b-12d3-a456-426614174000",
  "estimatedDuration": "Alguns minutos, dependendo do tamanho do vídeo"
}
```

### Verificar o status da tarefa

**Endpoint:** `GET /status/:taskId`

**Parâmetros de consulta:**
- `includeTranscription` (opcional): Se `true`, a resposta incluirá o texto da transcrição quando disponível

**Resposta de sucesso:**
```json
{
  "taskId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "completed",
  "title": "Título do Vídeo",
  "created": "2023-03-21T12:34:56.789Z",
  "downloadUrl": "/download/123e4567-e89b-12d3-a456-426614174000",
  "transcriptionRequested": true,
  "transcriptionStatus": "completed",
  "transcriptionUrl": "/transcription/123e4567-e89b-12d3-a456-426614174000",
  "transcription": {
    "text": "Este é o texto completo da transcrição...",
    "markdown": "# Transcrição do áudio\n\nEste é o texto completo da transcrição...",
    "completedAt": "2023-03-21T12:40:56.789Z"
  }
}
```

### Baixar o arquivo MP3

**Endpoint:** `GET /download/:fileId`

Use a URL fornecida na resposta anterior para baixar o arquivo MP3.

### Obter a transcrição separadamente

**Endpoint:** `GET /transcription/:fileId`

**Parâmetros de consulta:**
- `format` (opcional): Formato da transcrição (`markdown`, `json` ou `text`). Padrão: `markdown`

### Verificar status da API

**Endpoint:** `GET /status`

**Resposta:**
```json
{
  "status": "online",
  "version": "1.1.0",
  "message": "API funcionando normalmente"
}
```

## 📊 Exemplo de uso com Node.js

```javascript
const axios = require('axios');
const fs = require('fs');

// URL base da API
const API_URL = 'http://localhost:3000';

async function convertAndDownload(youtubeUrl, outputPath, withTranscription = false) {
  // Etapa 1: Solicitar a conversão
  const conversion = await axios.post(`${API_URL}/convert`, {
    youtubeUrl: youtubeUrl,
    transcribe: withTranscription
  });
  
  const taskId = conversion.data.taskId;
  console.log(`Tarefa iniciada: ${taskId}`);
  
  // Etapa 2: Verificar o status periodicamente
  let completed = false;
  let transcriptionCompleted = false;
  let transcriptionText = null;
  
  while (!completed || (withTranscription && !transcriptionCompleted)) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos
    
    const statusResponse = await axios.get(`${API_URL}/status/${taskId}?includeTranscription=true`);
    const status = statusResponse.data;
    
    console.log(`Status: ${status.status}, Transcrição: ${status.transcriptionStatus || 'N/A'}`);
    
    completed = status.status === 'completed';
    
    if (withTranscription) {
      transcriptionCompleted = status.transcriptionStatus === 'completed';
      
      if (transcriptionCompleted && status.transcription) {
        transcriptionText = status.transcription.text;
        console.log('Transcrição concluída!');
      }
    }
    
    if (completed && (!withTranscription || transcriptionCompleted)) {
      break;
    }
  }
  
  // Etapa 3: Baixar o arquivo
  const response = await axios({
    method: 'GET',
    url: `${API_URL}/download/${taskId}`,
    responseType: 'stream'
  });
  
  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      resolve({
        success: true,
        filePath: outputPath,
        transcription: transcriptionText
      });
    });
    writer.on('error', reject);
  });
}

// Uso:
convertAndDownload('https://www.youtube.com/watch?v=exemplo', './musica.mp3', true)
  .then((result) => {
    console.log('Download completo!');
    if (result.transcription) {
      console.log('Transcrição:');
      console.log(result.transcription);
    }
  })
  .catch(console.error);
```

## 📚 Estrutura do projeto

```
youtube-to-mp3-api/
├── index.js          # Arquivo principal da API
├── package.json      # Dependências e scripts
├── .env              # Variáveis de ambiente (não versionado)
├── .env.example      # Exemplo de variáveis de ambiente
└── temp/             # Diretório para arquivos temporários (criado automaticamente)
```

## 🔄 Sistema de contorno de restrições

Esta versão aprimorada da API utiliza um sistema de múltiplas abordagens para garantir o download mesmo quando o YouTube restringe acessos:

1. **Abordagem 1**: Utiliza proxy residencial IPRoyal para contornar as restrições anti-bot
   - Usa IPs reais de usuários residenciais que são menos suscetíveis a bloqueios
   - Requer credenciais válidas do serviço IPRoyal
2. **Abordagem 2**: Combina proxy residencial com alternativas do Invidious (front-ends alternativos do YouTube)
3. **Abordagem 3**: Configurações avançadas para yt-dlp que contornam restrições
4. **Abordagem 4**: Utiliza o YouTube Music como alternativa (às vezes tem menos restrições)
5. **Abordagem 5**: Tenta download através do Piped.video (outro front-end alternativo)

Esse sistema de fallback aumenta significativamente a taxa de sucesso nos downloads, mesmo com as restrições anti-bot do YouTube.

### Sobre o proxy residencial IPRoyal

O IPRoyal é um serviço que fornece proxies residenciais, que são IPs associados a dispositivos reais e provedores de internet residenciais. Estes são significativamente mais eficazes para contornar restrições anti-bot do que proxies de datacenter convencionais.

**Importante:** O uso do serviço IPRoyal é pago e requer um plano ativo. Os custos são geralmente baseados na quantidade de tráfego utilizado. Certifique-se de consultar a [página de preços do IPRoyal](https://iproyal.com/residential-proxies/) para informações atualizadas.

## 🎤 Funcionalidade de Transcrição

A API utiliza o serviço [AssemblyAI](https://www.assemblyai.com/) para transcrever automaticamente o conteúdo de áudio para texto. O processo funciona da seguinte forma:

1. O áudio é extraído do vídeo do YouTube e convertido para MP3
2. O arquivo MP3 é enviado para a API do AssemblyAI
3. A transcrição é processada em segundo plano
4. O resultado pode ser obtido através da rota `/status/:taskId` ou `/transcription/:fileId`

### Configuração da Transcrição

Para utilizar a funcionalidade de transcrição:

1. Obtenha uma chave de API do [AssemblyAI](https://www.assemblyai.com/)
2. Configure a chave no arquivo `.env`:
   ```
   ASSEMBLY_API_KEY=sua_chave_da_api_aqui
   ENABLE_TRANSCRIPTION=true
   ```

### Considerações sobre a Transcrição

- A transcrição pode levar mais tempo que o download, especialmente para vídeos longos
- O AssemblyAI oferece um número limitado de minutos de transcrição gratuita por mês
- A qualidade da transcrição depende da clareza do áudio do vídeo original
- Por padrão, a API está configurada para detectar e transcrever em português (pt)

## 📝 Notas importantes

- Os arquivos são automaticamente excluídos após uma hora para economizar espaço em disco.
- Esta API é apenas para uso educacional. Respeite os direitos autorais e os termos de serviço do YouTube.
- Considere implementar autenticação e limitação de taxa (rate limiting) em ambientes de produção.

## 🔧 Solução de problemas

### Erro "Sign in to confirm you're not a bot"
Esta versão resolve esse problema usando proxy residencial do IPRoyal. Se ainda encontrar esse erro:
- Verifique se suas credenciais de IPRoyal estão corretas no arquivo `.env`
- Certifique-se que seu plano de proxy residencial está ativo e com créditos suficientes
- Verifique se o proxy está acessível a partir do seu servidor
- Tente usar outro endpoint ou configuração de proxy residencial

### Erro "FFmpeg não encontrado"
Certifique-se de que o FFmpeg está instalado corretamente:
```bash
ffmpeg -version
```

### Erro "API key not valid" na transcrição
Verifique se você configurou corretamente a chave da API do AssemblyAI no arquivo `.env`

### Processo de transcrição falha
- Verifique se o arquivo de áudio foi extraído corretamente
- Certifique-se de que o arquivo não excede os limites do AssemblyAI
- Verifique os logs do servidor para mensagens de erro específicas

## 🚀 Possíveis melhorias

- [ ] Adicionar autenticação para proteger a API
- [ ] Implementar limitação de taxa (rate limiting)
- [ ] Adicionar suporte para diferentes formatos de áudio
- [ ] Criar um sistema de fila para processar múltiplas solicitações
- [ ] Implementar cache para vídeos frequentemente solicitados
- [ ] Adicionar suporte para idiomas específicos na transcrição
- [ ] Criar um fronten
