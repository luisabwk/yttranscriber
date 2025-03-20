# YouTube to MP3 API

Uma API robusta e eficiente para baixar vídeos do YouTube, extrair o áudio em formato MP3 e disponibilizar através de URLs temporárias.

![YouTube to MP3](https://img.shields.io/badge/YouTube-MP3-red)
![Node.js](https://img.shields.io/badge/Node.js-14%2B-green)
![Express](https://img.shields.io/badge/Express-4.x-blue)

## ✨ Características

- ⬇️ Download de vídeos do YouTube com múltiplas abordagens de fallback
- 🍪 Suporte a autenticação do YouTube via cookies do navegador
- 🎵 Conversão para MP3 em alta qualidade
- 🔗 URLs temporárias para download
- ⏱️ Expiração automática após 1 hora
- 🧹 Limpeza automática de arquivos temporários

## 📋 Pré-requisitos

- Node.js (versão 14 ou superior)
- npm ou yarn
- FFmpeg instalado no sistema
- Google Chrome (para autenticação com o YouTube)
- yt-dlp (instalado automaticamente pelo script de setup)

## 🔧 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/youtube-to-mp3-api.git
cd youtube-to-mp3-api
```

### 2. Executar o script de instalação automatizado (Linux/Ubuntu)

Este script instalará todas as dependências necessárias, incluindo FFmpeg, yt-dlp, Google Chrome e configurará o ambiente.

```bash
chmod +x setup.sh
sudo ./setup.sh
```

Ou use o comando npm:

```bash
sudo npm run setup
```

### 3. Fazer login no YouTube

Para superar as restrições anti-bot do YouTube, você precisa fazer login em uma conta do YouTube no Chrome instalado no servidor:

```bash
google-chrome --no-sandbox https://youtube.com
```

Após fazer login, feche o navegador. Os cookies serão armazenados e utilizados automaticamente pela API.

### 4. Inicie o servidor

```bash
pm2 start index.js --name yt2mp3
```

Para verificar os logs:

```bash
pm2 logs yt2mp3
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
├── setup.sh          # Script de instalação e configuração
└── temp/             # Diretório para arquivos temporários (criado automaticamente)
```

## 🔄 Como funciona o sistema de fallback

Esta versão aprimorada da API utiliza um sistema de múltiplas abordagens para garantir o download mesmo quando o YouTube restringe acessos:

1. **Abordagem 1**: Utiliza cookies do navegador Chrome (requer login manual uma vez)
2. **Abordagem 2**: Tenta o download através do YouTube Music (às vezes tem menos restrições)
3. **Abordagem 3**: Utiliza configurações avançadas e formatos alternativos
4. **Abordagem 4**: Tenta download através de um front-end alternativo (Invidious)

Esse sistema de fallback aumenta significativamente a taxa de sucesso nos downloads.

## 📝 Notas importantes

- A API agora requer login no YouTube através do Chrome no servidor para funcionar corretamente.
- Os arquivos são automaticamente excluídos após uma hora para economizar espaço em disco.
- Esta API é apenas para uso educacional. Respeite os direitos autorais e os termos de serviço do YouTube.
- Considere implementar autenticação e limitação de taxa (rate limiting) em ambientes de produção.

## 🔧 Solução de problemas

### Erro "Sign in to confirm you're not a bot"
Esta versão resolve esse problema usando cookies do Chrome. Certifique-se de:
- Ter executado o script setup.sh
- Ter feito login manualmente no YouTube usando o Chrome do servidor

### Erro "FFmpeg não encontrado"
Certifique-se de que o FFmpeg está instalado corretamente:
```bash
ffmpeg -version
```

### Processo de conversão lento
O tempo de processamento depende do tamanho do vídeo original e da capacidade do servidor.

## 🚀 Possíveis melhorias

- [ ] Adicionar autenticação para proteger a API
- [ ] Implementar limitação de taxa (rate limiting)
- [ ] Adicionar suporte para diferentes formatos de áudio
- [ ] Criar um sistema de fila para processar múltiplas solicitações
