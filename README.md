# YouTube Transcriber API

A robust and efficient API to download YouTube videos, extract audio in MP3 format, and obtain detailed statistics, including subscriber counts, using multiple fallback approaches.

![YouTube to MP3](https://img.shields.io/badge/YouTube-MP3-red)
![Node.js](https://img.shields.io/badge/Node.js-14%2B-green)
![Express](https://img.shields.io/badge/Express-4.x-blue)

## ✨ Features

- **Video Download with Fallback:** Uses multiple strategies to bypass YouTube's anti-bot restrictions, including residential proxy and alternative front-ends.
- **MP3 Conversion:** High-quality audio extraction and conversion using FFmpeg.
- **Detailed Statistics:** Returns video information like title, description, views, likes, dislikes, comments, and publication date.
- **Accurate Subscriber Count:** Extracts the channel's subscriber count using Puppeteer to interpret abbreviated values (e.g., "1.46M" converted to 1,460,000).
- **Channel Name:** Includes the channel's name in the resulting JSON.
- **Transcription (Optional):** Supports audio transcription via Assembly AI.

## 📋 Prerequisites

- Node.js (version 14 or higher)
- npm or yarn
- FFmpeg installed on the system
- Python 3 and pip (for yt-dlp)
- Puppeteer (installed via npm)

## 🔧 Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-username/yttranscriber.git
cd yttranscriber
```

### 2. Install dependencies

Install Node.js dependencies:

```bash
npm install
```

Install yt-dlp (if not already installed):

```bash
pip3 install --upgrade yt-dlp
```

Make sure FFmpeg is installed:

```bash
# For Ubuntu/Debian:
sudo apt update
sudo apt install -y ffmpeg
```

### 3. Configure environment variables

Create a `.env` file at the project's root directory to set your environment variables, for example:

```dotenv
PORT=3000
ASSEMBLY_API_KEY=YOUR_ASSEMBLYAI_API_KEY
ENABLE_TRANSCRIPTION=true
IPROYAL_USERNAME=your_username
IPROYAL_PASSWORD=your_password
```

### 4. Start the server

```bash
# Directly:
node index.js

# Or with PM2 to run in the background:
pm2 start index.js --name yt2mp3
```

The server will start on the configured port (default is 3000).

## 📝 How to Use

### Convert a Video to MP3

**Endpoint:** `POST /convert`

**Request body (JSON):**

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=example",
  "transcribe": true
}
```

**Successful response:**

```json
{
  "success": true,
  "message": "Download task started",
  "taskId": "123e4567-e89b-12d3-a456-426614174000",
  "statusUrl": "/status/123e4567-e89b-12d3-a456-426614174000",
  "downloadUrl": "/download/123e4567-e89b-12d3-a456-426614174000",
  "estimatedDuration": "A few minutes, depending on video size",
  "transcriptionRequested": true,
  "transcriptionStatus": "pending",
  "transcriptionUrl": "/transcription/123e4567-e89b-12d3-a456-426614174000"
}
```

### Get Video Statistics

**Endpoint:** `POST /stats`

**Request body (JSON):**

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=example"
}
```

**Successful response:**

```json
{
  "videoTitle": "Video Title",
  "channel": "Channel Name",
  "description": "Video description...",
  "views": 123456,
  "likes": 7890,
  "dislikes": 123,
  "commentCount": 456,
  "subscriberCount": 1460000,
  "uploadDate": "2025-03-25"
}
```

Subscriber counts are obtained using Puppeteer, accurately interpreting values like "1.46M subscribers" as 1,460,000.

### Download MP3 File

**Endpoint:** `GET /download/:fileId`

Use the provided URL from the `/convert` endpoint response to download the MP3 file.

### Check Task Status

**Endpoint:** `GET /status/:taskId`

Use this endpoint to check progress or retrieve the download URL upon completion.

## 📊 Example Usage with Node.js

```javascript
const axios = require('axios');
const fs = require('fs');

// API base URL
const API_URL = 'http://localhost:3000';

async function convertAndDownload(youtubeUrl, outputPath) {
  // Request conversion
  const conversion = await axios.post(`${API_URL}/convert`, { youtubeUrl });
  
  // Check status and wait for completion (can be implemented with polling)
  console.log('Task ID:', conversion.data.taskId);
  
  // Download the file (assuming it's already available)
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

convertAndDownload('https://www.youtube.com/watch?v=example', './music.mp3')
  .then(() => console.log('Download complete!'))
  .catch(console.error);
```

## 📚 Project Structure

```
yttranscriber/
├── index.js           # Main API file
├── package.json       # Dependencies and scripts
├── README.md          # Project documentation
├── setup.sh           # Setup script (optional)
└── temp/              # Temporary file directory (automatically created)
```

## 🔄 Fallback System

The API uses multiple strategies to ensure video downloads, including:
- **iProyal Residential Proxy**
- **Alternative Front-ends (Invidious, YouTube Music, Piped.video)**
- **yt-dlp advanced configuration fallback**

## ⚠️ Disclaimer

This API is provided for educational purposes only. Downloading copyrighted content without permission may violate copyright laws. Use the API responsibly and in accordance with applicable laws.
