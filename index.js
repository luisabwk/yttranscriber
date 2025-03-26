// Função auxiliar para interpretar a contagem de inscritos com abreviações
function parseSubscriberCount(text) {
  // Regex para capturar o valor numérico e o sufixo opcional (m ou k)
  const regex = /([\d.,]+)\s*([mk])?/i;
  const match = text.match(regex);
  if (match) {
    const num = parseFloat(match[1].replace(',', '.'));
    let multiplier = 1;
    if (match[2]) {
      const suffix = match[2].toLowerCase();
      if (suffix === 'm') {
        multiplier = 1000000;
      } else if (suffix === 'k') {
        multiplier = 1000;
      }
    }
    return Math.round(num * multiplier);
  }
  return 0;
}

// Função para buscar o número de inscritos usando Puppeteer a partir da página do vídeo
async function fetchChannelSubscribersWithPuppeteer(videoUrl) {
  let browser;
  try {
    console.log(`[${new Date().toISOString()}] Puppeteer - Iniciando navegador para ${videoUrl}`);
    browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(videoUrl, { waitUntil: 'networkidle2' });
    // Aguarda que o seletor esteja presente (timeout de 15 segundos)
    await page.waitForSelector('#owner-sub-count', { timeout: 15000 });
    const subText = await page.$eval('#owner-sub-count', el => el.textContent);
    console.log(`[${new Date().toISOString()}] Puppeteer - Texto obtido de #owner-sub-count: "${subText}"`);
    const count = parseSubscriberCount(subText);
    console.log(`[${new Date().toISOString()}] Puppeteer - Número de inscritos extraído: ${count}`);
    return count;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Puppeteer - Erro ao extrair inscritos: ${error.message}`);
    return 0;
  } finally {
    if (browser) await browser.close();
  }
}
