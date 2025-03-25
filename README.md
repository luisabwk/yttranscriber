# yttranscriber

Uma API robusta e eficiente para baixar vídeos do YouTube, converter para MP3 e realizar a transcrição automática com detecção do idioma do vídeo. A transcrição é entregue em formato JSON contendo o título do vídeo, o nome do canal e o texto da transcrição.

![YouTube to MP3](https://img.shields.io/badge/YouTube-MP3-red)
![Node.js](https://img.shields.io/badge/Node.js-14%2B-green)
![Express](https://img.shields.io/badge/Express-4.x-blue)

---

## ✨ Características

- ⬇️ Download de vídeos do YouTube com múltiplas abordagens de fallback (proxy residencial, Invidious, YouTube Music, Piped.video)
- 🎵 Conversão para MP3 de alta qualidade
- 🔗 URLs temporárias para download dos arquivos convertidos
- ⏱️ Expiração automática dos arquivos e transcrições (1 hora)
- 🔄 Transcrição automática do áudio com detecção do idioma do vídeo
- 📦 Transcrição entregue em JSON com os campos:
  - `videoTitle`: título do vídeo
  - `channel`: nome do canal do vídeo
  - `transcription`: texto da transcrição

---

## 📋 Pré-requisitos

- Node.js (versão 14 ou superior)
- npm ou yarn
- FFmpeg instalado no sistema
- Python 3 e pip (para instalação do yt-dlp)
- Variáveis de ambiente configuradas (por exemplo, as credenciais do proxy residencial e chave da API do Assembly AI)

---

## 🔧 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/yttranscriber.git
cd yttranscriber
```

### 2. Instale as dependências

Instale as dependências do Node.js (observe que agora utilizamos também as bibliotecas _dotenv_ e _axios_):

```bash
npm install
```

Para instalar as dependências do Python e o FFmpeg, siga as instruções abaixo (em sistemas baseados em Debian/Ubuntu):

```bash
sudo apt update
sudo apt install -y ffmpeg python3 python3-pip
pip3 install --upgrade yt-dlp
```

### 3. Configure o ambiente

Crie um arquivo `.env` na raiz do projeto e defina as variáveis necessárias, por exemplo:

```env
PORT=3000
IPROYAL_USERNAME=seu_usuario
IPROYAL_PASSWORD=sua_senha
ASSEMBLY_API_KEY=sua_chave_da_api
ENABLE_TRANSCRIPTION=true
```

### 4. Inicie o servidor

Você pode iniciar o servidor diretamente ou utilizando o PM2 para gerenciamento em segundo plano:

```bash
# Diretamente:
node index.js

# Com PM2:
pm2 start index.js --name yt2mp3
```

Por padrão, o servidor será iniciado na porta 3000. Você pode alterar essa porta definindo a variável de ambiente `PORT`.

---

## 📝 Como Usar

### Converter um Vídeo do YouTube para MP3 e Transcrição

**Endpoint:** `POST /convert`

**Corpo da Requisição (JSON):**

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=exemplo",
  "transcribe": true
}
```

- Se o campo `transcribe` for `true` e a transcrição estiver habilitada, a API realizará a transcrição automaticamente e retornará uma URL para acessar a transcrição.

**Resposta de Sucesso:**

```json
{
  "success": true,
  "message": "Tarefa de download iniciada. Transcrição será processada automaticamente após o download.",
  "taskId": "123e4567-e89b-12d3-a456-426614174000",
  "statusUrl": "/status/123e4567-e89b-12d3-a456-426614174000",
  "downloadUrl": "/download/123e4567-e89b-12d3-a456-426614174000",
  "estimatedDuration": "Alguns minutos, dependendo do tamanho do vídeo",
  "transcriptionRequested": true,
  "transcriptionStatus": "pending",
  "transcriptionUrl": "/transcription/123e4567-e89b-12d3-a456-426614174000"
}
```

### Baixar o Arquivo MP3

**Endpoint:** `GET /download/:fileId`

Utilize a URL fornecida na resposta anterior para baixar o arquivo MP3.

### Obter a Transcrição

**Endpoint:** `GET /transcription/:fileId`

A transcrição será retornada em formato JSON com a seguinte estrutura:

```json
{
  "videoTitle": "Título do vídeo",
  "channel": "Nome do canal",
  "transcription": "Texto da transcrição"
}
```

### Verificar o Status da Tarefa

**Endpoint:** `GET /status/:taskId`

Utilize este endpoint para verificar o status da tarefa de download e transcrição.

---

## 📊 Exemplo de Uso com Node.js

```javascript
const axios = require('axios');
const fs = require('fs');

const API_URL = 'http://localhost:3000';

async function convertAndDownload(youtubeUrl, outputPath) {
  // Solicitar a conversão
  const conversion = await axios.post(`${API_URL}/convert`, { youtubeUrl, transcribe: true });
  
  // Esperar alguns instantes e verificar o status se necessário
  // (aqui o exemplo baixa o arquivo diretamente após a conclusão da tarefa)
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

// Exemplo de uso:
convertAndDownload('https://www.youtube.com/watch?v=exemplo', './musica.mp3')
  .then(() => console.log('Download completo!'))
  .catch(console.error);
```

---

## 📁 Estrutura do Projeto

```
yttranscriber/
├── index.js          # Arquivo principal da API
├── package.json      # Dependências e scripts
├── README.md         # Documentação do projeto
└── temp/             # Diretório para armazenamento temporário dos arquivos
```

---

## 🔄 Sistema de Fallback e Transcrição

Esta API utiliza múltiplas abordagens para garantir o download dos vídeos mesmo em cenários com restrições automatizadas (uso de proxy residencial, Invidious, YouTube Music e Piped.video).

Além disso, se a transcrição estiver habilitada, o áudio é enviado para o Assembly AI e a transcrição é processada automaticamente. A transcrição é entregue no idioma detectado do vídeo e a resposta JSON inclui:
- **videoTitle:** Título do vídeo
- **channel:** Nome do canal
- **transcription:** Texto da transcrição

---

## ⚠️ Solução de Problemas

- **Erro "FFmpeg não encontrado":**  
  Certifique-se de que o FFmpeg está instalado corretamente. Execute:
  
  ```bash
  ffmpeg -version
  ```

- **Problemas de Conectividade com o Proxy:**  
  Verifique as credenciais e a conexão com o proxy residencial configurado no arquivo `.env`.

- **Erro de Transcrição:**  
  Confirme que a chave da API do Assembly AI está correta e que a transcrição está habilitada via variável de ambiente `ENABLE_TRANSCRIPTION`.

---

## 🔒 Aviso Legal

Esta API é fornecida apenas para fins educacionais. O download de conteúdo protegido por direitos autorais sem a devida autorização pode violar as leis de direitos autorais. Utilize esta ferramenta com responsabilidade e sempre em conformidade com as políticas e termos de serviço do YouTube.

---

## 📄 Licença

Este projeto está licenciado sob a [Licença MIT](LICENSE).
