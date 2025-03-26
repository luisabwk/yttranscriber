# YouTube Transcriber API

Uma API robusta e eficiente para baixar vídeos do YouTube, extrair o áudio em formato MP3 e obter estatísticas detalhadas, incluindo o número de inscritos, utilizando múltiplas abordagens de fallback.

![YouTube to MP3](https://img.shields.io/badge/YouTube-MP3-red)
![Node.js](https://img.shields.io/badge/Node.js-14%2B-green)
![Express](https://img.shields.io/badge/Express-4.x-blue)

## ✨ Características

- **Download de Vídeos com Fallback:** Utiliza várias abordagens para contornar restrições anti-bot do YouTube, incluindo proxy residencial e front-ends alternativos.
- **Conversão para MP3:** Extração e conversão de áudio com alta qualidade usando FFmpeg.
- **Estatísticas Detalhadas:** Retorna informações do vídeo, como título, descrição, views, likes, dislikes, comentários e data de publicação.
- **Contagem de Inscritos Precisa:** Extração do número de inscritos do canal usando Puppeteer para interpretar valores abreviados (ex.: "1.46M" é convertido para 1.460.000).
- **Nome do Canal:** O nome do canal é incluído no JSON de resultado.
- **Transcrição (Opcional):** Suporte à transcrição do áudio via Assembly AI.

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

Certifique-se de ter o FFmpeg instalado:

```bash
# Para Ubuntu/Debian:
sudo apt update
sudo apt install -y ffmpeg
```

### 3. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto para definir suas variáveis de ambiente, por exemplo:

```dotenv
PORT=3000
ASSEMBLY_API_KEY=YOUR_ASSEMBLYAI_API_KEY
ENABLE_TRANSCRIPTION=true
IPROYAL_USERNAME=seu_usuario
IPROYAL_PASSWORD=sua_senha
```

### 4. Inicie o servidor

```bash
# Diretamente:
node index.js

# Ou com PM2 para rodar em segundo plano:
pm2 start index.js --name yt2mp3
```

O servidor iniciará na porta configurada (por padrão, 3000).

## 📝 Como Usar

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

A contagem de inscritos é obtida com Puppeteer, que interpreta corretamente valores como "1.46M subscribers" para 1.460.000.

### Baixar o Arquivo MP3

**Endpoint:** `GET /download/:fileId`

Use a URL fornecida na resposta do endpoint `/convert` para baixar o arquivo MP3.

### Verificar o Status da Tarefa

**Endpoint:** `GET /status/:taskId`

Use esse endpoint para verificar o progresso ou obter a URL de download após a conclusão.

## 📊 Exemplo de Uso com Node.js

```javascript
const axios = require('axios');
const fs = require('fs');

// URL base da API
const API_URL = 'http://localhost:3000';

async function convertAndDownload(youtubeUrl, outputPath) {
  // Solicita a conversão
  const conversion = await axios.post(`${API_URL}/convert`, { youtubeUrl });
  
  // Verifica o status e aguarda a conclusão (pode ser implementado com polling)
  console.log('Task ID:', conversion.data.taskId);
  
  // Baixa o arquivo (assumindo que o arquivo já esteja disponível)
  const response = await axios({
    method: 'GET',
    url: `${API_URL}${conversion.data.downloadUrl}`,
    responseType: 'stream'
  });
  
  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);
  
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

convertAndDownload('https://www.youtube.com/watch?v=exemplo', './musica.mp3')
  .then(() => console.log('Download completo!'))
  .catch(console.error);
```

## 📚 Estrutura do Projeto

```
yttranscriber/
├── index.js           # Arquivo principal da API
├── package.json       # Dependências e scripts
├── README.md          # Documentação do projeto
├── setup.sh           # Script de configuração (opcional)
└── temp/              # Diretório para arquivos temporários (criado automaticamente)
```

## 🔄 Sistema de Fallback

A API utiliza múltiplas abordagens para garantir o download dos vídeos, incluindo:
- **Proxy Residencial iProyal**
- **Front-ends Alternativos (Invidious, YouTube Music, Piped.video)**
- **Fallback via yt-dlp com configurações avançadas**

## ⚠️ Aviso Legal

Esta API é fornecida para fins educacionais. O download de conteúdo protegido por direitos autorais sem a devida permissão pode violar leis de direitos autorais. Utilize a API de forma responsável e em conformidade com as leis aplicáveis.
