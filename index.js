// yttranscriber/index.js
require('dotenv').config(); // Load variables from the .env file

const express = require('express');
const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const axios = require('axios');
const puppeteer = require('puppeteer'); // For retrieving rendered data via Puppeteer

const app = express();
const PORT = process.env.PORT || 3000;

// Function to validate a YouTube URL
function validateYouTubeUrl(url) {
  return url.includes('youtube.com/') || url.includes('youtu.be/');
}

// Function to fetch the channel's subscriber count using Puppeteer from the video page
async function fetchChannelSubscribersWithPuppeteer(videoUrl) {
  let browser;
  try {
    console.log(`[${new Date().toISOString()}] Puppeteer approach failed: ${puppeteerError.message}`);
    // Continue with other approaches
  }
  catch (error) {
    console.error(`[${new Date().toISOString()}] Puppeteer - Error extracting subscribers: ${error.message}`);
    return 0;
  } finally {
    if (browser) await browser.close();
  }
}
  // Approach 1: Use Fixed Proxy
  try {
    console.log(`[${new Date().toISOString()}] Attempting approach 1: Fixed IP Proxy`);
    const proxyOptions = [
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--no-warnings',
      '--proxy', proxyUrl,
      '--no-check-certificate',
      '--geo-bypass',
      '--ignore-errors',
      '--limit-rate', '500K',
      '--user-agent', userAgent,
      '-o', outputTemplate,
      youtubeUrl
    ];
    await executeYtDlp(proxyOptions);
    console.log(`[${new Date().toISOString()}] Fixed proxy approach successful!`);
    return { success: true };
  } catch (errorProxy) {
    console.log(`[${new Date().toISOString()}] Fixed proxy approach failed: ${errorProxy.message}`);
    // Approach 2: Invidious Instances
    try {
      console.log(`[${new Date().toISOString()}] Attempting approach 2: Invidious Proxy`);
      const invidiousInstances = [
        'yewtu.be',
        'invidious.snopyta.org',
        'vid.puffyan.us',
        'invidious.kavin.rocks',
        'invidious.namazso.eu',
        'inv.riverside.rocks'
      ];
      for (const instance of invidiousInstances) {
        try {
          const invidiousUrl = `https://${instance}/watch?v=${videoId}`;
          console.log(`[${new Date().toISOString()}] All attempts to fetch information failed`);
          throw err3;
        }
      }
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching video information:`, error);
    return { title: `YouTube Video - ${videoId || 'Unknown'}` };
  }
}

// ----------------------------------------------------------------
// Function to transcribe audio using Assembly AI
// ----------------------------------------------------------------
async function transcribeAudio(audioFilePath, fileId) {
  try {
    console.log(`[${new Date().toISOString()}] Starting transcription for ${fileId}`);
    if (!ENABLE_TRANSCRIPTION || !ASSEMBLY_API_KEY || ASSEMBLY_API_KEY === 'YOUR_API_KEY_HERE') {
      console.log(`[${new Date().toISOString()}] Transcription disabled or API key not configured`);
      return {
        success: false,
        message: 'Transcription disabled or API key not configured'
      };
    }
    if (pendingTasks.has(fileId)) {
      const taskInfo = pendingTasks.get(fileId);
      taskInfo.transcriptionStatus = 'uploading';
      pendingTasks.set(fileId, taskInfo);
    }
    const audioFile = fs.readFileSync(audioFilePath);
    const audioSize = fs.statSync(audioFilePath).size;
    console.log(`[${new Date().toISOString()}] Audio file size: ${audioSize} bytes`);
    const uploadResponse = await axios.post('https://api.assemblyai.com/v2/upload', audioFile, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Authorization': ASSEMBLY_API_KEY
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    const audioUrl = uploadResponse.data.upload_url;
    console.log(`[${new Date().toISOString()}] Audio successfully uploaded to Assembly AI: ${audioUrl}`);
    if (pendingTasks.has(fileId)) {
      const taskInfo = pendingTasks.get(fileId);
      taskInfo.transcriptionStatus = 'processing';
      pendingTasks.set(fileId, taskInfo);
    }
    const transcriptResponse = await axios.post('https://api.assemblyai.com/v2/transcript', {
      audio_url: audioUrl,
      language_detection: true
    }, {
      headers: {
        'Authorization': ASSEMBLY_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    const transcriptId = transcriptResponse.data.id;
    console.log(`[${new Date().toISOString()}] Transcription started with ID: ${transcriptId}`);
    let transcriptResult;
    let isCompleted = false;
    while (!isCompleted) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const checkResponse = await axios.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: {
          'Authorization': ASSEMBLY_API_KEY
        }
      });
      const status = checkResponse.data.status;
      console.log(`[${new Date().toISOString()}] Transcription status: ${status}`);
      if (status === 'completed') {
        isCompleted = true;
        transcriptResult = checkResponse.data;
      } else if (status === 'error') {
        throw new Error(`Transcription error: ${checkResponse.data.error}`);
      }
    }
    const transcriptionText = transcriptResult.text;
    const detectedLanguage = transcriptResult.language_code || 'Not detected';
    const taskInfo = pendingTasks.get(fileId) || {};
    const videoTitle = taskInfo.title || `YouTube Video - ${fileId}`;
    const channel = taskInfo.channel || 'Unknown';
    transcriptions.set(fileId, {
      text: transcriptionText,
      raw: transcriptResult,
      language: detectedLanguage,
      created: Date.now(),
      expiresAt: Date.now() + EXPIRATION_TIME,
      videoTitle,
      channel
    });
    if (pendingTasks.has(fileId)) {
      const taskInfo = pendingTasks.get(fileId);
      taskInfo.transcriptionStatus = 'completed';
      taskInfo.hasTranscription = true;
      taskInfo.transcriptionUrl = `/transcription/${fileId}`;
      taskInfo.detectedLanguage = detectedLanguage;
      pendingTasks.set(fileId, taskInfo);
    }
    console.log(`[${new Date().toISOString()}] Transcription successfully completed for ${fileId} in language ${detectedLanguage}`);
    return {
      success: true,
      transcription: transcriptionText,
      language: detectedLanguage
    };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in transcription:`, error.message);
    if (pendingTasks.has(fileId)) {
      const taskInfo = pendingTasks.get(fileId);
      taskInfo.transcriptionStatus = 'failed';
      taskInfo.transcriptionError = error.message;
      pendingTasks.set(fileId, taskInfo);
    }
    return {
      success: false,
      error: error.message
    };
  }
}

// ----------------------------------------------------------------
// Start the server
// ----------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
});

// Export app for testing
module.exports = app; Using Invidious URL: ${invidiousUrl}`);
          const invidiousOptions = [
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '--no-warnings',
            '--no-check-certificate',
            '--geo-bypass',
            '--ignore-errors',
            '--proxy', proxyUrl,
            '--limit-rate', '500K',
            '--user-agent', userAgent,
            '-o', outputTemplate,
            invidiousUrl
          ];
          await executeYtDlp(invidiousOptions);
          console.log(`[${new Date().toISOString()}] Download with ${instance} successful!`);
          return { success: true };
        } catch (err) {
          console.log(`[${new Date().toISOString()}] Failed with ${instance}: ${err.message}`);
        }
      }
      throw new Error('All Invidious instances failed');
    } catch (error2) {
      console.log(`[${new Date().toISOString()}] Approach 2 (Invidious) failed: ${error2.message}`);
      // Approach 3: Advanced settings
      try {
        console.log(`[${new Date().toISOString()}] Attempting approach 3: Advanced settings`);
        const advancedOptions = [
          '--extract-audio',
          '--audio-format', 'mp3',
          '--audio-quality', '0',
          '--no-warnings',
          '--format', 'bestaudio[ext=m4a]/bestaudio/best',
          '--no-check-certificate',
          '--geo-bypass',
          '--ignore-errors',
          '--no-playlist',
          '--proxy', proxyUrl,
          '--limit-rate', '500K',
          '--user-agent', userAgent,
          '--extractor-args', 'youtube:skip_webpage=True',
          '-o', outputTemplate,
          youtubeUrl
        ];
        await executeYtDlp(advancedOptions);
        console.log(`[${new Date().toISOString()}] Approach 3 successful!`);
        return { success: true };
      } catch (error3) {
        console.log(`[${new Date().toISOString()}] Approach 3 failed: ${error3.message}`);
        // Approach 4: YouTube Music
        try {
          console.log(`[${new Date().toISOString()}] Attempting approach 4: YouTube Music`);
          const ytMusicUrl = youtubeUrl.replace('youtube.com', 'music.youtube.com');
          console.log(`[${new Date().toISOString()}] Using YouTube Music URL: ${ytMusicUrl}`);
          const ytMusicOptions = [
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '--no-warnings',
            '--no-check-certificate',
            '--geo-bypass',
            '--ignore-errors',
            '--no-playlist',
            '--proxy', proxyUrl,
            '--limit-rate', '500K',
            '--user-agent', userAgent,
            '-o', outputTemplate,
            ytMusicUrl
          ];
          await executeYtDlp(ytMusicOptions);
          console.log(`[${new Date().toISOString()}] Approach 4 successful!`);
          return { success: true };
        } catch (error4) {
          console.log(`[${new Date().toISOString()}] Approach 4 failed: ${error4.message}`);
          // Approach 5: Piped.video
          try {
            console.log(`[${new Date().toISOString()}] Approach 5 failed: ${error5.message}`);
            throw new Error('All download approaches failed. YouTube is blocking automated access.');
          }
        }
      }
    }
  }
}

// ----------------------------------------------------------------
// Function to fetch video information
// ----------------------------------------------------------------
async function getVideoInfo(youtubeUrl) {
  try {
    console.log(`[${new Date().toISOString()}] Fetching video information for: ${youtubeUrl}`);
    let videoId = '';
    if (youtubeUrl.includes('youtube.com/watch?v=')) {
      videoId = new URL(youtubeUrl).searchParams.get('v');
    } else if (youtubeUrl.includes('youtu.be/')) {
      videoId = youtubeUrl.split('youtu.be/')[1].split('?')[0];
    }
    if (!videoId) {
      throw new Error('Failed to extract video ID');
    }
    
    // First try using Puppeteer to get video info
    try {
      console.log(`[${new Date().toISOString()}] Attempting to fetch information via Puppeteer`);
      let browser;
      try {
        browser = await puppeteer.launch({
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            `--proxy-server=${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
          ],
          headless: true
        });
        
        const page = await browser.newPage();
        
        // Configure proxy authentication
        await page.authenticate({
          username: process.env.PROXY_USERNAME,
          password: process.env.PROXY_PASSWORD
        });
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36');
        
        await page.goto(youtubeUrl, { 
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        
        // Get video info from page
        const videoInfo = await page.evaluate(() => {
          if (typeof ytInitialPlayerResponse !== 'undefined') {
            const data = ytInitialPlayerResponse;
            const videoDetails = data.videoDetails || {};
            const microformat = data.microformat?.playerMicroformatRenderer || {};
            
            return {
              title: videoDetails.title || '',
              description: videoDetails.shortDescription || '',
              view_count: parseInt(videoDetails.viewCount || 0),
              like_count: parseInt(data.videoPrimaryInfoRenderer?.videoActions?.menuRenderer?.topLevelButtons?.[0]?.toggleButtonRenderer?.defaultText?.simpleText?.replace(/\D/g, '') || 0),
              channel: videoDetails.author || '',
              uploader: videoDetails.author || '',
              upload_date: microformat.uploadDate ? microformat.uploadDate.replace(/-/g, '') : ''
            };
          }
          return null;
        });
        
        if (videoInfo) {
          console.log(`[${new Date().toISOString()}] Video info successfully extracted via Puppeteer`);
          return videoInfo;
        }
      } catch (err) {
        console.log(`[${new Date().toISOString()}] Error in Puppeteer info extraction: ${err.message}`);
      } finally {
        if (browser) await browser.close();
      }
    } catch (puppeteerError) {
      console.log(`[${new Date().toISOString()}] Puppeteer approach for info failed: ${puppeteerError.message}`);
    }
    
    // Use fixed proxy from environment variables
    const proxyUrl = `http://${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';
    
    try {
      console.log(`[${new Date().toISOString()}] Attempting to fetch information via fixed proxy`);
      const info = await youtubedl(youtubeUrl, {
        dumpSingleJson: true,
        noWarnings: true,
        noCallHome: true,
        proxy: proxyUrl,
        userAgent: userAgent,
        noCheckCertificate: true,
        geoBypass: true,
        noPlaylist: true
      });
      return info;
    } catch (err) {
      console.log(`[${new Date().toISOString()}] Failed to fetch information via fixed proxy: ${err.message}`);
      try {
        console.log(`[${new Date().toISOString()}] Attempting to fetch information via Invidious`);
        const invidiousUrl = `https://yewtu.be/watch?v=${videoId}`;
        const info = await youtubedl(invidiousUrl, {
          dumpSingleJson: true,
          noWarnings: true,
          noCallHome: true,
          proxy: proxyUrl,
          userAgent: userAgent,
          noCheckCertificate: true,
          geoBypass: true,
          noPlaylist: true
        });
        return info;
      } catch (err2) {
        console.log(`[${new Date().toISOString()}] Failed to fetch information via Invidious: ${err2.message}`);
        try {
          const info = await youtubedl(youtubeUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            preferFreeFormats: true,
            youtubeSkipDashManifest: true,
            proxy: proxyUrl,
            userAgent: userAgent,
            noCheckCertificate: true,
            geoBypass: true,
            noPlaylist: true,
            skipDownload: true
          });
          
          return info;
        } catch (err3) {
          console.log(`[${new Date().toISOString()}] Attempting approach 5: Piped.video`);
            const pipedUrl = `https://piped.video/watch?v=${videoId}`;
            console.log(`[${new Date().toISOString()}] Using Piped URL: ${pipedUrl}`);
            const pipedOptions = [
              '--extract-audio',
              '--audio-format', 'mp3',
              '--audio-quality', '0',
              '--no-warnings',
              '--no-check-certificate',
              '--geo-bypass',
              '--ignore-errors',
              '--no-playlist',
              '--proxy', proxyUrl,
              '--limit-rate', '500K',
              '--user-agent', userAgent,
              '--force-ipv4',
              '-o', outputTemplate,
              pipedUrl
            ];
            await executeYtDlp(pipedOptions);
            console.log(`[${new Date().toISOString()}] Approach 5 successful!`);
            return { success: true };
          } catch (error5) {
            console.log(`[${new Date().toISOString()}] Puppeteer - Launching browser for ${videoUrl}`);
    browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(videoUrl, { waitUntil: 'networkidle2' });
    // Wait for the selector to be present (15 seconds timeout)
    await page.waitForSelector('#owner-sub-count', { timeout: 15000 });
    const subText = await page.$eval('#owner-sub-count', el => el.textContent);
    console.log(`[${new Date().toISOString()}] Puppeteer - Text obtained from #owner-sub-count: "${subText}"`);
    
    // Parse subscriber count with various suffixes
    // Handles: K, M, B and text-based suffixes like "mil", "mi", "bi"
    const match = subText.match(/(\d+(?:[.,]\d+)?)\s*([KMB]|mil|mi|bi)?/i);
    
    if (match) {
      // Parse the base number, handling both dot and comma as decimal separators
      let count = parseFloat(match[1].replace(',', '.'));
      const suffix = match[2]?.toLowerCase();
      
      // Apply multiplier based on suffix
      if (suffix === 'k' || suffix === 'mil') {
        count *= 1000;
      } else if (suffix === 'm' || suffix === 'mi') {
        count *= 1000000;
      } else if (suffix === 'b' || suffix === 'bi') {
        count *= 1000000000;
      }
      
      // Convert to integer
      count = Math.round(count);
      
      console.log(`[${new Date().toISOString()}] Puppeteer - Extracted subscriber count: ${count} (from "${subText}")`);
      return count;
    }
    
    console.log(`[${new Date().toISOString()}] Puppeteer - Could not parse subscriber count from "${subText}"`);
    return 0;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Puppeteer - Error extracting subscribers: ${error.message}`);
    return 0;
  } finally {
    if (browser) await browser.close();
  }
}

// New function to get direct stream URL using Puppeteer
async function getDirectStreamUrl(youtubeUrl) {
  let browser;
  try {
    console.log(`[${new Date().toISOString()}] Puppeteer - Launching browser for stream extraction: ${youtubeUrl}`);
    
    // Launch browser with specific settings to avoid detection
    browser = await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        `--proxy-server=${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`
      ],
      headless: true
    });
    
    const page = await browser.newPage();
    
    // Configure proxy authentication
    await page.authenticate({
      username: process.env.PROXY_USERNAME,
      password: process.env.PROXY_PASSWORD
    });
    
    // Configure browser fingerprint to appear more human
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });
    
    // Set more realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36');
    
    // Set additional headers for greater legitimacy
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Enable JavaScript to process captchas and other challenges
    await page.setJavaScriptEnabled(true);
    
    // Intercept requests to analyze media URLs
    let videoUrl = null;
    await page.setRequestInterception(true);
    
    page.on('request', request => {
      request.continue();
    });
    
    page.on('response', async response => {
      const url = response.url();
      // Detect audio stream URLs
      if (url.includes('audioplayback') || 
          (url.includes('videoplayback') && url.includes('mime=audio'))) {
        console.log(`[${new Date().toISOString()}] Puppeteer - Found potential stream URL: ${url}`);
        videoUrl = url;
      }
    });
    
    console.log(`[${new Date().toISOString()}] Puppeteer - Navigating to ${youtubeUrl}`);
    
    // Navigate to the page with longer timeout
    await page.goto(youtubeUrl, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    console.log(`[${new Date().toISOString()}] Puppeteer - Page loaded, checking elements`);
    
    // Check for captcha verification and try to handle it
    if (await page.$('iframe[src*="recaptcha"]') !== null) {
      console.log(`[${new Date().toISOString()}] Puppeteer - ReCaptcha detected, waiting...`);
      // Wait for possible expiration or auto-bypass (some captchas expire)
      await page.waitForTimeout(5000);
    }
    
    // Click the play button to activate video loading
    try {
      if (await page.$('.ytp-play-button') !== null) {
        await page.click('.ytp-play-button');
        console.log(`[${new Date().toISOString()}] Puppeteer - Play button clicked`);
        // Wait for stream to load
        await page.waitForTimeout(3000);
      }
    } catch (err) {
      console.log(`[${new Date().toISOString()}] Puppeteer - Error clicking play: ${err.message}`);
    }
    
    // If URL not found via interception, try extracting via YouTube's JavaScript
    if (!videoUrl) {
      try {
        videoUrl = await page.evaluate(() => {
          // Try extracting from YouTube player API
          if (typeof ytplayer !== 'undefined' && ytplayer.config) {
            const formats = ytplayer.config.args.adaptive_fmts || '';
            const audioFormats = formats.split(',').filter(f => f.includes('audio'));
            if (audioFormats.length > 0) {
              return decodeURIComponent(audioFormats[0].split('&')[0].split('=')[1]);
            }
          }
          return null;
        });
        
        if (videoUrl) {
          console.log(`[${new Date().toISOString()}] Puppeteer - Audio URL extracted via JavaScript: ${videoUrl}`);
        }
      } catch (err) {
        console.log(`[${new Date().toISOString()}] Puppeteer - Error extracting via JavaScript: ${err.message}`);
      }
    }
    
    // If still not found, try alternative method
    if (!videoUrl) {
      try {
        // Wait a bit longer and capture all network URLs
        await page.waitForTimeout(5000);
        const client = await page.target().createCDPSession();
        await client.send('Network.enable');
        const resources = await client.send('Network.getResponseBodyForInterception');
        
        for (const resource of resources) {
          if (resource.url && resource.url.includes('videoplayback') && resource.url.includes('mime=audio')) {
            videoUrl = resource.url;
            break;
          }
        }
      } catch (err) {
        console.log(`[${new Date().toISOString()}] Puppeteer - Error in alternative method: ${err.message}`);
      }
    }
    
    if (videoUrl) {
      console.log(`[${new Date().toISOString()}] Puppeteer - Stream URL found successfully`);
      return { success: true, url: videoUrl };
    } else {
      console.log(`[${new Date().toISOString()}] Puppeteer - Could not extract stream URL`);
      return { success: false, error: 'Could not find stream URL' };
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Puppeteer - Error getting stream URL:`, error);
    return { success: false, error: error.message };
  } finally {
    if (browser) {
      await browser.close();
      console.log(`[${new Date().toISOString()}] Puppeteer - Browser closed`);
    }
  }
}

// Directory to store temporary files
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Expiration time (in milliseconds) - 1 hour
const EXPIRATION_TIME = 60 * 60 * 1000;

// Storage for temporary files, pending tasks, and transcriptions
const tempFiles = new Map();
const pendingTasks = new Map();
const transcriptions = new Map();

// Assembly AI API and transcription configuration
const ASSEMBLY_API_KEY = process.env.ASSEMBLY_API_KEY || 'YOUR_API_KEY_HERE';
const ENABLE_TRANSCRIPTION = process.env.ENABLE_TRANSCRIPTION === 'true' || false;

// ----------------------------------------------------------------
// Conversion Queue (Job Queue) and Concurrency Control
// ----------------------------------------------------------------
const conversionQueue = [];
let activeJobs = 0;
const MAX_CONCURRENT_JOBS = 2; // For droplet with 1 vCPU

function enqueueJob(job) {
  conversionQueue.push(job);
  processQueue();
}

async function processQueue() {
  if (activeJobs < MAX_CONCURRENT_JOBS && conversionQueue.length > 0) {
    activeJobs++;
    const job = conversionQueue.shift();
    try {
      await job();
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Error in job:`, e);
    }
    activeJobs--;
    processQueue();
  }
}

// ----------------------------------------------------------------
// Middlewares
// ----------------------------------------------------------------
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// ----------------------------------------------------------------
// Routes
// ----------------------------------------------------------------

// Route for file download
app.get('/download/:fileId', (req, res) => {
  const { fileId } = req.params;
  if (!tempFiles.has(fileId)) {
    return res.status(404).json({ error: 'File not found or expired' });
  }
  const fileInfo = tempFiles.get(fileId);
  if (!fs.existsSync(fileInfo.path)) {
    tempFiles.delete(fileId);
    return res.status(404).json({ error: 'File not found' });
  }
  if (Date.now() > fileInfo.expiresAt) {
    fs.unlinkSync(fileInfo.path);
    tempFiles.delete(fileId);
    return res.status(404).json({ error: 'File expired' });
  }
  res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
  res.setHeader('Content-Type', 'audio/mpeg');
  const fileStream = fs.createReadStream(fileInfo.path);
  fileStream.pipe(res);
});

// General API status route
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.1.0',
    message: 'API is running normally'
  });
});

// Route to obtain the transcription with the requested structure
app.get('/transcription/:fileId', (req, res) => {
  const { fileId } = req.params;
  if (!transcriptions.has(fileId)) {
    return res.status(404).json({ error: 'Transcription not found or expired' });
  }
  const transcription = transcriptions.get(fileId);
  if (Date.now() > transcription.expiresAt) {
    transcriptions.delete(fileId);
    return res.status(404).json({ error: 'Transcription expired' });
  }
  return res.json({
    videoTitle: transcription.videoTitle,
    channel: transcription.channel,
    transcription: transcription.text
  });
});

// Route to check the status of a task
app.get('/status/:taskId', (req, res) => {
  const { taskId } = req.params;
  const includeTranscription = req.query.includeTranscription === 'true';
  if (!pendingTasks.has(taskId)) {
    if (tempFiles.has(taskId)) {
      const response = {
        status: 'completed',
        downloadUrl: `/download/${taskId}`,
        expiresAt: new Date(tempFiles.get(taskId).expiresAt).toISOString()
      };
      if (includeTranscription && transcriptions.has(taskId)) {
        response.transcription = {
          text: transcriptions.get(taskId).text,
          language: transcriptions.get(taskId).language,
          completedAt: new Date(transcriptions.get(taskId).created).toISOString()
        };
      }
      return res.json(response);
    }
    return res.status(404).json({ error: 'Task not found' });
  }
  const taskInfo = pendingTasks.get(taskId);
  const response = {
    taskId,
    status: taskInfo.status,
    title: taskInfo.title,
    created: new Date(taskInfo.created).toISOString(),
    downloadUrl: taskInfo.status === 'completed' ? taskInfo.downloadUrl : null,
    error: taskInfo.error || null
  };
  if (taskInfo.transcriptionRequested) {
    response.transcriptionRequested = true;
    response.transcriptionStatus = taskInfo.transcriptionStatus;
    response.detectedLanguage = taskInfo.detectedLanguage || null;
    if (taskInfo.hasTranscription && includeTranscription && transcriptions.has(taskId)) {
      response.transcription = {
        text: transcriptions.get(taskId).text,
        language: transcriptions.get(taskId).language,
        completedAt: new Date(transcriptions.get(taskId).created).toISOString()
      };
    }
    if (taskInfo.transcriptionStatus === 'completed') {
      response.transcriptionUrl = taskInfo.transcriptionUrl;
    }
    if (taskInfo.transcriptionError) {
      response.transcriptionError = taskInfo.transcriptionError;
    }
  }
  res.json(response);
});

// New /stats Endpoint to fetch video statistics
app.post('/stats', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] /stats - Request received for ${req.body.youtubeUrl}`);
    const { youtubeUrl } = req.body;
    if (!youtubeUrl) {
      console.log(`[${new Date().toISOString()}] /stats - YouTube URL not provided`);
      return res.status(400).json({ error: 'YouTube URL is required' });
    }
    if (!validateYouTubeUrl(youtubeUrl)) {
      console.log(`[${new Date().toISOString()}] /stats - Invalid URL: ${youtubeUrl}`);
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    // Get video metadata using yt-dlp
    const info = await getVideoInfo(youtubeUrl);
    console.log(`[${new Date().toISOString()}] /stats - Metadata obtained:`, info);

    // Format the upload date (assuming YYYYMMDD format)
    let uploadDate = 'Unknown';
    if (info.upload_date && info.upload_date.length === 8) {
      uploadDate = `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6)}`;
      console.log(`[${new Date().toISOString()}] /stats - Upload date: ${uploadDate}`);
    }
    
    // Get subscriber count using Puppeteer
    const subscriberCount = await fetchChannelSubscribersWithPuppeteer(youtubeUrl);
    console.log(`[${new Date().toISOString()}] /stats - Subscriber count (via Puppeteer): ${subscriberCount}`);
    
    const stats = {
      videoTitle: info.title || 'Unknown',
      description: info.description || 'No description',
      views: info.view_count || 0,
      likes: info.like_count || 0,
      dislikes: info.dislike_count || 0,
      commentCount: info.comment_count || 0,
      subscriberCount: subscriberCount,
      uploadDate: uploadDate
    };
    console.log(`[${new Date().toISOString()}] /stats - Final data:`, stats);
    return res.json(stats);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] /stats - Error fetching statistics:`, error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// /convert route to process the request using the queue
app.post('/convert', async (req, res) => {
  try {
    const { youtubeUrl, transcribe } = req.body;
    if (!youtubeUrl) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }
    if (!validateYouTubeUrl(youtubeUrl)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    console.log(`[${new Date().toISOString()}] Processing URL: ${youtubeUrl}`);
    const fileId = uuidv4();
    const videoPath = path.join(TEMP_DIR, `${fileId}.mp4`);
    const audioPath = path.join(TEMP_DIR, `${fileId}.mp3`);
    const shouldTranscribe = (transcribe === true || transcribe === 'true') && ENABLE_TRANSCRIPTION;
    let videoTitle = `YouTube Video - ${fileId}`;
    let taskStatus = 'pending';
    pendingTasks.set(fileId, {
      status: taskStatus,
      title: videoTitle,
      channel: 'Unknown',
      url: youtubeUrl,
      created: Date.now(),
      downloadUrl: `/download/${fileId}`,
      transcriptionRequested: shouldTranscribe,
      transcriptionStatus: shouldTranscribe ? 'pending' : null,
      hasTranscription: false
    });
    try {
      const videoInfo = await getVideoInfo(youtubeUrl);
      videoTitle = videoInfo.title || `YouTube Video - ${fileId}`;
      const channel = videoInfo.uploader || videoInfo.channel || 'Unknown';
      if (pendingTasks.has(fileId)) {
        const taskInfo = pendingTasks.get(fileId);
        taskInfo.title = videoTitle;
        taskInfo.channel = channel;
        pendingTasks.set(fileId, taskInfo);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error fetching video info:`, error);
    }
    enqueueJob(async () => {
      try {
        await downloadYouTubeAudio(youtubeUrl, videoPath);
        const possiblePaths = [
          videoPath,
          videoPath.replace('.mp4', '.mp3'),
          videoPath.replace('.mp4', '.m4a'),
          videoPath.replace('.mp4', '.webm')
        ];
        let existingFile = null;
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            existingFile = p;
            break;
          }
        }
        if (!existingFile) {
          throw new Error('Downloaded file not found. Download failed.');
        }
        if (!existingFile.endsWith('.mp3')) {
          await new Promise((resolve, reject) => {
            ffmpeg(existingFile)
              .outputOptions('-q:a', '0')
              .saveToFile(audioPath)
              .on('end', () => {
                try {
                  fs.unlinkSync(existingFile);
                } catch (err) {
                  console.error(`[${new Date().toISOString()}] Error removing original file:`, err);
                }
                resolve();
              })
              .on('error', reject);
          });
        } else {
          fs.renameSync(existingFile, audioPath);
        }
        const sanitizedTitle = videoTitle.replace(/[^\w\s]/gi, '');
        tempFiles.set(fileId, {
          path: audioPath,
          filename: `${sanitizedTitle}.mp3`,
          expiresAt: Date.now() + EXPIRATION_TIME
        });
        if (pendingTasks.has(fileId)) {
          const taskInfo = pendingTasks.get(fileId);
          taskInfo.status = 'completed';
          pendingTasks.set(fileId, taskInfo);
        }
        if (shouldTranscribe) {
          console.log(`[${new Date().toISOString()}] Starting transcription process for ${fileId}`);
          transcribeAudio(audioPath, fileId).then(transcriptResult => {
            console.log(`[${new Date().toISOString()}] Transcription result:`, transcriptResult.success ? 'Success' : 'Failure');
          }).catch(err => {
            console.error(`[${new Date().toISOString()}] Error starting transcription:`, err);
          });
        }
        setTimeout(() => {
          if (tempFiles.has(fileId)) {
            const fileInfo = tempFiles.get(fileId);
            if (fs.existsSync(fileInfo.path)) {
              fs.unlinkSync(fileInfo.path);
            }
            tempFiles.delete(fileId);
          }
          if (pendingTasks.has(fileId)) {
            pendingTasks.delete(fileId);
          }
          if (transcriptions.has(fileId)) {
            transcriptions.delete(fileId);
          }
        }, EXPIRATION_TIME);
        console.log(`[${new Date().toISOString()}] Processing completed for ${fileId}`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in processing:`, error);
        if (pendingTasks.has(fileId)) {
          const taskInfo = pendingTasks.get(fileId);
          taskInfo.status = 'failed';
          taskInfo.error = error.message;
          pendingTasks.set(fileId, taskInfo);
        }
      }
    });
    const response = {
      success: true,
      message: 'Download task initiated',
      taskId: fileId,
      statusUrl: `/status/${fileId}`,
      downloadUrl: `/download/${fileId}`,
      estimatedDuration: 'A few minutes, depending on the video length'
    };
    if (shouldTranscribe) {
      response.transcriptionRequested = true;
      response.transcriptionStatus = 'pending';
      response.transcriptionUrl = `/transcription/${fileId}`;
      response.message += '. Transcription will be processed automatically after download.';
    }
    res.json(response);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error initiating process:`, error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// ----------------------------------------------------------------
// Auxiliary Functions
// ----------------------------------------------------------------

// Function to execute yt-dlp commands
function executeYtDlp(args) {
  return new Promise((resolve, reject) => {
    console.log(`[${new Date().toISOString()}] Executing yt-dlp with arguments:`, args.join(' '));
    const ytDlp = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';
    ytDlp.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(`[${new Date().toISOString()}] yt-dlp stdout: ${output.trim()}`);
    });
    ytDlp.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.log(`[${new Date().toISOString()}] yt-dlp stderr: ${output.trim()}`);
    });
    ytDlp.on('close', (code) => {
      if (code !== 0) {
        console.log(`[${new Date().toISOString()}] ERROR: yt-dlp failed with code ${code}`);
        console.log(`[${new Date().toISOString()}] Details: ${stderr}`);
        reject(new Error(stderr || `yt-dlp exit code: ${code}`));
        return;
      }
      resolve(stdout);
    });
    ytDlp.on('error', (err) => {
      console.log(`[${new Date().toISOString()}] Error executing yt-dlp: ${err.message}`);
      reject(err);
    });
  });
}

// Advanced function to download YouTube audio using multiple approaches
async function downloadYouTubeAudio(youtubeUrl, outputPath) {
  const outputTemplate = outputPath.replace(/\.\w+$/, '') + '.%(ext)s';
  console.log(`[${new Date().toISOString()}] Starting download for: ${youtubeUrl}`);
  console.log(`[${new Date().toISOString()}] Output template: ${outputTemplate}`);
  
  // Use fixed proxy from environment variables
  const proxyUrl = `http://${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';
  
  let videoId = '';
  if (youtubeUrl.includes('youtube.com/watch?v=')) {
    videoId = new URL(youtubeUrl).searchParams.get('v');
  } else if (youtubeUrl.includes('youtu.be/')) {
    videoId = youtubeUrl.split('youtu.be/')[1].split('?')[0];
  }
  if (!videoId) {
    throw new Error('Failed to extract video ID');
  }
  
  // New Approach 0: Puppeteer to bypass anti-bot checks
  try {
    console.log(`[${new Date().toISOString()}] Attempting approach 0: Puppeteer direct extraction`);
    
    const streamResult = await getDirectStreamUrl(youtubeUrl);
    
    if (streamResult.success) {
      // Download the stream using axios
      const tempStreamPath = path.join(TEMP_DIR, `${uuidv4()}.audio`);
      
      console.log(`[${new Date().toISOString()}] Downloading stream via axios to ${tempStreamPath}`);
      
      const writer = fs.createWriteStream(tempStreamPath);
      const response = await axios({
        method: 'get',
        url: streamResult.url,
        responseType: 'stream',
        headers: {
          'User-Agent': userAgent
        }
      });
      
      response.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      
      console.log(`[${new Date().toISOString()}] Stream downloaded, converting to MP3`);
      
      // Convert to MP3 using ffmpeg
      const finalAudioPath = outputPath.replace(/\.\w+$/, '') + '.mp3';
      
      await new Promise((resolve, reject) => {
        ffmpeg(tempStreamPath)
          .outputOptions('-q:a', '0') // Best quality
          .saveToFile(finalAudioPath)
          .on('end', () => {
            console.log(`[${new Date().toISOString()}] Conversion to MP3 completed`);
            // Remove temporary file
            try {
              fs.unlinkSync(tempStreamPath);
            } catch (err) {
              console.error(`[${new Date().toISOString()}] Error removing temporary file:`, err);
            }
            resolve();
          })
          .on('error', (err) => {
            console.error(`[${new Date().toISOString()}] Error in conversion:`, err);
            reject(err);
          });
      });
      
      console.log(`[${new Date().toISOString()}] Puppeteer approach completed successfully!`);
      return { success: true };
    } else {
      console.log(`[${new Date().toISOString()}] Puppeteer approach failed: ${streamResult.error}`);
      // Continue with other approaches
    }
  } catch (puppeteerError) {
    console.log(`[${new Date().toISOString()}]
