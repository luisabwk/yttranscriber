# YouTube to MP3 API

Uma API simples e eficiente para baixar vídeos do YouTube, extrair o áudio em formato MP3 e disponibilizar através de URLs temporárias.

![YouTube to MP3](https://img.shields.io/badge/YouTube-MP3-red)
![Node.js](https://img.shields.io/badge/Node.js-14%2B-green)
![Express](https://img.shields.io/badge/Express-4.x-blue)

## ✨ Características

- ⬇️ Download de vídeos do YouTube
- 🎵 Conversão para MP3 em alta qualidade
- 🔗 URLs temporárias para download
- ⏱️ Expiração automática após 1 hora
- 🧹 Limpeza automática de arquivos temporários

## 📋 Pré-requisitos

- Node.js (versão 14 ou superior)
- npm ou yarn
- FFmpeg instalado no sistema

## 🔧 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/youtube-to-mp3-api.git
cd youtube-to-mp3-api
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Instale o FFmpeg (se ainda não tiver)

#### Windows:
1. Baixe o FFmpeg de https://ffmpeg.org/download.html
2. Extraia os arquivos para uma pasta (ex: C:\ffmpeg)
3. Adicione o caminho para a pasta bin (ex: C:\ffmpeg\bin) ao PATH do sistema

#### macOS:
```bash
brew install ffmpeg
```

#### Linux (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install ffmpeg
```

### 4. Inicie o servidor

```bash
npm start
```

Por padrão, o servidor iniciará na porta 3000. Você pode alterar isso definindo a variável de ambiente `PORT`.

## 📝 Como usar

### Converter um vídeo do YouTube para MP3

**Endpoint:** `POST /convert`

**Corpo da requisição (JSON):**
```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=exemplo"
}
```

**Resposta de sucesso:**
```json
{
  "success": true,
  "title": "Título do Vídeo",
  "downloadUrl": "/download/123e4567-e89b-12d3-a456-426614174000",
  "expiresIn": "Uma hora"
}
```

### Baixar o arquivo MP3

**Endpoint:** `GET /download/:fileId`

Use a URL fornecida na resposta anterior para baixar o arquivo MP3.

### Verificar status da API

**Endpoint:** `GET /status`

**Resposta:**
```json
{
  "status": "online"
}
```

## 📊 Exemplo de uso com Node.js

```javascript
const axios = require('axios');
const fs = require('fs');

// URL base da API
const API_URL = 'http://localhost:3000';

async function convertAndDownload(youtubeUrl, outputPath) {
  // Etapa 1: Solicitar a conversão
  const conversion = await axios.post(`${API_URL}/convert`, {
    youtubeUrl: youtubeUrl
  });
  
  // Etapa 2: Baixar o arquivo
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

// Uso:
convertAndDownload('https://www.youtube.com/watch?v=exemplo', './musica.mp3')
  .then(() => console.log('Download completo!'))
  .catch(console.error);
```

## 📚 Estrutura do projeto

```
youtube-to-mp3-api/
├── index.js          # Arquivo principal da API
├── package.json      # Dependências e scripts
└── temp/             # Diretório para arquivos temporários (criado automaticamente)
```

## 📝 Notas importantes

- Os arquivos são automaticamente excluídos após uma hora para economizar espaço em disco.
- Esta API é apenas para uso educacional. Respeite os direitos autorais e os termos de serviço do YouTube.
- Considere implementar autenticação e limitação de taxa (rate limiting) em ambientes de produção.

## 🔧 Solução de problemas

### Erro "FFmpeg não encontrado"
Certifique-se de que o FFmpeg está instalado e disponível no PATH do sistema.

### Erro ao baixar vídeos
Verifique se a URL do YouTube é válida e se o vídeo está disponível publicamente.

### Processo de conversão lento
O tempo de processamento depende do tamanho do vídeo original.

## 🚀 Possíveis melhorias

- [ ] Adicionar autenticação para proteger a API
- [ ] Implementar limitação de taxa (rate limiting)
- [ ] Adicionar suporte para diferentes formatos de áudio
- [ ] Criar um sistema de fila para processar múltiplas solicitações
- [ ] Implementar um frontend web para interface de usuário

## 📄 Licença

Este projeto está licenciado sob a [Licença MIT](LICENSE).

## ⚠️ Aviso legal

Esta API é fornecida apenas para fins educacionais. O download de conteúdo protegido por direitos autorais sem a permissão dos detentores dos direitos pode violar leis de direitos autorais. Os usuários são responsáveis por garantir que seu uso desta API esteja em conformidade com as leis e regulamentos aplicáveis.
