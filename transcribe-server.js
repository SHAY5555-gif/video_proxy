const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3200;

// ElevenLabs API key
const ELEVENLABS_API_KEY = "sk_3cc5eba36a57dc0b8652796ce6c3a6f28277c977e93070da";

// Create a temporary directory for audio files
const TEMP_DIR = path.join(os.tmpdir(), 'transcription-audio');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
    const method = req.method;
    const url = req.url;
    const contentType = req.get('Content-Type') || 'none';
    console.log(`[REQUEST] ${method} ${url} (Content-Type: ${contentType})`);
    
    // Log query parameters if present
    if (Object.keys(req.query).length > 0) {
        console.log(`[REQUEST QUERY] ${JSON.stringify(req.query)}`);
    }
    
    // Log user agent
    const userAgent = req.get('User-Agent') || 'unknown';
    console.log(`[REQUEST AGENT] ${userAgent.substring(0, 100)}${userAgent.length > 100 ? '...' : ''}`);
    
    next();
});

// Helper function for downloading files using streams
async function downloadFile(url, targetPath, requestId) {
    console.log(`[${requestId}] Downloading file from URL: ${url.substring(0, 100)}...`);
    
    return new Promise((resolve, reject) => {
        // Create write stream for the target file
        const fileStream = fs.createWriteStream(targetPath);
        
        // Parse URL
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        // Request options
        const options = {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Connection': 'keep-alive'
            },
            timeout: 60000 // 60 seconds timeout
        };
        
        // Make the request
        const req = protocol.get(url, options, (response) => {
            // Check if response is successful
            if (response.statusCode !== 200) {
                fileStream.close();
                fs.unlinkSync(targetPath); // Clean up the file
                return reject(new Error(`Download failed with status code ${response.statusCode}`));
            }
            
            // Track download progress
            let downloadedBytes = 0;
            let totalBytes = parseInt(response.headers['content-length'] || '0');
            
            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                // Log progress every ~1MB or 10% for larger files
                if (downloadedBytes % 1000000 < chunk.length || 
                    (totalBytes > 0 && downloadedBytes / totalBytes >= 0.1)) {
                    console.log(`[${requestId}] Downloaded ${Math.round(downloadedBytes/1024/1024)}MB ${totalBytes ? `(${Math.round(downloadedBytes/totalBytes*100)}%)` : ''}`);
                }
            });
            
            // Pipe response to file
            response.pipe(fileStream);
            
            // Handle download completion
            fileStream.on('finish', () => {
                fileStream.close();
                
                // Verify file was downloaded successfully
                const stats = fs.statSync(targetPath);
                if (stats.size === 0) {
                    fs.unlinkSync(targetPath); // Delete empty file
                    return reject(new Error('Downloaded file is empty'));
                }
                
                console.log(`[${requestId}] Download completed. File size: ${stats.size} bytes`);
                resolve(stats.size);
            });
            
            // Handle errors during streaming
            fileStream.on('error', (err) => {
                fileStream.close();
                fs.unlinkSync(targetPath); // Clean up the file
                reject(err);
            });
        });
        
        // Handle request errors
        req.on('error', (err) => {
            fileStream.close();
            fs.unlinkSync(targetPath); // Clean up the file
            reject(err);
        });
        
        // Handle timeout
        req.on('timeout', () => {
            req.destroy();
            fileStream.close();
            fs.unlinkSync(targetPath); // Clean up the file
            reject(new Error('Download request timed out'));
        });
    });
}

// Helper function to send multipart form request
async function sendMultipartFormRequest(url, formData, headers = {}) {
    return new Promise((resolve, reject) => {
        // Get the form headers and add our custom headers
        const formHeaders = formData.getHeaders();
        const combinedHeaders = { ...formHeaders, ...headers };
        
        // Parse the URL
        const parsedUrl = new URL(url);
        
        // Prepare the request options
        const options = {
            method: 'POST',
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            headers: combinedHeaders
        };
        
        // Choose http or https module based on the URL
        const httpModule = parsedUrl.protocol === 'https:' ? https : http;
        
        // Make the request
        const req = httpModule.request(options, (res) => {
            const chunks = [];
            
            res.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            res.on('end', () => {
                const responseBody = Buffer.concat(chunks).toString();
                let data;
                
                // Try to parse as JSON if possible
                try {
                    data = JSON.parse(responseBody);
                } catch (e) {
                    data = responseBody; // Otherwise keep as string
                }
                
                resolve({ response: res, data });
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        // Pipe the form data to the request
        formData.pipe(req);
    });
}

// Helper function to format time for SRT files
function formatSrtTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

// Transcribe endpoint with proper audio download
app.get('/transcribe', async (req, res) => {
    const videoId = req.query.id;
    const format = req.query.format || 'json'; // 'json', 'srt', or 'txt'
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    if (!videoId) {
        return res.status(400).json({ 
            success: false,
            error: 'חסר פרמטר חובה: id (מזהה סרטון)',
            example: '/transcribe?id=YOUTUBE_VIDEO_ID&format=json|srt|txt'
        });
    }
    
    console.log(`[${requestId}] Starting transcription for video ID: ${videoId}, format: ${format}`);
    
    try {
        // 1. Get video info from YouTube using ZM API
        console.log(`[${requestId}] Getting video info from ZM API...`);
        
        // ZM API configuration
        const zmApiKey = "hBsrDies";
        const zmApiUrl = 'https://api.zm.io.vn/v1/social/autolink';
        const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
        
        // Make request to ZM API
        const zmResponse = await fetch(zmApiUrl, {
            method: 'POST',
            headers: {
                'apikey': zmApiKey, 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: youtubeUrl })
        });
        
        if (!zmResponse.ok) {
            throw new Error(`ZM API error: ${zmResponse.status} ${zmResponse.statusText}`);
        }
        
        const zmData = await zmResponse.json();
        
        if (!zmData || !zmData.medias || !Array.isArray(zmData.medias)) {
            throw new Error('Invalid data format received from ZM API');
        }
        
        console.log(`[${requestId}] ZM API responded with ${zmData.medias.length} media options`);
        
        // 2. Find the best audio format
        let audioUrl = null;
        let formatInfo = null;
        
        // First try to find audio-only formats
        const audioFormats = zmData.medias.filter(media => 
            media.type === 'audio' || media.quality?.toLowerCase().includes('audio')
        );
        
        if (audioFormats.length > 0) {
            formatInfo = audioFormats[0];
            audioUrl = formatInfo.url;
            console.log(`[${requestId}] Found audio format: ${formatInfo.quality || 'Unknown'}`);
        } else {
            // Fallback to video format (we'll extract the audio)
            // Try to find format 18 (360p MP4) first as it's commonly available
            const format18 = zmData.medias.find(media => media.formatId === '18' && media.url);
            
            if (format18) {
                formatInfo = format18;
                audioUrl = format18.url;
                console.log(`[${requestId}] No audio format found, using MP4 format 18 (360p)`);
            } else {
                // Last resort: just use the first format with a URL
                const anyFormat = zmData.medias.find(media => media.url);
                if (anyFormat) {
                    formatInfo = anyFormat;
                    audioUrl = anyFormat.url;
                    console.log(`[${requestId}] Using fallback format: ${anyFormat.quality || 'Unknown'}`);
                }
            }
        }
        
        if (!audioUrl) {
            throw new Error('No suitable audio/video format found for transcription');
        }
        
        // 3. Download the audio file to local temp directory
        console.log(`[${requestId}] Found media URL, downloading now...`);
        const tempFileName = path.join(TEMP_DIR, `${videoId}_${Date.now()}.mp3`);
        
        try {
            // Download the file using our helper function
            await downloadFile(audioUrl, tempFileName, requestId);
            
            // Check that the file exists and has content
            const stats = fs.statSync(tempFileName);
            console.log(`[${requestId}] Audio file saved to ${tempFileName}, size: ${stats.size} bytes`);
            
            if (stats.size === 0) {
                throw new Error('Downloaded audio file is empty');
            }
        } catch (downloadError) {
            console.error(`[${requestId}] Error downloading audio:`, downloadError);
            throw new Error(`Failed to download audio: ${downloadError.message}`);
        }
        
        // 4. Prepare and send to ElevenLabs for transcription
        console.log(`[${requestId}] Preparing to send audio to ElevenLabs for transcription...`);
        
        const formData = new FormData();
        formData.append('file', fs.createReadStream(tempFileName));
        formData.append('model_id', 'scribe_v1');
        formData.append('timestamps_granularity', 'word');
        formData.append('language', ''); // Auto-detect language
        
        // Try ElevenLabs API with retries
        let transcriptionData;
        let apiRetries = 2;
        let apiDelay = 2000;
        let apiSuccess = false;
        
        for (let attempt = 1; attempt <= apiRetries + 1; attempt++) {
            try {
                console.log(`[${requestId}] ElevenLabs API attempt ${attempt}/${apiRetries + 1}`);
                
                const { response, data } = await sendMultipartFormRequest(
                    'https://api.elevenlabs.io/v1/speech-to-text',
                    formData,
                    { 'xi-api-key': ELEVENLABS_API_KEY }
                );
                
                if (response.statusCode !== 200) {
                    console.error(`[${requestId}] ElevenLabs API error - status: ${response.statusCode}`);
                    const errorText = typeof data === 'string' ? data : JSON.stringify(data);
                    console.error(`[${requestId}] ElevenLabs error response: ${errorText}`);
                    throw new Error(`ElevenLabs API error: ${response.statusCode}`);
                }
                
                transcriptionData = data;
                apiSuccess = true;
                break;
            } catch (apiError) {
                console.error(`[${requestId}] ElevenLabs API attempt ${attempt} failed:`, apiError);
                
                if (attempt < apiRetries + 1) {
                    console.log(`[${requestId}] Waiting ${apiDelay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, apiDelay));
                    apiDelay *= 2;
                } else {
                    throw new Error(`ElevenLabs transcription failed: ${apiError.message}`);
                }
            }
        }
        
        // 5. Clean up the temporary file
        try {
            fs.unlinkSync(tempFileName);
            console.log(`[${requestId}] Temporary audio file deleted: ${tempFileName}`);
        } catch (deleteError) {
            console.warn(`[${requestId}] Failed to delete temporary file: ${deleteError.message}`);
        }
        
        // 6. Process the transcription data based on requested format
        console.log(`[${requestId}] Processing transcription results to ${format} format...`);
        
        if (format === 'json') {
            // Return raw JSON data from ElevenLabs
            return res.json({
                success: true,
                data: {
                    videoId: videoId,
                    title: zmData.title || '',
                    duration: zmData.duration || 0,
                    transcript: transcriptionData,
                    language: transcriptionData.language || 'unknown'
                }
            });
        } else if (format === 'srt') {
            // Convert to SRT format
            let srtContent = "";
            let counter = 1;
            
            if (transcriptionData.words && Array.isArray(transcriptionData.words)) {
                // Group words into chunks
                const chunks = [];
                let currentChunk = [];
                let currentDuration = 0;
                const MAX_CHUNK_DURATION = 5;
                
                for (const word of transcriptionData.words) {
                    currentChunk.push(word);
                    currentDuration = word.end - (currentChunk[0]?.start || 0);
                    
                    if (currentDuration >= MAX_CHUNK_DURATION || 
                        word.text.match(/[.!?]$/) || 
                        currentChunk.length >= 15) {
                        
                        chunks.push([...currentChunk]);
                        currentChunk = [];
                        currentDuration = 0;
                    }
                }
                
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                }
                
                // Convert chunks to SRT
                for (const chunk of chunks) {
                    if (chunk.length > 0) {
                        const startTime = chunk[0].start;
                        const endTime = chunk[chunk.length - 1].end;
                        
                        const startSrt = formatSrtTime(startTime);
                        const endSrt = formatSrtTime(endTime);
                        
                        const text = chunk.map(w => w.text).join(' ')
                            .replace(/ ([.,!?:;])/g, '$1');
                        
                        srtContent += `${counter}\n`;
                        srtContent += `${startSrt} --> ${endSrt}\n`;
                        srtContent += `${text}\n\n`;
                        
                        counter++;
                    }
                }
            }
            
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', `attachment; filename="${videoId}.srt"`);
            return res.send(srtContent);
        } else if (format === 'txt') {
            // Convert to plain text format
            let plainText = "";
            
            if (transcriptionData.text) {
                plainText = transcriptionData.text;
            } else if (transcriptionData.words && Array.isArray(transcriptionData.words)) {
                plainText = transcriptionData.words.map(w => w.text).join(' ')
                    .replace(/ ([.,!?:;])/g, '$1');
            }
            
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', `attachment; filename="${videoId}.txt"`);
            return res.send(plainText);
        } else {
            throw new Error(`פורמט לא נתמך: ${format}. יש להשתמש ב-json, srt, או txt.`);
        }
        
    } catch (error) {
        console.error(`[${requestId}] Transcription error:`, error);
        
        return res.status(500).json({
            success: false,
            error: `שגיאה בתמלול: ${error.message}`,
            requestId: requestId
        });
    }
});

// Basic home page
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Transcription Server</title>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    h1 { color: #333; }
                </style>
            </head>
            <body>
                <h1>Transcription Server</h1>
                <p>Use the /transcribe endpoint to transcribe YouTube videos.</p>
                <p>Example: <code>/transcribe?id=VIDEO_ID&format=json|srt|txt</code></p>
            </body>
        </html>
    `);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: `Server error: ${err.message}`
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Transcription server running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('  - GET /                  Home page');
    console.log('  - GET /transcribe        Transcribe a YouTube video');
    console.log('  - GET /health            Health check');
}); 