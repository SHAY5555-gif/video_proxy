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

// Updated download endpoint using youtube-search-download3 API and direct streaming
app.get('/download', async (req, res) => {
    const videoId = req.query.id;
    // Assuming 'mp3' is the desired audio format. Change if needed.
    const format = req.query.format || 'mp3';
    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

    if (!videoId) {
        return res.status(400).json({
            success: false,
            error: 'חסר פרמטר חובה: id (מזהה סרטון)',
            example: '/download?id=YOUTUBE_VIDEO_ID&format=mp3'
        });
    }

    console.log(`[${requestId}] Direct download request for video ID: ${videoId}, format: ${format}`);

    try {
        // Construct the API URL for youtube-search-download3
        const rapidApiKey = 'b7855e36bamsh122b17f6deeb803p1aca9bjsnb238415c0d28'; // Use the same key for now
        const rapidApiHost = 'youtube-search-download3.p.rapidapi.com';
        // Note: The example used type=mp4&resolution=360. We'll try type=mp3.
        // If this API doesn't support 'mp3', you might need 'm4a' or adjust based on API docs.
        const apiUrl = `https://${rapidApiHost}/v1/download?v=${videoId}&type=${format}`;

        console.log(`[${requestId}] Calling API: ${apiUrl}`);

        // Fetch directly from the download API
        const apiResponse = await fetchWithRetries(apiUrl, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': rapidApiKey,
                'x-rapidapi-host': rapidApiHost
            },
            timeout: 60000 // Increased timeout for potential download
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            console.error(`[${requestId}] API error: ${apiResponse.status} ${apiResponse.statusText}. Body: ${errorText.substring(0, 500)}`);
            // Try to parse JSON error if possible
            let errorJson = {};
            try { errorJson = JSON.parse(errorText); } catch(e) {}
            throw new Error(`Failed to fetch from download API: ${apiResponse.status} - ${errorJson.message || apiResponse.statusText}`);
        }

        console.log(`[${requestId}] API response OK (${apiResponse.status}). Streaming download...`);

        // Determine filename
        // Try to get filename from Content-Disposition header first
        let filename = `${videoId}.${format}`; // Default filename
        const disposition = apiResponse.headers.get('content-disposition');
        if (disposition && disposition.includes('filename=')) {
            const filenameMatch = disposition.match(/filename="?(.+?)"?$/);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
            }
        }
        // Clean filename just in case
        filename = filename.replace(/[<>:"/\\|?*]+/g, '_');

        console.log(`[${requestId}] Filename: ${filename}`);

        // Set headers for direct download
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

        // Copy relevant headers from API response (like Content-Type, Content-Length)
        const contentType = apiResponse.headers.get('content-type') || `audio/${format}`; // Default based on format
        res.setHeader('Content-Type', contentType);

        const contentLength = apiResponse.headers.get('content-length');
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
            console.log(`[${requestId}] Content-Length: ${contentLength}`);
        } else {
            console.warn(`[${requestId}] Content-Length header missing from API response.`);
        }

        // Pipe the API response body directly to the client response
        apiResponse.body.pipe(res).on('error', (streamErr) => {
            console.error(`[${requestId}] Error piping stream to client:`, streamErr);
            // Try to end the response if it hasn't already finished
            if (!res.writableEnded) {
                res.end();
            }
        }).on('finish', () => {
            console.log(`[${requestId}] Stream finished successfully.`);
        });

    } catch (error) {
        console.error(`[${requestId}] Download error:`, error);
        // Send a JSON error response
        res.status(500).json({
            success: false,
            error: `שגיאה בהורדה: ${error.message}`,
            requestId: requestId
        });
        /* // Optional: Keep HTML error page if preferred
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
        */ // Close the multi-line comment
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

// Serve the main HTML page from index.html
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    fs.readFile(indexPath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading index.html:', err);
            return res.status(500).send('Error loading the page.');
        }
        res.setHeader('Content-Type', 'text/html');
        res.send(data);
    });
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
        // STEP 1: Download audio using the new API (youtube-search-download3)
        console.log(`[${requestId}] STEP 1: Downloading audio using youtube-search-download3`);

        const rapidApiKey = 'b7855e36bamsh122b17f6deeb803p1aca9bjsnb238415c0d28'; // Use the same key
        const rapidApiHost = 'youtube-search-download3.p.rapidapi.com'; // *** Use the NEW API host ***
        const audioFormat = 'mp3'; // Assuming mp3 is desired for transcription
        const apiUrl = `https://${rapidApiHost}/v1/download?v=${videoId}&type=${audioFormat}`;

        const tempFileName = path.join(TEMP_DIR, `${videoId}_${Date.now()}.${audioFormat}`);
        let apiMetadata = { title: `Video ${videoId}`, duration: 0 }; // Default metadata

        try {
            console.log(`[${requestId}] Calling API: ${apiUrl}`);
            const apiResponse = await fetchWithRetries(apiUrl, {
                method: 'GET',
                headers: {
                    'x-rapidapi-key': rapidApiKey,
                    'x-rapidapi-host': rapidApiHost
                },
                timeout: 60000 // Increased timeout for download
            });

            if (!apiResponse.ok) {
                const errorText = await apiResponse.text();
                console.error(`[${requestId}] API download error: ${apiResponse.status} ${apiResponse.statusText}. Body: ${errorText.substring(0, 500)}`);
                let errorJson = {};
                try { errorJson = JSON.parse(errorText); } catch(e) {}
                throw new Error(`Failed to fetch audio from download API: ${apiResponse.status} - ${errorJson.message || apiResponse.statusText}`);
            }

            console.log(`[${requestId}] API response OK (${apiResponse.status}). Saving audio stream to ${tempFileName}`);

            // Pipe the stream to a temporary file
            await new Promise((resolve, reject) => {
                const fileStream = fs.createWriteStream(tempFileName);
                apiResponse.body.pipe(fileStream);
                apiResponse.body.on('error', (err) => {
                    console.error(`[${requestId}] Error reading API response stream:`, err);
                    fileStream.close(); // Ensure filestream is closed on error
                    reject(new Error(`Error reading audio stream: ${err.message}`));
                });
                fileStream.on('finish', () => {
                    const stats = fs.statSync(tempFileName);
                    console.log(`[${requestId}] Audio download successful. Size: ${stats.size} bytes`);
                    if (stats.size === 0) {
                        reject(new Error('Downloaded audio file is empty.'));
                    } else {
                        resolve();
                    }
                });
                fileStream.on('error', (err) => {
                     console.error(`[${requestId}] Error writing audio to temp file:`, err);
                     reject(new Error(`Error writing temp file: ${err.message}`));
                });
            });

            // Note: This API might not provide title/duration. We'll use defaults.
            // If the API *does* provide metadata (e.g., in headers), you could extract it here.
            const disposition = apiResponse.headers.get('content-disposition');
             if (disposition && disposition.includes('filename=')) {
                 const filenameMatch = disposition.match(/filename="?(.+?)"?$/);
                 if (filenameMatch && filenameMatch[1]) {
                     // Attempt to extract title from filename, removing extension
                     let extractedTitle = filenameMatch[1].replace(/\.[^/.]+$/, "");
                     apiMetadata.title = extractedTitle || apiMetadata.title;
                     console.log(`[${requestId}] Extracted title from header: ${apiMetadata.title}`);
                 }
             }

        } catch (error) {
            console.error(`[${requestId}] Error during audio download for transcription:`, error);
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

// End of file
