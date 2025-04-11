# YouTube Transcriber API

Uma API robusta e eficiente para baixar vídeos do YouTube, extrair áudio em formato MP3, e obter estatísticas detalhadas, incluindo contagens de inscritos, usando várias abordagens de fallback.

![YouTube to MP3](https://img.shields.io/badge/YouTube-MP3-red)
![Node.js](https://img.shields.io/badge/Node.js-14%2B-green)
![Express](https://img.shields.io/badge/Express-4.x-blue)

## ✨ Características

- **Download de Vídeo com Fallback:** Usa múltiplas estratégias para contornar as restrições anti-bot do YouTube, incluindo proxy residencial rotativo e front-ends alternativos.
- **Conversão para MP3:** Extração e conversão de áudio de alta qualidade usando FFmpeg.
- **Estatísticas Detalhadas:** Retorna informações do vídeo como título, descrição, visualizações, curtidas, comentários e data de publicação.
- **Contagem Precisa de Inscritos:** Extrai o número de inscritos do canal usando Puppeteer para interpretar valores abreviados (por exemplo, "1.46M" convertido para 1.460.000).
- **Nome do Canal:** Inclui o nome do canal no JSON resultante.
- **Transcrição (Opcional):** Suporta transcrição de áudio via Assembly AI.

## 📋 Pré-requisitos

- Node.js (versão 14 ou superior)
- npm ou yarn
- FFmpeg instalado no sistema
- Python 3 e pip (para yt-dlp)
- Puppeteer (instalado via npm)

## 🔧 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/yttranscriber.git
cd yttranscriber
```

### 2. Instale as dependências

Instale as dependências do Node.js:

```bash
npm install
```

Instale o yt-dlp (se ainda não estiver instalado):

```bash
pip3 install --upgrade yt-dlp
```

Certifique-se de que o FFmpeg esteja instalado:

```bash
# Para Ubuntu/Debian:
sudo apt update
sudo apt install -y ffmpeg
```

### 3. Configure as variáveis de ambiente

Crie um arquivo `.env` no diretório raiz do projeto para definir suas variáveis de ambiente, por exemplo:

```dotenv
PORT=3000
ASSEMBLY_API_KEY=SUA_CHAVE_API_ASSEMBLYAI
ENABLE_TRANSCRIPTION=true
PROXY_HOST=geo.iproyal.com
PROXY_PORT=12321
PROXY_USERNAME=seu_usuario_iproyal
PROXY_PASSWORD=sua_senha_iproyal
```

### 4. Inicie o servidor

```bash
# Diretamente:
node index.js

# Ou com PM2 para executar em segundo plano:
pm2 start index.js --name yt2mp3
```

O servidor será iniciado na porta configurada (padrão é 3000).

## 📝 Como usar

### Converter um Vídeo para MP3

**Endpoint:** `POST /convert`

**Corpo da requisição (JSON):**

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=exemplo",
  "transcribe": true
}
```

**Resposta de sucesso:**

```json
{
  "success": true,
  "message": "Tarefa de download iniciada",
  "taskId": "123e4567-e89b-12d3-a456-426614174000",
  "statusUrl": "/status/123e4567-e89b-12d3-a456-426614174000",
  "downloadUrl": "/download/123e4567-e89b-12d3-a456-426614174000",
  "estimatedDuration": "Alguns minutos, dependendo do tamanho do vídeo",
  "transcriptionRequested": true,
  "transcriptionStatus": "pending",
  "transcriptionUrl": "/transcription/123e4567-e89b-12d3-a456-426614174000"
}
```

### Obter Estatísticas do Vídeo

**Endpoint:** `POST /stats`

**Corpo da requisição (JSON):**

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=exemplo"
}
```

**Resposta de sucesso:**

```json
{
  "videoTitle": "Título do Vídeo",
  "channel": "Nome do Canal",
  "description": "Descrição do vídeo...",
  "views": 123456,
  "likes": 7890,
  "dislikes": 123,
  "commentCount": 456,
  "subscriberCount": 1460000,
  "uploadDate": "2025-03-25"
}
```

As contagens de inscritos são obtidas usando o Puppeteer, interpretando com precisão valores como "1.46M inscritos" como 1.460.000.

### Baixar Arquivo MP3

**Endpoint:** `GET /download/:fileId`

Use a URL fornecida na resposta do endpoint `/convert` para baixar o arquivo MP3.

### Verificar Status da Tarefa

**Endpoint:** `GET /status/:taskId`

Use este endpoint para verificar o progresso ou recuperar a URL de download após a conclusão.

### Obter Transcrição

**Endpoint:** `GET /transcription/:fileId`

Use este endpoint para obter a transcrição após a conclusão do processamento.

## 📊 Exemplo de uso com Node.js

```javascript
const axios = require('axios');
const fs = require('fs');

// URL base da API
const API_URL = 'http://localhost:3000';

async function convertAndDownload(youtubeUrl, outputPath, withTranscription = false) {
  // Solicitar conversão
  const conversion = await axios.post(`${API_URL}/convert`, {
    youtubeUrl: youtubeUrl,
    transcribe: withTranscription
  });
  
  const taskId = conversion.data.taskId;
  console.log(`Tarefa iniciada: ${taskId}`);
  
  // Verificar o status periodicamente
  let completed = false;
  
  while (!completed) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos
    
    const statusResponse = await axios.get(`${API_URL}/status/${taskId}`);
    console.log(`Status: ${statusResponse.data.status}`);
    
    if (statusResponse.data.status === 'completed') {
      completed = true;
    }
  }
  
  // Baixar o arquivo
  const response = await axios({
    method: 'GET',
    url: `${API_URL}/download/${taskId}`,
    responseType: 'stream'
  });
  
  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Uso:
convertAndDownload('https://www.youtube.com/watch?v=exemplo', './musica.mp3', true)
  .then(() => console.log('Download completo!'))
  .catch(console.error);
```

## 📚 Estrutura do Projeto

```
yttranscriber/
├── index.js           # Arquivo principal da API
├── package.json       # Dependências e scripts
├── .env               # Variáveis de ambiente (não versionado)
├── .env.example       # Exemplo de variáveis de ambiente
└── temp/              # Diretório para arquivos temporários (criado automaticamente)
```

## 🔄 Sistema de Fallback

A API usa várias estratégias para garantir o download de vídeos, incluindo:
- **Proxy Residencial Rotativo iProyal**
- **Front-ends alternativos (Invidious, YouTube Music, Piped.video)**
- **Configuração avançada de fallback do yt-dlp**

## 📝 Considerações sobre o Proxy Residencial Rotativo

Um proxy residencial rotativo é usado para evitar bloqueios do YouTube. Este tipo de proxy:

1. Usa endereços IP de provedores de internet residenciais reais
2. Alterna entre diferentes IPs a cada requisição (rotativo)
3. É mais eficaz para contornar bloqueios de bot do que proxies tradicionais

Para usar esta API, você precisará de credenciais de um serviço de proxy residencial como o iProyal.

## ⚠️ Aviso

Esta API é fornecida apenas para fins educacionais. Baixar conteúdo protegido por direitos autorais sem permissão pode violar leis de direitos autorais. Use a API de forma responsável e de acordo com as leis aplicáveis.
