const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const { setTimeout } = require('timers/promises');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');
const FormData = require('form-data'); // Add form-data package for multipart forms

const app = express();
const PORT = process.env.PORT || 3000;

// Add basic rate limiting
const requestCounts = {};
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute per IP

// Add API key for ElevenLabs at the top of the file with other constants
const ELEVENLABS_API_KEY = "sk_3cc5eba36a57dc0b8652796ce6c3a6f28277c977e93070da";

// Create a temporary directory for audio files if it doesn't exist
const TEMP_DIR = path.join(os.tmpdir(), 'youtube-proxy-audio');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Add cleanup function to periodically remove old temporary files
setInterval(() => {
    try {
        const currentTime = Date.now();
        const files = fs.readdirSync(TEMP_DIR);

        for (const file of files) {
            const filePath = path.join(TEMP_DIR, file);
            const stats = fs.statSync(filePath);

            // Delete files older than 1 hour
            if (currentTime - stats.mtimeMs > 60 * 60 * 1000) {
                fs.unlinkSync(filePath);
                console.log(`Deleted old temporary file: ${filePath}`);
            }
        }
    } catch (err) {
        console.error('Error cleaning up temporary files:', err);
    }
}, 15 * 60 * 1000); // Check every 15 minutes

// Rate limiting middleware
function rateLimiter(req, res, next) {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    requestCounts[ip] = (requestCounts[ip] || 0) + 1;

    if (requestCounts[ip] > RATE_LIMIT_MAX) {
        console.log(`Rate limit exceeded for IP: ${ip}`);
        return res.status(429).json({
            error: 'Too many requests. Please try again later.',
            retryAfter: Math.floor(RATE_LIMIT_WINDOW / 1000)
        });
    }

    next();
}

app.use(cors());
app.use(rateLimiter);

// Add request logging middleware to see all incoming requests
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

    // Continue to next middleware
    next();
});

// Fetch with retries
async function fetchWithRetries(url, options, maxRetries = 3) {
    let lastError;
    let retryDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt}/${maxRetries} for URL: ${url.substring(0, 100)}...`);

            const response = await fetch(url, options);

            // If we hit a rate limit, wait and retry
            if (response.status === 429) {
                const retryAfter = response.headers.get('retry-after');
                const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : retryDelay;
                console.log(`Rate limited by source. Waiting ${waitTime}ms before retry`);
                await setTimeout(waitTime);

                // Increase retry delay for next attempt
                retryDelay *= 2;
                continue;
            }

            return response;
        } catch (err) {
            lastError = err;
            console.error(`Fetch attempt ${attempt} failed:`, err.message);

            if (attempt < maxRetries) {
                console.log(`Waiting ${retryDelay}ms before retry...`);
                await setTimeout(retryDelay);
                retryDelay *= 2; // Exponential backoff
            }
        }
    }

    throw lastError || new Error('Failed to fetch after multiple attempts');
}

// מייבא את מנהל ה-headers המשופר ואת מנהל הפרוקסי
const headersManager = require('./headers-manager');
const proxyRotator = require('./proxy-rotator');

// Add a YouTube-specific fetch helper
async function fetchFromYouTube(url, options, maxRetries = 3) {
    // הוסף requestId כפרמטר לפונקציה
    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

    // יצירת מזהה סשן קבוע לבקשה הנוכחית (לשימוש עקבי ב-headers)
    const sessionId = Date.now().toString(36);

    // YouTube-specific error fix: יצירת headers מתקדמים שנראים כמו דפדפן אמיתי
    // בכל ניסיון נשתמש ב-headers שונים במקצת כדי להקשות על זיהוי
    const getYouTubeOptions = () => {
        // שמירה על User-Agent עקבי לאורך ניסיונות חוזרים באותה בקשה
        // אבל שונה בין בקשות שונות
        const baseUserAgent = options.headers?.['User-Agent'] ||
                             headersManager.getRandomValue(headersManager.userAgents);

        // יצירת headers מתקדמים עם אקראיות מבוקרת
        const advancedHeaders = headersManager.generateYouTubeHeaders({
            userAgent: baseUserAgent,
            rangeHeader: options.headers?.['Range'],
            // שימוש ב-referer ו-origin אקראיים אבל עקביים לאורך הניסיונות
            referer: `https://www.youtube.com/watch?v=${sessionId}`,
            origin: 'https://www.youtube.com'
        });

        // יצירת אובייקט האפשרויות הבסיסי
        const youtubeOptions = {
            ...options,
            headers: advancedHeaders,
            // Set a timeout of 15 seconds for the fetch operation
            timeout: 15000 // 15 second timeout before aborting
        };

        // הוספת פרוקסי אם הוא מופעל
        const proxyAgent = proxyRotator.createProxyAgent();
        if (proxyAgent) {
            youtubeOptions.agent = proxyAgent;
            console.log(`[${requestId}] Using proxy for this request`);
        }

        return youtubeOptions;
    };

    let lastError;
    let retryDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`YouTube fetch attempt ${attempt}/${maxRetries} for: ${url.substring(0, 60)}...`);

            // Check if URL has expired parameters
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('googlevideo.com')) {
                // YouTube URL validity is approximately 350 minutes, so we'll skip expiration checks
                console.log(`[${requestId}] Processing YouTube video URL`);
            }

            // יצירת אפשרויות חדשות עם headers מעט שונים בכל ניסיון
            const youtubeOptions = getYouTubeOptions();

            // הוסף יותר לוגים
            console.log(`[${requestId}] Full URL being fetched: ${url}`);
            // הסתרת פרטי ה-headers המלאים מהלוגים למניעת דליפת מידע
            const sanitizedOptions = {
                ...youtubeOptions,
                headers: {
                    'User-Agent': youtubeOptions.headers['User-Agent'].substring(0, 30) + '...',
                    'Other-Headers': 'Hidden for security'
                }
            };
            console.log(`[${requestId}] YouTube options: ${JSON.stringify(sanitizedOptions, null, 2)}`);

            // הוספת השהייה אקראית קטנה לפני הבקשה כדי לדמות התנהגות אנושית
            if (attempt > 1) {
                const randomDelay = Math.floor(Math.random() * 500) + 100; // 100-600ms
                await setTimeout(randomDelay);
            }

            const response = await fetch(url, youtubeOptions);

            // הוסף יותר לוגים לטיפול בשגיאות
            console.log(`[${requestId}] Response status: ${response.status}`);

            if (response.status === 404) {
                console.error(`[${requestId}] YouTube URL not found (404). URL: ${url.substring(0, 100)}...`);
                throw new Error('YouTube resource not found (404). The URL might be invalid or expired.');
            }

            if (response.status === 429) {
                console.warn(`Rate limited by YouTube (429). Waiting ${retryDelay}ms before retry...`);
                await setTimeout(retryDelay);
                retryDelay *= 2; // Exponential backoff
                continue;
            }

            if (!response.ok) {
                throw new Error(`YouTube responded with ${response.status} ${response.statusText}`);
            }

            return response;
        } catch (err) {
            lastError = err;
            console.error(`YouTube fetch attempt ${attempt} failed:`, err.message);

            if (attempt < maxRetries) {
                console.log(`Waiting ${retryDelay}ms before retry...`);
                await setTimeout(retryDelay);
                retryDelay *= 2; // Exponential backoff
            }
        }
    }

    throw lastError || new Error('Failed to fetch from YouTube after multiple attempts');
}

// Add maximum file size check for streaming
const MAX_FILE_SIZE = 25 * 1024 * 1024; // Limit to 25MB for Render free tier
let totalBytesStreamed = 0;

// Modify the proxy endpoint to include size limits and better streaming
app.get('/proxy', async (req, res) => {
    const videoUrl = req.query.url;
    const userAgent = req.headers['user-agent'] || 'Mozilla/5.0';
    const startTime = Date.now();

    if (!videoUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    // Check if this is a YouTube website URL rather than a media/CDN URL
    if (videoUrl.includes('youtube.com/watch') ||
        videoUrl.includes('youtu.be/') ||
        videoUrl.match(/youtube\.com\/(shorts|playlist|channel|c\/)/)) {

        console.log(`Redirecting user to YouTube URL: ${videoUrl}`);
        return res.redirect(302, videoUrl);
    }

    // Add support for partial content requests (Range header)
    const rangeHeader = req.headers.range;
    let rangeStart = 0;
    let rangeEnd = null;

    if (rangeHeader) {
        const rangeParts = rangeHeader.replace('bytes=', '').split('-');
        rangeStart = parseInt(rangeParts[0], 10) || 0;
        if (rangeParts[1] && rangeParts[1].trim() !== '') {
            rangeEnd = parseInt(rangeParts[1], 10);
        }
    }

    // Reset byte counter for this request
    totalBytesStreamed = 0;

    // Add request ID for tracking
    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    console.log(`[${requestId}] Processing request for: ${videoUrl.substring(0, 100)}...`);

    // Set up keepalive checker for the client connection
    const keepAliveInterval = setInterval(() => {
        if (!res.writableEnded) {
            // If connection is still open but taking long, write a comment to keep it alive
            try {
                res.write('\n');
            } catch (err) {
                // If we can't write, the connection is probably already closed
                clearInterval(keepAliveInterval);
            }
        } else {
            clearInterval(keepAliveInterval);
        }
    }, 10000); // Check every 10 seconds

    // Set a timeout for the entire request
    const requestTimeout = setTimeout(() => {
        if (!res.writableEnded) {
            console.error(`[${requestId}] Request timed out after 120 seconds`);
            clearInterval(keepAliveInterval);

            // Only attempt to write an error if headers haven't been sent
            if (!res.headersSent) {
                return res.status(504).json({
                    error: 'Gateway Timeout',
                    message: 'Request took too long to complete'
                });
            } else {
                try {
                    res.end();
                } catch (e) {
                    console.error(`[${requestId}] Error ending response after timeout:`, e);
                }
            }
        }
    }, 120000); // 120 second overall timeout

    try {
        // Check if it's a YouTube URL
        const isYouTubeUrl = videoUrl.includes('googlevideo.com') ||
                             videoUrl.includes('youtube.com') ||
                             videoUrl.includes('youtu.be');

        console.log(`[${requestId}] URL identified as ${isYouTubeUrl ? 'YouTube' : 'generic'} URL`);

        // שימוש במנהל ה-headers המשופר ליצירת headers מתקדמים
        const fetchOptions = {
            headers: headersManager.generateAdvancedHeaders({
                userAgent: userAgent,
                rangeHeader: rangeHeader || 'bytes=0-',
                isYouTubeRequest: isYouTubeUrl
            })
        };

        // הוספת לוג מוסתר של ה-headers (ללא חשיפת כל הפרטים)
        const sanitizedHeaders = {
            'User-Agent': fetchOptions.headers['User-Agent'].substring(0, 30) + '...',
            'Accept': fetchOptions.headers['Accept'],
            'Range': fetchOptions.headers['Range'],
            'Other-Headers': '(hidden for security)'
        };

        console.log(`[${requestId}] Fetch options:`, JSON.stringify({...fetchOptions, headers: sanitizedHeaders}, null, 2));

        // Use YouTube-specific fetch for YouTube URLs, regular fetch otherwise
        const response = isYouTubeUrl
            ? await fetchFromYouTube(videoUrl, fetchOptions)
            : await fetchWithRetries(videoUrl, fetchOptions);

        // Log response details
        console.log(`[${requestId}] Response status: ${response.status}`);

        // Check for content length
        const contentLength = response.headers.get('content-length');
        const estimatedSize = contentLength ? parseInt(contentLength, 10) : null;

        if (estimatedSize && estimatedSize > MAX_FILE_SIZE) {
            console.warn(`[${requestId}] Content length (${estimatedSize} bytes) exceeds maximum size limit (${MAX_FILE_SIZE} bytes)`);
            clearInterval(keepAliveInterval);
            clearTimeout(requestTimeout);
            return res.status(413).json({
                error: 'Payload Too Large',
                message: `File size (${Math.round(estimatedSize/1024/1024)}MB) exceeds maximum size limit (${Math.round(MAX_FILE_SIZE/1024/1024)}MB)`,
                solution: 'Try a different quality or format'
            });
        }

        // Set proper status code for range requests
        if (rangeHeader && response.status === 206) {
            res.status(206);
        }

        // Copy all response headers to our response
        for (const [key, value] of response.headers.entries()) {
            // Skip headers that might cause issues
            if (!['content-encoding', 'content-length', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
                try {
                    res.setHeader(key, value);
                } catch (headerErr) {
                    console.error(`Error setting header ${key}: ${headerErr.message}`);
                    // Continue despite header error
                }
            }
        }

        // Ensure we set the correct content type
        const contentType = response.headers.get('content-type');
        if (contentType) {
            res.setHeader('Content-Type', contentType);
        } else {
            res.setHeader('Content-Type', 'application/octet-stream');
        }

        // Handle streaming with explicit error handling and size limits
        try {
            // Create a transform stream that monitors size
            const { Transform } = require('stream');
            const sizeMonitorStream = new Transform({
                transform(chunk, encoding, callback) {
                    totalBytesStreamed += chunk.length;

                    if (totalBytesStreamed > MAX_FILE_SIZE) {
                        console.warn(`[${requestId}] Size limit exceeded during streaming. Closing connection after ${totalBytesStreamed} bytes`);
                        this.destroy(new Error(`Size limit of ${MAX_FILE_SIZE} bytes exceeded`));
                        return;
                    }

                    // Pass the chunk through
                    this.push(chunk);
                    callback();
                }
            });

            // Handle errors on the size monitor stream
            sizeMonitorStream.on('error', (err) => {
                console.error(`[${requestId}] Size monitor stream error:`, err);
                if (!res.writableEnded) {
                    try {
                        res.end();
                    } catch (e) {
                        console.error(`[${requestId}] Error ending response after size monitor error:`, e);
                    }
                }
            });

            // Handle errors on the source body stream
            response.body.on('error', (err) => {
                console.error(`[${requestId}] Source stream error:`, err);
                clearInterval(keepAliveInterval);
                clearTimeout(requestTimeout);

                if (!res.writableEnded) {
                    try {
                        res.end();
                    } catch (e) {
                        console.error(`[${requestId}] Error ending response after source error:`, e);
                    }
                }
            });

            // Handle end of stream
            response.body.on('end', () => {
                console.log(`[${requestId}] Stream completed successfully. Total bytes: ${totalBytesStreamed}`);
                clearInterval(keepAliveInterval);
                clearTimeout(requestTimeout);
            });

            // Pipe through the monitor and to the response
            response.body
                .pipe(sizeMonitorStream)
                .pipe(res)
                .on('finish', () => {
                    const duration = Date.now() - startTime;
                    console.log(`[${requestId}] Response finished in ${duration}ms. Total bytes: ${totalBytesStreamed}`);
                    clearInterval(keepAliveInterval);
                    clearTimeout(requestTimeout);
                })
                .on('error', (err) => {
                    console.error(`[${requestId}] Response stream error:`, err);
                    clearInterval(keepAliveInterval);
                    clearTimeout(requestTimeout);
                });

            // Log success with limited URL
            const urlPreview = videoUrl.length > 60 ?
                `${videoUrl.substring(0, 30)}...${videoUrl.substring(videoUrl.length - 30)}` :
                videoUrl;
            console.log(`[${requestId}] Successfully piping response for: ${urlPreview}`);

        } catch (streamSetupErr) {
            console.error(`[${requestId}] Error setting up stream:`, streamSetupErr);
            clearInterval(keepAliveInterval);
            clearTimeout(requestTimeout);

            // Only send error if headers have not been sent
            if (!res.headersSent) {
                return res.status(500).json({ error: `Stream setup error: ${streamSetupErr.message}` });
            } else if (!res.writableEnded) {
                try {
                    res.end();
                } catch (e) {
                    console.error(`[${requestId}] Error ending response after stream setup error:`, e);
                }
            }
        }

    } catch (err) {
        // Clean up intervals/timeouts on error
        clearInterval(keepAliveInterval);
        clearTimeout(requestTimeout);

        console.error(`[${requestId}] Proxy error:`, err);
        console.error(`[${requestId}] Error stack:`, err.stack);

        // Provide detailed error information
        const errorDetails = {
            message: err.message,
            type: err.name || 'Unknown',
            code: err.code || 'None',
            timestamp: new Date().toISOString()
        };

        // Check for YouTube-specific errors
        if (err.message.includes('URL has expired')) {
            return res.status(410).json({
                error: 'YouTube URL has expired',
                details: errorDetails,
                solution: 'Please refresh the page and try again to get a fresh URL'
            });
        }

        // Send appropriate error based on the error type
        if (err.code === 'ENOTFOUND') {
            return res.status(404).json({
                error: 'Resource not found or host unreachable',
                details: errorDetails
            });
        } else if (err.type === 'request-timeout' || err.name === 'AbortError') {
            return res.status(504).json({
                error: 'Request timeout',
                details: errorDetails
            });
        } else if (err.message.includes('429')) {
            return res.status(429).json({
                error: 'Too Many Requests from source API',
                retryAfter: 60, // Suggest retry after 1 minute
                details: errorDetails
            });
        } else if (err.message.includes('403')) {
            return res.status(403).json({
                error: 'Resource access forbidden (403)',
                details: errorDetails,
                solution: 'Try using a different video format or quality'
            });
        } else {
            // Log as much detail as possible about the error
            console.error(`[${requestId}] Unhandled error details:`, {
                message: err.message,
                name: err.name,
                code: err.code,
                errno: err.errno,
                stack: err.stack && err.stack.split('\n')
            });

            res.status(500).json({
                error: `Proxy server error: ${err.message}`,
                errorType: err.name || 'Unknown',
                errorCode: err.code || 'None',
                timestamp: new Date().toISOString(),
                solution: 'Try refreshing the page to get a fresh URL or try a different video'
            });
        }
    }
});

// Simplified download endpoint using only RapidAPI for audio
app.get('/download', async (req, res) => {
    const videoId = req.query.id;
    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

    if (!videoId) {
        return res.status(400).json({
            success: false,
            error: 'חסר פרמטר חובה: id (מזהה סרטון)',
            example: '/download?id=YOUTUBE_VIDEO_ID' // Format parameter removed
        });
    }

    console.log(`[${requestId}] Audio download request for video ID: ${videoId}`);

    try {
        // STEP 1: Get audio download link from RapidAPI
        console.log(`[${requestId}] STEP 1: Getting audio URL from RapidAPI`);

        const rapidApiKey = 'b7855e36bamsh122b17f6deeb803p1aca9bjsnb238415c0d28';
        const rapidApiHost = 'youtube-downloader-api-fast-reliable-and-easy.p.rapidapi.com';
        const youtubeWatchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const rapidApiUrl = `https://${rapidApiHost}/fetch_audio?url=${encodeURIComponent(youtubeWatchUrl)}`;

        let audioDownloadUrl;
        let videoTitle = `Video ${videoId}`; // Default title

        console.log(`[${requestId}] Calling RapidAPI: ${rapidApiUrl}`);
        const rapidApiResponse = await fetch(rapidApiUrl, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': rapidApiKey,
                'x-rapidapi-host': rapidApiHost
            },
            timeout: 30000 // 30 second timeout
        });

        if (!rapidApiResponse.ok) {
            const errorText = await rapidApiResponse.text();
            console.error(`[${requestId}] RapidAPI error: ${rapidApiResponse.status} ${rapidApiResponse.statusText}. Body: ${errorText}`);
            throw new Error(`Failed to fetch audio info from RapidAPI: ${rapidApiResponse.status}`);
        }

        const rapidApiData = await rapidApiResponse.json();
        console.log(`[${requestId}] RapidAPI Response:`, JSON.stringify(rapidApiData).substring(0, 200) + '...');

        if (!rapidApiData || !rapidApiData.success || !rapidApiData.link) {
            console.error(`[${requestId}] Unexpected RapidAPI response structure:`, rapidApiData);
            throw new Error('Invalid response structure from RapidAPI or download link missing.');
        }
        audioDownloadUrl = rapidApiData.link;
        videoTitle = rapidApiData.title || videoTitle; // Use title from API if available

        console.log(`[${requestId}] Received audio download URL from RapidAPI: ${audioDownloadUrl.substring(0, 100)}...`);
        console.log(`[${requestId}] Title: ${videoTitle}`);

        // STEP 2: Prepare filename and redirect to proxy for download
        let filename = `${videoTitle}.mp3`; // Assume mp3 extension
        filename = filename.replace(/[<>:"/\\|?*]+/g, '_'); // Clean filename

        const proxyDownloadUrl = `/proxy?url=${encodeURIComponent(audioDownloadUrl)}`;

        console.log(`[${requestId}] Redirecting to proxy URL for download: ${proxyDownloadUrl}`);
        console.log(`[${requestId}] Filename: ${filename}`);

        // Set headers for file download and redirect
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        return res.redirect(302, proxyDownloadUrl);

    } catch (error) {
        console.error(`[${requestId}] Download error:`, error);
        // Return a user-friendly HTML error page
        res.status(500).send(`
            <html>
                <head>
                    <title>שגיאת הורדה</title>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f0f0f0; text-align: right; direction: rtl; }
                        .container { max-width: 600px; margin: 100px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        h1 { color: #c00; margin-top: 0; }
                        .back-btn { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #c00; color: white; text-decoration: none; border-radius: 4px; }
                        .back-btn:hover { background: #900; }
                        .error-details { background: #ffe6e6; padding: 15px; border-radius: 4px; margin-top: 20px; }
                        code { background: #f8f8f8; padding: 2px 5px; border-radius: 3px; font-family: monospace; direction: ltr; display: inline-block; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>שגיאה בהורדת האודיו</h1>
                        <p>${error.message || 'שגיאה לא ידועה התרחשה בעת ניסיון להוריד את האודיו'}</p>
                        <div class="error-details">
                            <p><strong>מזהה סרטון:</strong> <code>${videoId}</code></p>
                            <p><strong>מזהה בקשה:</strong> <code>${requestId}</code></p>
                            <p><strong>זמן השגיאה:</strong> ${new Date().toLocaleString('he-IL')}</p>
                        </div>
                        <a href="/" class="back-btn">חזרה לדף הראשי</a>
                    </div>
                </body>
            </html>
        `);
    }
});


// Helper function to format file size
function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return 'Unknown';

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i === 0) return bytes + ' ' + sizes[i];

    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

// Fix missing rate limit cleanup function that was accidentally removed
// Clear rate limit counts every minute
setInterval(() => {
    console.log('Clearing rate limit counts');
    Object.keys(requestCounts).forEach(ip => {
        requestCounts[ip] = 0;
    });
}, RATE_LIMIT_WINDOW);

// הוספת נקודת קצה לניהול הפרוקסי (מוגנת בסיסמה פשוטה)
app.get('/proxy-manager', (req, res) => {
    // בדיקת סיסמה פשוטה (יש להחליף במנגנון אבטחה חזק יותר בסביבת ייצור)
    const password = req.query.password;
    if (password !== 'proxy123') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const action = req.query.action;

    switch (action) {
        case 'enable':
            proxyRotator.setProxyEnabled(true);
            return res.json({ success: true, message: 'Proxy rotation enabled' });

        case 'disable':
            proxyRotator.setProxyEnabled(false);
            return res.json({ success: true, message: 'Proxy rotation disabled' });

        case 'add':
            const { host, port, username, password } = req.query;
            if (!host || !port) {
                return res.status(400).json({ error: 'Missing host or port' });
            }
            proxyRotator.addProxy(host, parseInt(port), username, password);
            return res.json({ success: true, message: 'Proxy added' });

        case 'clear':
            proxyRotator.clearProxies();
            return res.json({ success: true, message: 'All proxies cleared' });

        case 'list':
            const proxies = proxyRotator.getProxyList();
            return res.json({ success: true, proxies });

        default:
            return res.status(400).json({ error: 'Invalid action', validActions: ['enable', 'disable', 'add', 'clear', 'list'] });
    }
});

// הערה: הסרנו את המשתנה rateLimitSeconds שלא היה בשימוש

// Update the main page HTML to add a transcription option
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>YouTube Downloader & Transcriber</title>
                <style>
                    :root {
                        --primary-color: #c00;
                        --secondary-color: #222;
                        --accent-color: #f1f1f1;
                        --text-color: #333;
                        --light-text: #fff;
                        --border-radius: 6px;
                    }

                    body {
                        font-family: 'Segoe UI', Roboto, Arial, sans-serif;
                        margin: 0;
                        padding: 0;
                        background-color: #f9f9f9;
                        color: var(--text-color);
                        line-height: 1.6;
                    }

                    .header {
                        background-color: var(--primary-color);
                        color: var(--light-text);
                        text-align: center;
                        padding: 2rem 1rem;
                        margin-bottom: 2rem;
                    }

                    .header h1 {
                        margin: 0;
                        font-size: 2.5rem;
                    }

                    .container {
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 0 1rem;
                    }

                    .tab-container {
                        margin-bottom: 1rem;
                    }

                    .tab-buttons {
                        display: flex;
                        border-bottom: 1px solid #ddd;
                        margin-bottom: 20px;
                    }

                    .tab-button {
                        background-color: #f1f1f1;
                        border: none;
                        outline: none;
                        cursor: pointer;
                        padding: 12px 20px;
                        transition: background-color 0.3s;
                        font-weight: 600;
                        border-radius: 6px 6px 0 0;
                        margin-left: 5px;
                    }

                    .tab-button:hover {
                        background-color: #ddd;
                    }

                    .tab-button.active {
                        background-color: var(--primary-color);
                        color: white;
                    }

                    .tab-content {
                        display: none;
                        animation: fadeIn 0.5s;
                    }

                    .tab-content.active {
                        display: block;
                    }

                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }

                    .download-card {
                        background-color: white;
                        border-radius: var(--border-radius);
                        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                        padding: 2rem;
                        margin-bottom: 2rem;
                    }

                    .form-group {
                        margin-bottom: 1.5rem;
                    }

                    label {
                        display: block;
                        margin-bottom: 0.5rem;
                        font-weight: 600;
                    }

                    .input-url {
                        width: 100%;
                        padding: 0.75rem;
                        border: 1px solid #ddd;
                        border-radius: var(--border-radius);
                        font-size: 1rem;
                        direction: ltr;
                    }

                    .radio-group {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 1rem;
                        margin-top: 0.5rem;
                    }

                    .radio-option {
                        display: flex;
                        align-items: center;
                        background-color: var(--accent-color);
                        padding: 0.75rem 1rem;
                        border-radius: var(--border-radius);
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }

                    .radio-option:hover {
                        background-color: #e5e5e5;
                    }

                    .radio-option input {
                        margin-right: 0.5rem;
                    }

                    .submit-btn {
                        background-color: var(--primary-color);
                        color: white;
                        border: none;
                        padding: 0.75rem 2rem;
                        font-size: 1rem;
                        border-radius: var(--border-radius);
                        cursor: pointer;
                        transition: background-color 0.2s;
                        display: inline-block;
                        text-decoration: none;
                        text-align: center;
                    }

                    .submit-btn:hover {
                        background-color: #900;
                    }

                    .endpoints {
                        margin-top: 3rem;
                    }

                    .endpoint {
                        background-color: white;
                        border-radius: var(--border-radius);
                        padding: 1.5rem;
                        margin-bottom: 1rem;
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    }

                    .method {
                        color: var(--primary-color);
                        font-weight: bold;
                        margin-right: 0.5rem;
                    }

                    code {
                        background-color: var(--accent-color);
                        padding: 0.2rem 0.4rem;
                        border-radius: 3px;
                        font-family: 'Courier New', monospace;
                    }

                    .note {
                        background-color: #feffdc;
                        border-left: 4px solid #ffeb3b;
                        padding: 1rem;
                        margin-top: 2rem;
                    }

                    .preview {
                        display: none;
                        margin-top: 1.5rem;
                        border-top: 1px solid #eee;
                        padding-top: 1.5rem;
                    }

                    .preview.active {
                        display: block;
                    }

                    .video-info {
                        display: flex;
                        gap: 1rem;
                        margin-bottom: 1rem;
                    }

                    .thumbnail {
                        width: 120px;
                        min-width: 120px;
                        border-radius: var(--border-radius);
                    }

                    .error-message {
                        color: var(--primary-color);
                        background-color: rgba(255, 0, 0, 0.1);
                        padding: 1rem;
                        border-radius: var(--border-radius);
                        margin-top: 1rem;
                        display: none;
                    }

                    .loading {
                        text-align: center;
                        padding: 2rem;
                        display: none;
                    }

                    .spinner {
                        border: 4px solid rgba(0, 0, 0, 0.1);
                        border-radius: 50%;
                        border-top: 4px solid var(--primary-color);
                        width: 40px;
                        height: 40px;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 1rem;
                    }

                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }

                    .format-buttons {
                        display: flex;
                        gap: 10px;
                        margin-top: 20px;
                    }

                    .format-button {
                        background-color: #2196F3;
                        color: white;
                        border: none;
                        padding: 8px 15px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 0.9rem;
                        transition: background-color 0.2s;
                    }

                    .format-button:hover {
                        background-color: #0b7dda;
                    }

                    .format-button.srt {
                        background-color: #4CAF50;
                    }

                    .format-button.srt:hover {
                        background-color: #3e8e41;
                    }

                    .format-button.txt {
                        background-color: #ff9800;
                    }

                    .format-button.txt:hover {
                        background-color: #e68a00;
                    }

                    .transcript-preview {
                        display: none;
                        margin-top: 20px;
                        background: #f8f8f8;
                        padding: 15px;
                        border-radius: 5px;
                        max-height: 200px;
                        overflow-y: auto;
                        font-family: Arial, sans-serif;
                        white-space: pre-wrap;
                        direction: ltr;
                        text-align: left;
                    }

                    /* Responsive adjustments */
                    @media (max-width: 600px) {
                        .header h1 {
                            font-size: 2rem;
                        }

                        .radio-group {
                            flex-direction: column;
                            gap: 0.5rem;
                        }

                        .tab-buttons {
                            flex-direction: column;
                        }

                        .tab-button {
                            border-radius: 0;
                            margin-left: 0;
                            margin-bottom: 2px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>YouTube Downloader & Transcriber</h1>
                </div>

                <div class="container">
                    <div class="tab-container">
                        <div class="tab-buttons">
                            <button class="tab-button active" data-tab="download">הורדת אודיו</button> <!-- Changed label -->
                            <button class="tab-button" data-tab="transcribe">תמלול אודיו</button>
                        </div>

                        <div class="tab-content active" id="download-tab">
                            <div class="download-card">
                                <form id="download-form"> <!-- Removed action/method -->
                                    <div class="form-group">
                                        <label for="download-url">הדבק כתובת סרטון YouTube להורדת אודיו:</label>
                                        <input type="text" id="download-url" name="url" class="input-url"
                                            placeholder="https://www.youtube.com/watch?v=..." required
                                            dir="ltr">
                                    </div>
                                    <!-- Format selection removed -->
                                    <button type="submit" class="submit-btn">הורד אודיו (MP3)</button>
                                </form>

                                <div class="error-message" id="download-error-box"></div>

                                <div class="loading" id="download-loading">
                                    <div class="spinner"></div>
                                    <p>מכין את הורדת האודיו...</p>
                                </div>

                                <!-- Preview section removed -->
                            </div>
                        </div>

                        <div class="tab-content" id="transcribe-tab">
                            <div class="download-card">
                                <form id="transcribe-form">
                                    <div class="form-group">
                                        <label for="transcribe-url">הדבק כתובת סרטון YouTube לתמלול:</label>
                                        <input type="text" id="transcribe-url" name="url" class="input-url"
                                            placeholder="https://www.youtube.com/watch?v=..." required
                                            dir="ltr">
                                    </div>

                                    <div class="form-group">
                                        <label>בחר פורמט לתמלול:</label>
                                        <div class="radio-group">
                                            <label class="radio-option">
                                                <input type="radio" name="transcribe-format" value="json" checked>
                                                JSON (כולל חותמות זמן)
                                            </label>
                                            <label class="radio-option">
                                                <input type="radio" name="transcribe-format" value="srt">
                                                SRT (כתוביות)
                                            </label>
                                            <label class="radio-option">
                                                <input type="radio" name="transcribe-format" value="txt">
                                                טקסט בלבד (TXT)
                                            </label>
                                        </div>
                                    </div>

                                    <button type="submit" class="submit-btn">תמלל עכשיו</button>
                                </form>

                                <div class="error-message" id="transcribe-error-box"></div>

                                <div class="loading" id="transcribe-loading">
                                    <div class="spinner"></div>
                                    <p>מבצע תמלול... תהליך זה עשוי להימשך מספר דקות</p>
                                </div>

                                <div class="preview" id="transcribe-preview">
                                    <h3>תוצאות התמלול:</h3>
                                    <div class="video-info">
                                        <img id="transcribe-thumbnail" class="thumbnail" src="" alt="תמונה ממוזערת">
                                        <div>
                                            <h4 id="transcribe-video-title"></h4>
                                            <p id="transcribe-video-duration"></p>
                                        </div>
                                    </div>

                                    <div class="format-buttons">
                                        <a id="transcribe-json-btn" href="#" class="format-button json">הורד JSON</a>
                                        <a id="transcribe-srt-btn" href="#" class="format-button srt">הורד SRT</a>
                                        <a id="transcribe-txt-btn" href="#" class="format-button txt">הורד טקסט</a>
                                    </div>

                                    <div class="transcript-preview" id="transcript-text"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="endpoints">
                        <h2>ממשקי API זמינים:</h2>

                        <!-- Removed /youtube-info endpoint -->
                        <div class="endpoint">
                            <span class="method">GET</span>
                            <code>/download?id=YOUTUBE_VIDEO_ID</code>
                            <p>מוריד את האודיו (MP3) של סרטון YouTube.</p>
                        </div>

                        <div class="endpoint">
                            <span class="method">GET</span>
                            <code>/transcribe?id=YOUTUBE_VIDEO_ID&format=json|srt|txt</code>
                            <p>מתמלל סרטון YouTube ומחזיר את התמלול בפורמט המבוקש.</p>
                        </div>

                        <div class="endpoint">
                            <span class="method">GET</span>
                            <code>/proxy?url=URL</code>
                            <p>פרוקסי כללי להורדת קבצים.</p>
                        </div>
                    </div>

                    <div class="note">
                        <p><strong>הערות:</strong></p>
                        <p>1. הגבלת קצב בתוקף. מקסימום 10 בקשות לכל כתובת IP בכל 60 שניות.</p>
                        <p>2. תמלול עשוי להימשך מספר דקות, בהתאם לאורך הסרטון.</p>
                        <p>3. שרת זה נועד למטרות לימודיות בלבד.</p>
                    </div>
                </div>

                <script>
                    document.addEventListener('DOMContentLoaded', function() {
                        // Tab switching functionality
                        const tabButtons = document.querySelectorAll('.tab-button');
                        const tabContents = document.querySelectorAll('.tab-content');

                        tabButtons.forEach(button => {
                            button.addEventListener('click', function() {
                                const tabId = this.getAttribute('data-tab');

                                // Deactivate all tabs
                                tabButtons.forEach(btn => btn.classList.remove('active'));
                                tabContents.forEach(content => content.classList.remove('active'));

                                // Activate the clicked tab
                                this.classList.add('active');
                                document.getElementById(tabId + '-tab').classList.add('active');
                            });
                        });

                        // Simplified Download form functionality
                        const downloadForm = document.getElementById('download-form');
                        const downloadUrlInput = document.getElementById('download-url');
                        const downloadErrorBox = document.getElementById('download-error-box');
                        const downloadLoading = document.getElementById('download-loading');
                        // Preview elements removed

                        downloadForm.addEventListener('submit', async function(e) {
                            e.preventDefault();

                            // Hide previous errors and loading
                            downloadErrorBox.style.display = 'none';
                            downloadLoading.style.display = 'none'; // Hide loading initially

                            const url = downloadUrlInput.value.trim();
                            if (!url) {
                                showError(downloadErrorBox, 'נא להזין כתובת YouTube תקפה');
                                return;
                            }

                            // Extract video ID from URL
                            let videoId;
                            try {
                                videoId = extractVideoId(url);
                            } catch (error) {
                                showError(downloadErrorBox, error.message);
                                return;
                            }

                            if (!videoId) {
                                showError(downloadErrorBox, 'לא ניתן לחלץ את מזהה הסרטון מהכתובת. נא לוודא שזוהי כתובת YouTube תקפה.');
                                return;
                            }

                            // Show loading indicator (optional, as download starts immediately)
                            // downloadLoading.style.display = 'block';

                            // Construct the download URL and initiate download immediately
                            const downloadUrl = \`/download?id=\${videoId}\`;
                            console.log('Initiating download:', downloadUrl);

                            // Redirect the browser to start the download
                            window.location.href = downloadUrl;

                            // Optionally hide loading after a short delay, as the browser handles the download
                            // setTimeout(() => { downloadLoading.style.display = 'none'; }, 2000);
                        });

                        // Format selection logic removed

                        // Transcribe form functionality
                        const transcribeForm = document.getElementById('transcribe-form');
                        const transcribeUrlInput = document.getElementById('transcribe-url');
                        const transcribeErrorBox = document.getElementById('transcribe-error-box');
                        const transcribeLoading = document.getElementById('transcribe-loading');
                        const transcribePreview = document.getElementById('transcribe-preview');
                        const transcribeThumbnail = document.getElementById('transcribe-thumbnail');
                        const transcribeVideoTitle = document.getElementById('transcribe-video-title');
                        const transcribeVideoDuration = document.getElementById('transcribe-video-duration');
                        const jsonBtn = document.getElementById('transcribe-json-btn');
                        const srtBtn = document.getElementById('transcribe-srt-btn');
                        const txtBtn = document.getElementById('transcribe-txt-btn');
                        const transcriptText = document.getElementById('transcript-text');

                        transcribeForm.addEventListener('submit', async function(e) {
                            e.preventDefault();

                            // Hide any previous errors and preview
                            transcribeErrorBox.style.display = 'none';
                            transcribePreview.classList.remove('active');
                            transcriptText.style.display = 'none';

                            const url = transcribeUrlInput.value.trim();
                            if (!url) {
                                showError(transcribeErrorBox, 'נא להזין כתובת YouTube תקפה');
                                return;
                            }

                            // Extract video ID from URL
                            let videoId;
                            try {
                                videoId = extractVideoId(url);
                            } catch (error) {
                                showError(transcribeErrorBox, error.message);
                                return;
                            }

                            if (!videoId) {
                                showError(transcribeErrorBox, 'לא ניתן לחלץ את מזהה הסרטון מהכתובת. נא לוודא שזוהי כתובת YouTube תקפה.');
                                return;
                            }

                            // Show loading indicator
                            transcribeLoading.style.display = 'block';

                            try {
                                // Info fetching removed from here, handled by backend /transcribe

                                // Get selected format
                                const format = document.querySelector('input[name="transcribe-format"]:checked').value;

                                // Call transcribe endpoint
                                const transcribeResponse = await fetch(\`/transcribe?id=\${videoId}&format=\${format}\`);

                                if (!transcribeResponse.ok) {
                                    let errorMessage = \`שגיאה בתמלול: \${transcribeResponse.status} \${transcribeResponse.statusText}\`;
                                    try {
                                        const errorData = await transcribeResponse.json();
                                        if (errorData.error) {
                                            errorMessage = errorData.error;
                                        }
                                    } catch (e) {
                                        // If we can't parse the error, use the default message
                                    }
                                    throw new Error(errorMessage);
                                }

                                // Hide loading
                                transcribeLoading.style.display = 'none';

                                // Process response based on format
                                if (format === 'txt' || format === 'srt') {
                                    const textData = await transcribeResponse.text();

                                    // Update preview with basic info (title/duration might come from transcribe response later if needed)
                                    transcribeThumbnail.src = 'https://via.placeholder.com/120x68.png?text=Transcribed'; // Placeholder
                                    transcribeVideoTitle.textContent = 'Transcribed Video ID: ' + videoId; // Use ID as title for now
                                    transcribeVideoDuration.textContent = ''; // Clear duration

                                    // Show transcript preview
                                    transcriptText.textContent = textData.substring(0, 500) + (textData.length > 500 ? '...' : '');
                                    transcriptText.style.display = 'block';

                                    // Update download buttons
                                    jsonBtn.href = \`/transcribe?id=\${videoId}&format=json\`;
                                    srtBtn.href = \`/transcribe?id=\${videoId}&format=srt\`;
                                    txtBtn.href = \`/transcribe?id=\${videoId}&format=txt\`;

                                    // Show preview
                                    transcribePreview.classList.add('active');
                                } else { // JSON format
                                    const jsonData = await transcribeResponse.json();

                                    if (!jsonData.success) {
                                        throw new Error(jsonData.error || 'שגיאה לא ידועה בתמלול');
                                    }

                                    // Extract data for preview
                                    const transcriptInfo = jsonData.data;
                                    const transcriptData = transcriptInfo.transcript.text || (transcriptInfo.transcript.words ? transcriptInfo.transcript.words.map(w => w.text).join(' ') : '');

                                    // Update preview with info from response
                                    transcribeThumbnail.src = 'https://via.placeholder.com/120x68.png?text=Transcribed'; // Placeholder, API doesn't provide thumbnail
                                    transcribeVideoTitle.textContent = transcriptInfo.title || ('Video ID: ' + videoId);

                                    // Format duration if available
                                    const durationSeconds = transcriptInfo.duration || 0;
                                    if (durationSeconds > 0) {
                                        const minutes = Math.floor(durationSeconds / 60);
                                        const seconds = Math.floor(durationSeconds % 60);
                                        transcribeVideoDuration.textContent = \`אורך: \${minutes}:\${seconds < 10 ? '0' : ''}\${seconds}\`;
                                    } else {
                                        transcribeVideoDuration.textContent = '';
                                    }

                                    // Show transcript preview
                                    transcriptText.textContent = typeof transcriptData === 'string' ?
                                        (transcriptData.substring(0, 500) + (transcriptData.length > 500 ? '...' : '')) :
                                        'תמלול התקבל בהצלחה (פורמט JSON). לחץ על אחד מהכפתורים למטה כדי להוריד.';
                                    transcriptText.style.display = 'block';

                                    // Update download buttons
                                    jsonBtn.href = \`/transcribe?id=\${videoId}&format=json\`;
                                    srtBtn.href = \`/transcribe?id=\${videoId}&format=srt\`;
                                    txtBtn.href = \`/transcribe?id=\${videoId}&format=txt\`;

                                    // Show preview
                                    transcribePreview.classList.add('active');
                                }

                            } catch (error) {
                                transcribeLoading.style.display = 'none';
                                showError(transcribeErrorBox, error.message);
                            }
                        });

                        // Helper function to show error messages
                        function showError(errorElement, message) {
                            errorElement.textContent = message;
                            errorElement.style.display = 'block';
                        }

                        // Extract video ID from various YouTube URL formats
                        function extractVideoId(url) {
                            let videoId = null;

                            // Check for standard youtube.com/watch?v= format
                            const watchRegex = /youtube\\.com\\/watch\\?v=([^&]+)/;
                            const watchMatch = url.match(watchRegex);
                            if (watchMatch) {
                                videoId = watchMatch[1];
                            }

                            // Check for youtu.be/ format
                            const shortRegex = /youtu\\.be\\/([^?&]+)/;
                            const shortMatch = url.match(shortRegex);
                            if (shortMatch) {
                                videoId = shortMatch[1];
                            }

                            // Check for youtube.com/v/ format
                            const vRegex = /youtube\\.com\\/v\\/([^?&]+)/;
                            const vMatch = url.match(vRegex);
                            if (vMatch) {
                                videoId = vMatch[1];
                            }

                            // Check for youtube.com/embed/ format
                            const embedRegex = /youtube\\.com\\/embed\\/([^?&]+)/;
                            const embedMatch = url.match(embedRegex);
                            if (embedMatch) {
                                videoId = embedMatch[1];
                            }

                            if (!videoId) {
                                throw new Error('פורמט URL לא נתמך. נא להשתמש בכתובת סטנדרטית של YouTube.');
                            }

                            return videoId;
                        }
                    });
                </script>
            </body>
        </html>
    `);
});

// Custom 404 handler
app.use((req, res) => {
    console.log(`[404] No handler found for ${req.method} ${req.url}`);
    res.status(404).send(`
        <html>
            <head>
                <title>404 - Not Found</title>
                <meta charset="UTF-8">
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; padding: 0; background: #f0f0f0; }
                    h1 { color: #c00; font-size: 32px; }
                    .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    code { background: #f8f8f8; padding: 2px 6px; border-radius: 3px; font-family: monospace; border: 1px solid #ddd; }
                    .available-routes { margin-top: 20px; background: #f8f8f8; padding: 20px; border-radius: 8px; }
                    ul { padding-left: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>404 - Not Found</h1>
                    <p>The requested resource <code>${req.url}</code> was not found on this server.</p>

                    <div class="available-routes">
                        <h2>Available Routes</h2>
                        <ul>
                            <li><code>GET /</code> - Home page</li>
                            <li><code>GET /proxy?url=URL</code> - Proxy endpoint</li>
                            <!-- Removed /youtube-info -->
                            <li><code>GET /download?id=VIDEO_ID</code> - Download audio</li>
                            <li><code>GET /transcribe?id=VIDEO_ID&format=json|srt|txt</code> - Transcribe video</li>
                            <li><code>GET /health</code> - Health check</li>
                            <li><code>GET /test-proxy?url=URL</code> - Test proxy</li>
                        </ul>
                    </div>
                </div>
            </body>
        </html>
    `);
});

// Default port listener
app.listen(PORT, () => {
    console.log('----------------------------------------------------');
    console.log(`Proxy server STARTED and listening on port ${PORT}`);
    console.log('Available routes:');
    console.log('  - GET /                                      Home page');
    console.log('  - GET /proxy?url=URL                         Proxy endpoint');
    // console.log('  - GET /youtube-info?id=VIDEO_ID              Get video formats'); // Removed
    console.log('  - GET /download?id=VIDEO_ID                  Download audio'); // Updated
    console.log('  - GET /transcribe?id=VIDEO_ID&format=FORMAT  Transcribe video');
    console.log('  - GET /health                                Health check');
    console.log('  - GET /test-proxy?url=URL                    Test proxy');
    console.log('  - GET /proxy-manager?password=proxy123&action=ACTION  Manage proxies');
    console.log('----------------------------------------------------');

    // הדפסת הודעה שמציינת שמנגנון הפרוקסי מופעל
    console.log('\n=== מנגנון התגברות על חסימות יוטיוב מופעל ===');
    console.log('משתמש ב-headers מתקדמים וסיבוב פרוקסי אוטומטי');
    console.log(`מספר שרתי פרוקסי מוגדרים: ${proxyRotator.getProxyList().length}`);
    console.log('ניתן לנהל את הפרוקסי דרך נקודת הקצה /proxy-manager');
    console.log('=== מערכת מוכנה לשימוש ===\n');
});

// Add health check endpoint to verify server is running
app.get('/health', (req, res) => {
    console.log('Health check performed');
    return res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        endpoints: ['/proxy', '/transcribe', '/download', '/proxy-manager', '/test-proxy'],
        proxy: {
            enabled: proxyRotator.getProxyList().length > 0,
            count: proxyRotator.getProxyList().length
        }
    });
});

// Add debug endpoint to test proxy functionality
app.get('/test-proxy', async (req, res) => {
    const url = req.query.url || 'https://api.ipify.org?format=json';
    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);

    try {
        console.log(`[${requestId}] Testing proxy with URL: ${url}`);

        // יצירת אפשרויות עם פרוקסי
        const fetchOptions = {
            headers: headersManager.generateAdvancedHeaders({
                isYouTubeRequest: url.includes('youtube.com')
            }),
            timeout: 10000
        };

        // הוספת פרוקסי אם הוא מופעל
        const proxyAgent = proxyRotator.createProxyAgent();
        if (proxyAgent) {
            fetchOptions.agent = proxyAgent;
            console.log(`[${requestId}] Using proxy for this test request`);
        } else {
            console.log(`[${requestId}] No proxy used for this test request`);
        }

        // שליחת הבקשה
        const response = await fetch(url, fetchOptions);
        const data = await response.text();

        // ניסיון לפרסר כ-JSON אם אפשר
        let jsonData;
        try {
            jsonData = JSON.parse(data);
        } catch (e) {
            jsonData = null;
        }

        return res.json({
            success: true,
            url: url,
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            data: jsonData || data.substring(0, 500),
            proxy: {
                used: !!proxyAgent,
                count: proxyRotator.getProxyList().length
            }
        });
    } catch (error) {
        console.error(`[${requestId}] Test proxy error:`, error);
        return res.status(500).json({
            success: false,
            error: error.message,
            url: url,
            proxy: {
                used: proxyRotator.getProxyList().length > 0,
                count: proxyRotator.getProxyList().length
            }
        });
    }
});

// Add transcribe endpoint that downloads audio and then transcribes it
app.get('/transcribe', async (req, res) => {
    const videoId = req.query.id;
    const format = req.query.format || 'json'; // 'json', 'srt', or 'txt'
    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

    console.log(`[${requestId}] ========== STARTING TRANSCRIPTION PROCESS ==========`);
    console.log(`[${requestId}] Video ID: ${videoId}, format: ${format}`);

    if (!videoId) {
        return res.status(400).json({
            success: false,
            error: 'חסר פרמטר חובה: id (מזהה סרטון)',
            example: '/transcribe?id=YOUTUBE_VIDEO_ID&format=json|srt|txt'
        });
    }

    try {
        // STEP 1 & 2: Get audio download link from RapidAPI and download the audio
        console.log(`[${requestId}] STEP 1 & 2: Getting audio URL from RapidAPI and downloading`);

        const rapidApiKey = 'b7855e36bamsh122b17f6deeb803p1aca9bjsnb238415c0d28'; // Use the provided key
        const rapidApiHost = 'youtube-downloader-api-fast-reliable-and-easy.p.rapidapi.com';
        const youtubeWatchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const rapidApiUrl = `https://${rapidApiHost}/fetch_audio?url=${encodeURIComponent(youtubeWatchUrl)}`;

        let audioDownloadUrl;
        let audioFileSize = 0;
        const tempFileName = path.join(TEMP_DIR, `${videoId}_${Date.now()}.mp3`); // Keep temp file logic
        let apiMetadata = { title: '', duration: 0 }; // Placeholder for title/duration from API

        try {
            console.log(`[${requestId}] Calling RapidAPI: ${rapidApiUrl}`);
            const rapidApiResponse = await fetch(rapidApiUrl, {
                method: 'GET',
                headers: {
                    'x-rapidapi-key': rapidApiKey,
                    'x-rapidapi-host': rapidApiHost
                },
                timeout: 30000 // 30 second timeout
            });

            if (!rapidApiResponse.ok) {
                const errorText = await rapidApiResponse.text();
                console.error(`[${requestId}] RapidAPI error: ${rapidApiResponse.status} ${rapidApiResponse.statusText}. Body: ${errorText}`);
                throw new Error(`Failed to fetch audio info from RapidAPI: ${rapidApiResponse.status}`);
            }

            const rapidApiData = await rapidApiResponse.json();
            console.log(`[${requestId}] RapidAPI Response:`, JSON.stringify(rapidApiData).substring(0, 200) + '...'); // Log truncated response

            // Extract the download link and metadata (adjust based on actual API response structure)
            // Assuming the response looks like { success: true, link: "...", title: "...", duration: ... }
            if (!rapidApiData || !rapidApiData.success || !rapidApiData.link) {
                 // Log the actual response if the structure is unexpected
                console.error(`[${requestId}] Unexpected RapidAPI response structure:`, rapidApiData);
                throw new Error('Invalid response structure from RapidAPI or download link missing.');
            }
            audioDownloadUrl = rapidApiData.link;
            // Store title and duration if available from the API response
            apiMetadata.title = rapidApiData.title || `Video ${videoId}`;
            apiMetadata.duration = rapidApiData.duration || 0; // Assuming duration is in seconds

            console.log(`[${requestId}] Received audio download URL from RapidAPI: ${audioDownloadUrl.substring(0, 100)}...`);
            console.log(`[${requestId}] Title: ${apiMetadata.title}, Duration: ${apiMetadata.duration}s`);

            // Now download the audio file using the obtained URL
            console.log(`[${requestId}] Downloading audio from RapidAPI link to ${tempFileName}`);
            audioFileSize = await downloadFile(audioDownloadUrl, tempFileName, requestId); // Use existing downloadFile helper

            if (audioFileSize === 0) {
                 fs.unlinkSync(tempFileName); // Clean up empty file
                 throw new Error('Downloaded audio file is empty.');
            }
            console.log(`[${requestId}] Audio download successful. Size: ${audioFileSize} bytes`);

        } catch (error) {
            console.error(`[${requestId}] Error during RapidAPI fetch or download:`, error);
            // Clean up temp file if it exists and the error occurred
            if (fs.existsSync(tempFileName)) {
                try {
                    fs.unlinkSync(tempFileName);
                } catch (cleanupError) {
                    console.warn(`[${requestId}] Failed to cleanup temp file after error: ${cleanupError.message}`);
                }
            }
            throw new Error(`Failed to get or download audio via RapidAPI: ${error.message}`);
        }
        // The tempFileName now holds the downloaded audio, ready for STEP 3

        // STEP 3: Send to ElevenLabs for transcription
        console.log(`[${requestId}] STEP 3: SENDING TO ELEVENLABS FOR TRANSCRIPTION`);

        const formData = new FormData();
        formData.append('file', fs.createReadStream(tempFileName));
        formData.append('model_id', 'scribe_v1');
        formData.append('timestamps_granularity', 'word');
        formData.append('language', '');

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
                    await setTimeout(apiDelay);  // השימוש הנכון עם setTimeout מ-timers/promises
                    apiDelay *= 2;
                } else {
                    throw new Error(`ElevenLabs transcription failed: ${apiError.message}`);
                }
            }
        }

        // STEP 4: Clean up the temporary file
        try {
            fs.unlinkSync(tempFileName);
            console.log(`[${requestId}] Temporary audio file deleted: ${tempFileName}`);
        } catch (deleteError) {
            console.warn(`[${requestId}] Failed to delete temporary file: ${deleteError.message}`);
        }

        // STEP 5: Process the transcription data based on requested format
        console.log(`[${requestId}] STEP 5: Formatting results as ${format}`);

        if (format === 'json') {
            // Return raw JSON data from ElevenLabs, including metadata from RapidAPI
            return res.json({
                success: true,
                data: {
                    videoId: videoId,
                    title: apiMetadata.title,
                    duration: apiMetadata.duration,
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
            res.setHeader('Content-Disposition', `attachment; filename="${apiMetadata.title || videoId}.srt"`);
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
            res.setHeader('Content-Disposition', `attachment; filename="${apiMetadata.title || videoId}.txt"`);
            return res.send(plainText);
        } else {
            throw new Error(`פורמט לא נתמך: ${format}. יש להשתמש ב-json, srt, או txt.`);
        }

    } catch (error) {
        console.error(`[${requestId}] TRANSCRIPTION ERROR:`, error);

        return res.status(500).json({
            success: false,
            error: `שגיאה בתמלול: ${error.message}`,
            requestId: requestId
        });
    }
});

// Helper function to format seconds to SRT time format (HH:MM:SS,mmm)
function formatSrtTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

// Helper function to send multipart form request
async function sendMultipartFormRequest(url, formData, headers = {}) {
    return new Promise((resolve, reject) => {
        // Get the form headers and add our custom headers
        const formHeaders = formData.getHeaders();
        const combinedHeaders = { ...formHeaders, ...headers };

        // Get the form data as a readable stream
        const dataStream = formData;

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

<environment_details>
# VSCode Visible Files
server.js
server.js
server.js

# VSCode Open Tabs
server.js

# Current Time
4/3/2025, 7:42:25 PM (Asia/Jerusalem, UTC+3:00)

# Current Mode
ACT MODE
</environment_details>
