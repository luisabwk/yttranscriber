#!/bin/bash

# Script de configuração para YouTube to MP3 API com Proxy Residencial
echo "==== Iniciando configuração da YouTube to MP3 API ===="

# Verificar se é root
if [ "$EUID" -ne 0 ]; then
  echo "Por favor, execute como root ou use sudo"
  exit 1
fi

echo "==== Atualizando sistema ===="
apt update
apt upgrade -y

echo "==== Instalando dependências ===="
apt install -y ffmpeg python3 python3-pip curl wget unzip

echo "==== Instalando yt-dlp (substituto moderno do youtube-dl) ===="
pip3 install --upgrade yt-dlp

# Criar link simbólico para garantir que yt-dlp esteja no PATH
ln -sf /usr/local/bin/yt-dlp /usr/bin/yt-dlp

echo "==== Verificando Node.js ===="
if ! command -v node &> /dev/null; then
    echo "Node.js não encontrado, instalando..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
    echo "Node.js instalado: $(node --version)"
else
    echo "Node.js já instalado: $(node --version)"
fi

echo "==== Verificando npm ===="
echo "npm versão: $(npm --version)"

echo "==== Instalando PM2 globalmente ===="
npm install -g pm2

echo "==== Verificando pasta temporária ===="
mkdir -p temp
chmod 777 temp

echo "==== Instalando dependências Node.js ===="
npm install

echo "==== Verificando conectividade com o proxy ===="
# Teste básico para verificar se consegue se conectar ao proxy
if command -v curl &> /dev/null; then
    echo "Testando conexão com proxy iProyal..."
    PROXY="http://d4Xzafgb5TJfSLpI:YQhSnyw789HDtj4u_streaming-1@geo.iproyal.com:12321"
    RESULT=$(curl -s -m 10 -x "$PROXY" https://api.ipify.org || echo "FALHA")
    
    if [ "$RESULT" != "FALHA" ]; then
        echo "✅ Conexão com proxy bem-sucedida! IP público: $RESULT"
    else
        echo "⚠️ Não foi possível conectar ao proxy. Verifique as credenciais e conexão."
    fi
else
    echo "curl não encontrado. Pulando teste de proxy."
fi

echo "==== Testando yt-dlp com proxy ===="
if command -v yt-dlp &> /dev/null; then
    echo "Testando yt-dlp com proxy..."
    yt-dlp --proxy "$PROXY" --no-warnings --no-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ" || echo "⚠️ Teste de yt-dlp com proxy falhou"
else
    echo "yt-dlp não encontrado. Pulando teste."
fi

echo "==== Configuração completa! ===="
echo ""
echo "Para iniciar o serviço, execute:"
echo "pm2 start index.js --name yt2mp3"
echo ""
echo "Para verificar os logs:"
echo "pm2 logs yt2mp3"
echo ""
echo "Para configurar o serviço para iniciar automaticamente após reinicializações:"
echo "pm2 startup"
echo "pm2 save"
echo ""
