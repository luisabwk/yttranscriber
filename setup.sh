#!/bin/bash

# Script de configuração para YouTube to MP3 API
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

echo "==== Instalando Google Chrome (para autenticação de cookies) ===="
cd /tmp
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt install -y ./google-chrome-stable_current_amd64.deb
rm ./google-chrome-stable_current_amd64.deb

echo "==== Verificando instalação do Chrome ===="
CHROME_VERSION=$(google-chrome --version)
echo "Chrome instalado: $CHROME_VERSION"

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

echo "==== Etapa final: instruções para login no YouTube ===="
echo ""
echo "==================================================================="
echo "IMPORTANTE: É necessário fazer login no YouTube para obter cookies"
echo "==================================================================="
echo ""
echo "Execute os seguintes comandos para fazer login no YouTube:"
echo ""
echo "1. Execute: google-chrome --no-sandbox https://youtube.com"
echo "2. Faça login na sua conta do YouTube"
echo "3. Feche o navegador após o login"
echo ""

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
