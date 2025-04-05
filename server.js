/**
 * YouTube Transcription Service
 * שירות לתמלול סרטוני יוטיוב באמצעות ElevenLabs
 */

const express = require('express');
const fetch = require('node-fetch');
const { setTimeout } = require('timers/promises');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');
const https = require('https');
const http = require('http');

// הגדרות בסיסיות
const app = express();
const PORT = process.env.PORT || 3000;

// שירות קבצים סטטיים
app.use(express.static(path.join(__dirname)));

// מפתחות API
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "sk_3cc5eba36a57dc0b8652796ce6c3a6f28277c977e93070da";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "b7855e36bamsh122b17f6deeb803p1aca9bjsnb238415c0d284";
const RAPIDAPI_HOST = "youtube-search-download3.p.rapidapi.com";

// יצירת תיקייה זמנית לאחסון קבצי מדיה
const TEMP_DIR = path.join(os.tmpdir(), 'youtube-transcription');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ניקוי קבצים זמניים כל שעה
setInterval(() => {
    try {
        const currentTime = Date.now();
        const files = fs.readdirSync(TEMP_DIR);

        for (const file of files) {
            const filePath = path.join(TEMP_DIR, file);
            const stats = fs.statSync(filePath);

            // מחיקת קבצים ישנים יותר משעה
            if (currentTime - stats.mtimeMs > 60 * 60 * 1000) {
                fs.unlinkSync(filePath);
                console.log(`ניקוי קבצים: נמחק קובץ זמני ישן: ${filePath}`);
            }
        }
    } catch (err) {
        console.error('שגיאה בניקוי קבצים זמניים:', err);
    }
}, 60 * 60 * 1000);

// הפעלת CORS
app.use(require('cors')());

// Middleware לתיעוד בקשות
app.use((req, res, next) => {
    const method = req.method;
    const url = req.url;
    console.log(`[בקשה] ${method} ${url}`);
    next();
});

/**
 * נקודת קצה עבור מדיניות פרטיות
 */
app.get('/privacy-policy', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Policy - YouTube Custom Subtitles Extension</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        h1, h2, h3 {
            color: #2c3e50;
        }
        h1 {
            border-bottom: 2px solid #eee;
            padding-bottom: 10px;
        }
        h2 {
            margin-top: 30px;
        }
        p {
            margin: 15px 0;
        }
        ul {
            padding-left: 20px;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            font-size: 0.9em;
            color: #666;
        }
    </style>
</head>
<body>
    <h1>Privacy Policy</h1>
    <p>Last updated: May 1, 2023</p>

    <p>Thank you for using the YouTube Custom Subtitles Extension ("Extension"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Extension.</p>
    
    <p>Please read this Privacy Policy carefully. By using the Extension, you agree to the collection and use of information in accordance with this policy.</p>

    <h2>Information We Collect</h2>
    <p>We collect the following types of information:</p>

    <h3>Personal Information</h3>
    <ul>
        <li><strong>Account Information:</strong> When you choose to sign in with Google, we receive your email address and name to create and manage your account.</li>
        <li><strong>Authentication Data:</strong> We use Google authentication to verify your identity. We do not store your Google password.</li>
    </ul>

    <h3>Usage Information</h3>
    <ul>
        <li><strong>Extension Usage:</strong> We collect information about how you use the Extension, including which features you use and your subtitle preferences.</li>
        <li><strong>YouTube Data:</strong> We collect information about the YouTube videos you're watching when you use our Extension to add subtitles.</li>
    </ul>

    <h2>How We Use Your Information</h2>
    <p>We use the information we collect to:</p>
    <ul>
        <li>Provide, maintain, and improve the Extension</li>
        <li>Create and manage your user account</li>
        <li>Save your subtitle files and preferences</li>
        <li>Process and deliver your subtitle requests</li>
        <li>Respond to your inquiries and support requests</li>
        <li>Monitor and analyze usage patterns and trends</li>
    </ul>

    <h2>Data Storage</h2>
    <p>We use Supabase, a secure database service, to store your account information and subtitle preferences. Your data is stored securely and is protected by industry-standard security measures.</p>

    <h2>Third-Party Services</h2>
    <p>Our Extension integrates with the following third-party services:</p>
    <ul>
        <li><strong>Google Authentication:</strong> For user authentication. Please refer to <a href="https://policies.google.com/privacy" target="_blank">Google's Privacy Policy</a> for information on how they handle your data.</li>
        <li><strong>Supabase:</strong> For data storage. Please refer to <a href="https://supabase.io/privacy" target="_blank">Supabase's Privacy Policy</a> for information on how they handle your data.</li>
    </ul>

    <h2>Data Sharing</h2>
    <p>We do not sell, trade, or otherwise transfer your personal information to outside parties except as described in this Privacy Policy. We may share your information with service providers who assist us in operating our Extension, conducting our business, or serving you, so long as those parties agree to keep this information confidential.</p>

    <h2>Security</h2>
    <p>We implement a variety of security measures to maintain the safety of your personal information. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee its absolute security.</p>

    <h2>Your Rights</h2>
    <p>You have the right to:</p>
    <ul>
        <li>Access the personal information we have about you</li>
        <li>Correct inaccuracies in your personal information</li>
        <li>Delete your personal information</li>
        <li>Object to the processing of your personal information</li>
        <li>Request a copy of your personal information in a structured, commonly used, and machine-readable format</li>
    </ul>

    <h2>Children's Privacy</h2>
    <p>Our Extension is not intended for use by children under the age of 13, and we do not knowingly collect personal information from children under 13.</p>

    <h2>Changes to This Privacy Policy</h2>
    <p>We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.</p>

    <h2>Contact Us</h2>
    <p>If you have any questions about this Privacy Policy, please contact us at:</p>
    <p>Email: support@youtube-custom-subtitles.com</p>

    <div class="footer">
        <p>YouTube Custom Subtitles Extension</p>
    </div>
</body>
</html>
    `);
});

/**
 * Health check endpoint for Render
 */
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

/**
 * פונקציית עזר: fetch עם ניסיונות חוזרים במקרה של כישלון
 */
async function fetchWithRetries(url, options, maxRetries = 3) {
    let lastError;
    let retryDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`ניסיון ${attempt}/${maxRetries} עבור כתובת: ${url.substring(0, 100)}...`);
            const response = await fetch(url, options);

            if (response.status === 429) {
                console.log(`הגבלת קצב. המתנה ${retryDelay}ms לפני ניסיון חוזר`);
                await setTimeout(retryDelay);
                retryDelay *= 2;
                continue;
            }

            return response;
        } catch (err) {
            lastError = err;
            console.error(`ניסיון fetch ${attempt} נכשל:`, err.message);

            if (attempt < maxRetries) {
                console.log(`המתנה ${retryDelay}ms לפני ניסיון חוזר...`);
                await setTimeout(retryDelay);
                retryDelay *= 2;
            }
        }
    }
    
    throw lastError || new Error('נכשל לבצע fetch אחרי מספר ניסיונות');
}

/**
 * פונקציית עזר: פורמט לגודל קובץ
 */
function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return 'לא ידוע';

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i === 0) return bytes + ' ' + sizes[i];

    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

/**
 * פונקציית עזר: המרת שניות לפורמט SRT (HH:MM:SS,mmm)
 */
function formatSrtTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/**
 * פונקציית עזר: שליחת בקשת multipart form
 */
async function sendMultipartFormRequest(url, formData, headers = {}) {
    return new Promise((resolve, reject) => {
        // קבלת ה-headers של הטופס והוספת ה-headers המותאמים
        const formHeaders = formData.getHeaders();
        const combinedHeaders = { ...formHeaders, ...headers };

        // פירוק ה-URL
        const parsedUrl = new URL(url);

        // הכנת אפשרויות הבקשה
        const options = {
            method: 'POST',
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            headers: combinedHeaders
        };

        // בחירת מודול http או https בהתאם ל-URL
        const httpModule = parsedUrl.protocol === 'https:' ? https : http;

        // יצירת הבקשה
        const req = httpModule.request(options, (res) => {
            const chunks = [];

            res.on('data', (chunk) => {
                chunks.push(chunk);
            });

            res.on('end', () => {
                const responseBody = Buffer.concat(chunks).toString();
                let data;

                // ניסיון לפרסר כ-JSON אם אפשר
                try {
                    data = JSON.parse(responseBody);
                    } catch (e) {
                    data = responseBody;
                }

                resolve({ response: res, data });
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        // העברת נתוני הטופס לבקשה
        formData.pipe(req);
    });
}

/**
 * נקודת קצה ראשית לתמלול
 */
app.get('/transcribe', async (req, res) => {
    const videoUrl = req.query.url;
    const videoId = req.query.id;
    const format = req.query.format || 'srt'; // ברירת מחדל ל-SRT
    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

    console.log(`[${requestId}] ========== מתחיל תהליך תמלול ==========`);
    
    // טיפול בכתובת או מזהה וידאו
    let actualVideoId = videoId;
    
    if (videoUrl && !videoId) {
        // חילוץ מזהה וידאו מכתובת אם סופקה
        try {
            const urlObj = new URL(videoUrl);
            if (urlObj.hostname.includes('youtube.com')) {
                actualVideoId = urlObj.searchParams.get('v');
            } else if (urlObj.hostname.includes('youtu.be')) {
                actualVideoId = urlObj.pathname.substring(1);
            }
    } catch (error) {
            console.error(`[${requestId}] שגיאה בפירוק כתובת YouTube:`, error);
        }
    }
    
    if (!actualVideoId) {
        return res.status(400).json({
            success: false,
            error: 'חסר פרמטר חובה: id או url (מזהה סרטון או כתובת)',
            example: '/transcribe?id=YOUTUBE_VIDEO_ID או /transcribe?url=YOUTUBE_URL'
        });
    }
    
    console.log(`[${requestId}] מזהה סרטון: ${actualVideoId}, פורמט: ${format}`);

    try {
        // שלב 1: הורדת וידאו באמצעות RapidAPI
        console.log(`[${requestId}] שלב 1: מוריד סרטון (MP4) באמצעות RapidAPI`);

        const videoFormat = 'mp4';
        const videoResolution = '360'; // רזולוציה נמוכה יותר להורדה מהירה יותר
        const apiUrl = `https://${RAPIDAPI_HOST}/v1/download?v=${actualVideoId}&type=${videoFormat}&resolution=${videoResolution}`;

        const tempFileName = path.join(TEMP_DIR, `${actualVideoId}_${Date.now()}.${videoFormat}`);
        let apiMetadata = { title: `Video ${actualVideoId}`, duration: 0 };

        // שלב 1.1: קבלת קישור הורדה מ-RapidAPI
        console.log(`[${requestId}] קורא ל-RapidAPI לקבלת קישור הורדה: ${apiUrl}`);
            const apiMetadataResponse = await fetchWithRetries(apiUrl, {
                method: 'GET',
                headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': RAPIDAPI_HOST
            }
            });

            if (!apiMetadataResponse.ok) {
            throw new Error(`נכשל לקבל מטא-דאטה מ-RapidAPI: ${apiMetadataResponse.status}`);
            }

            const metadata = await apiMetadataResponse.json();
        const actualVideoUrl = metadata?.url;

            if (!actualVideoUrl) {
            throw new Error('RapidAPI לא החזיר קישור הורדה תקין');
            }

        console.log(`[${requestId}] התקבל קישור להורדת וידאו מ-RapidAPI`);

        // חילוץ כותרת מהמטא-דאטה אם זמינה
             if (metadata?.title) {
                 apiMetadata.title = metadata.title;
            console.log(`[${requestId}] כותרת סרטון: ${apiMetadata.title}`);
        }

        // שלב 1.2: הורדת הוידאו לאחסון בשרת
        console.log(`[${requestId}] מוריד את תוכן הוידאו...`);
        const videoResponse = await fetchWithRetries(actualVideoUrl, {
                 method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!videoResponse.ok) {
            throw new Error(`נכשל להוריד את תוכן הוידאו: ${videoResponse.status}`);
        }

        console.log(`[${requestId}] שומר וידאו לאחסון זמני: ${tempFileName}`);

        // שמירת הוידאו לקובץ זמני
            await new Promise((resolve, reject) => {
                const fileStream = fs.createWriteStream(tempFileName);
            videoResponse.body.pipe(fileStream);
            
            videoResponse.body.on('error', (err) => {
                fileStream.close();
                reject(new Error(`שגיאה בהורדת וידאו: ${err.message}`));
            });
            
                fileStream.on('finish', () => {
                    const stats = fs.statSync(tempFileName);
                console.log(`[${requestId}] הורדת וידאו הושלמה. גודל: ${formatFileSize(stats.size)}`);
                    if (stats.size === 0) {
                    reject(new Error('קובץ הוידאו שהורד ריק.'));
                    } else {
                        resolve();
                    }
                });
            
                fileStream.on('error', (err) => {
                reject(new Error(`שגיאה בשמירת וידאו: ${err.message}`));
                });
            });

        // שלב 2: שליחה ל-ElevenLabs לתמלול
        console.log(`[${requestId}] שלב 2: שולח ל-ElevenLabs לתמלול`);

        const formData = new FormData();
        formData.append('file', fs.createReadStream(tempFileName));
        formData.append('model_id', 'scribe_v1');
        formData.append('timestamps_granularity', 'word');
        formData.append('language', ''); // זיהוי שפה אוטומטי

        // שליחה ל-API של ElevenLabs
        const { response: apiResponse, data } = await sendMultipartFormRequest(
                    'https://api.elevenlabs.io/v1/speech-to-text',
                    formData,
                    { 'xi-api-key': ELEVENLABS_API_KEY }
                );

        if (apiResponse.statusCode !== 200) {
            throw new Error(`שגיאת ElevenLabs API: ${apiResponse.statusCode}`);
        }

        console.log(`[${requestId}] התמלול התקבל בהצלחה`);
        
        // שלב 3: ניקוי הקובץ הזמני
        try {
            fs.unlinkSync(tempFileName);
            console.log(`[${requestId}] קובץ וידאו זמני נמחק: ${tempFileName}`);
        } catch (deleteError) {
            console.warn(`[${requestId}] נכשל למחוק קובץ זמני: ${deleteError.message}`);
        }

        // שלב 4: פורמט והחזרת התמלול בהתאם לפורמט המבוקש
        console.log(`[${requestId}] שלב 4: מפרמט תוצאות כ-${format}`);

        if (format === 'json') {
            // החזרת נתוני JSON גולמיים
            return res.json({
                success: true,
                data: {
                    videoId: actualVideoId,
                    title: apiMetadata.title,
                    transcript: data,
                    language: data.language || 'unknown'
                }
            });
        } else if (format === 'srt') {
            // המרה לפורמט SRT
            let srtContent = "";
            let counter = 1;

            if (data.words && Array.isArray(data.words)) {
                // קיבוץ מילים לקבוצות
                const chunks = [];
                let currentChunk = [];
                let currentDuration = 0;
                const MAX_CHUNK_DURATION = 5;

                for (const word of data.words) {
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

                // המרת קבוצות ל-SRT
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
            res.setHeader('Content-Disposition', `attachment; filename="${apiMetadata.title || actualVideoId}.srt"`);
            return res.send(srtContent);
        } else if (format === 'txt') {
            // המרה לפורמט טקסט פשוט
            let plainText = "";

            if (data.text) {
                plainText = data.text;
            } else if (data.words && Array.isArray(data.words)) {
                plainText = data.words.map(w => w.text).join(' ')
                    .replace(/ ([.,!?:;])/g, '$1');
            }

            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', `attachment; filename="${apiMetadata.title || actualVideoId}.txt"`);
            return res.send(plainText);
        } else {
            throw new Error(`פורמט לא נתמך: ${format}. השתמש ב-json, srt, או txt.`);
        }

    } catch (error) {
        console.error(`[${requestId}] שגיאת תמלול:`, error);

        return res.status(500).json({
            success: false,
            error: `שגיאה בתמלול: ${error.message}`,
            requestId: requestId
        });
    }
});

/**
 * טופס פשוט לתמלול סרטוני יוטיוב
 */
app.get('/transcribe-form', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>תמלול סרטוני יוטיוב</title>
            <style>
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    background-color: #f5f5f5;
                    margin: 0;
                    padding: 20px;
                    display: flex;
                    justify-content: center;
                }
                .container {
                    max-width: 600px;
                    width: 100%;
                    background-color: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    padding: 20px;
                }
                h1 {
                    color: #d32f2f;
                    margin-top: 0;
                    margin-bottom: 20px;
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                input[type="text"] {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 16px;
                }
                select {
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 16px;
                }
                button {
                    background-color: #d32f2f;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 10px 20px;
                    font-size: 16px;
                    cursor: pointer;
                    transition: background-color 0.3s;
                }
                button:hover {
                    background-color: #b71c1c;
                }
                .status {
                    margin-top: 20px;
                    padding: 10px;
                    border-radius: 4px;
                    display: none;
                }
                .loading {
                    background-color: #e3f2fd;
                    border: 1px solid #bbdefb;
                    display: none;
                }
                .error {
                    background-color: #ffebee;
                    border: 1px solid #ffcdd2;
                    display: none;
                }
                .success {
                    background-color: #e8f5e9;
                    border: 1px solid #c8e6c9;
                    display: none;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>תמלול סרטוני יוטיוב</h1>
                <div class="form-group">
                    <label for="youtubeUrl">הדבק כתובת סרטון יוטיוב:</label>
                    <input type="text" id="youtubeUrl" placeholder="https://www.youtube.com/watch?v=..." dir="ltr">
                </div>
                <div class="form-group">
                    <label for="format">פורמט תמלול:</label>
                    <select id="format">
                        <option value="srt">SRT (כתוביות)</option>
                        <option value="txt">טקסט בלבד</option>
                        <option value="json">JSON (מפורט)</option>
                    </select>
                </div>
                <button id="transcribeBtn">תמלל סרטון</button>
                
                <div id="loadingStatus" class="status loading">
                    מתמלל את הסרטון... התהליך עשוי להימשך מספר דקות בהתאם לאורך הסרטון.
                </div>
                
                <div id="errorStatus" class="status error"></div>
                
                <div id="successStatus" class="status success">
                    התמלול הושלם בהצלחה! הורדת הקובץ אמורה להתחיל אוטומטית.
                </div>
            </div>
            
            <script>
                document.getElementById('transcribeBtn').addEventListener('click', async function() {
                    // קבלת כתובת היוטיוב והפורמט
                    const youtubeUrl = document.getElementById('youtubeUrl').value.trim();
                    const format = document.getElementById('format').value;
                    
                    // בדיקת תקינות הכתובת
                    if (!youtubeUrl) {
                        const errorStatus = document.getElementById('errorStatus');
                        errorStatus.textContent = 'נא להזין כתובת סרטון יוטיוב';
                        errorStatus.style.display = 'block';
                        return;
                    }
                    
                    // הסתרת סטטוס קודם והצגת טעינה
                    document.getElementById('errorStatus').style.display = 'none';
                    document.getElementById('successStatus').style.display = 'none';
                    const loadingStatus = document.getElementById('loadingStatus');
                    loadingStatus.style.display = 'block';
                    
                    try {
                        // יצירת בקשת תמלול
                        const transcriptionUrl = \`/transcribe?url=\${encodeURIComponent(youtubeUrl)}&format=\${format}\`;
                        
                        // עבור פורמטים להורדה, פתיחה בחלון חדש
                        if (format === 'srt' || format === 'txt') {
                            window.open(transcriptionUrl, '_blank');
                            
                            // הצגת הודעת הצלחה
                            loadingStatus.style.display = 'none';
                            document.getElementById('successStatus').style.display = 'block';
                        } else {
                            // עבור JSON, ביצוע fetch והצגה
                            const response = await fetch(transcriptionUrl);
                            
                            if (!response.ok) {
                                const errorData = await response.json();
                                throw new Error(errorData.error || 'שגיאה בתמלול הסרטון');
                            }
                            
                            const data = await response.json();
                            
                            // הצגת הצלחה והפניה
                            loadingStatus.style.display = 'none';
                            document.getElementById('successStatus').style.display = 'block';
                            
                            // פתיחת JSON בלשונית חדשה
                            const jsonBlob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                            const url = URL.createObjectURL(jsonBlob);
                            window.open(url, '_blank');
                        }
                    } catch (error) {
                        // הצגת שגיאה
                        loadingStatus.style.display = 'none';
                        const errorStatus = document.getElementById('errorStatus');
                        errorStatus.textContent = error.message || 'שגיאה בתמלול הסרטון';
                        errorStatus.style.display = 'block';
                    }
                });
            </script>
            
            <div style="margin-top: 30px; text-align: center; font-size: 14px; color: #666;">
                <p><a href="/privacy-policy" style="color: #666; text-decoration: underline;">מדיניות פרטיות</a> | שירות תמלול יוטיוב © 2024</p>
            </div>
        </body>
        </html>
    `);
});

/**
 * עמוד הבית הראשי
 */
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>שירות תמלול יוטיוב</title>
            <style>
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    background-color: #f5f5f5;
                    margin: 0;
                    padding: 0;
                    color: #333;
                }
                .header {
                    background-color: #d32f2f;
                    color: white;
                    padding: 40px 0;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 36px;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .card {
                    background-color: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    padding: 20px;
                    margin-bottom: 20px;
                }
                h2 {
                    color: #d32f2f;
                    margin-top: 0;
                }
                .cta-button {
                    display: inline-block;
                    background-color: #d32f2f;
                    color: white;
                    text-decoration: none;
                    padding: 12px 25px;
                    border-radius: 4px;
                    font-weight: bold;
                    margin-top: 10px;
                    transition: background-color 0.3s;
                }
                .cta-button:hover {
                    background-color: #b71c1c;
                }
                .features {
                    display: flex;
                    flex-wrap: wrap;
                    margin-top: 20px;
                    gap: 20px;
                }
                .feature {
                    flex: 1 1 200px;
                    background-color: #f9f9f9;
                    padding: 15px;
                    border-radius: 8px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .feature h3 {
                    margin-top: 0;
                    color: #d32f2f;
                }
                footer {
                    text-align: center;
                    padding: 20px;
                    color: #666;
                    font-size: 14px;
                }
                code {
                    background-color: #f1f1f1;
                    padding: 3px 6px;
                    border-radius: 3px;
                    font-family: Consolas, Monaco, 'Andale Mono', monospace;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>שירות תמלול יוטיוב</h1>
            </div>
            
            <div class="container">
                <div class="card">
                    <h2>קבל תמליל לכל סרטון יוטיוב</h2>
                    <p>השירות שלנו מאפשר לך לקבל תמליל מדויק של כל סרטון יוטיוב בקלות ובמהירות. פשוט הדבק את כתובת הסרטון ובחר את פורמט התמלול הרצוי.</p>
                    <a href="/transcribe-form" class="cta-button">לתמלול סרטון</a>
                    
                    <div class="features">
                        <div class="feature">
                            <h3>קבצי SRT</h3>
                            <p>תמלול בפורמט SRT המתאים לכתוביות, כולל חותמות זמן מדויקות</p>
                        </div>
                        <div class="feature">
                            <h3>טקסט פשוט</h3>
                            <p>תמלול בפורמט טקסט פשוט, מושלם לשימוש במסמכים</p>
                        </div>
                        <div class="feature">
                            <h3>פורמט JSON</h3>
                            <p>תמלול בפורמט JSON עם מידע מפורט על כל מילה וחותמת זמן</p>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <h2>שימוש ב-API</h2>
                    <p>ניתן להשתמש ב-API שלנו ישירות:</p>
                    <p><code>/transcribe?url=YOUTUBE_VIDEO_URL&format=srt|txt|json</code></p>
                    <p>או</p>
                    <p><code>/transcribe?id=YOUTUBE_VIDEO_ID&format=srt|txt|json</code></p>
                    
                    <h3>דוגמאות:</h3>
                    <ul>
                        <li>
                            <p>תמלול סרטון לפורמט SRT:</p>
                            <code>/transcribe?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&format=srt</code>
                        </li>
                        <li>
                            <p>תמלול סרטון לפורמט טקסט פשוט:</p>
                            <code>/transcribe?id=dQw4w9WgXcQ&format=txt</code>
                        </li>
                    </ul>
                </div>
                
                <div class="card">
                    <h2>אודות השירות</h2>
                    <p>שירות תמלול יוטיוב משתמש בטכנולוגיה מתקדמת של ElevenLabs לתמלול מדויק של סרטוני וידאו. השירות שלנו מאפשר:</p>
                    <ul>
                        <li>תמלול סרטונים בכל שפה</li>
                        <li>דיוק גבוה במיוחד בזיהוי דיבור</li>
                        <li>תמיכה בסרטונים ארוכים</li>
                        <li>יצירת כתוביות מוכנות להטמעה בסרטונים</li>
                    </ul>
                </div>
            </div>
            
            <footer>
                <p>שירות תמלול יוטיוב © 2024 | <a href="/privacy-policy" style="color: #666; text-decoration: underline;">מדיניות פרטיות</a> | כל הזכויות שמורות</p>
            </footer>
        </body>
        </html>
    `);
});

// הפעלת השרת
app.listen(PORT, () => {
    console.log(`השרת פועל על פורט ${PORT}`);
    console.log(`שירות תמלול יוטיוב זמין בכתובות:`);
    console.log(`- ממשק משתמש: http://localhost:${PORT}/`);
    console.log(`- טופס תמלול: http://localhost:${PORT}/transcribe-form`);
    console.log(`- API: http://localhost:${PORT}/transcribe?url=YOUTUBE_URL&format=srt|txt|json`);
}); 