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
const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Update Supabase configuration with direct values
const supabaseUrl = 'https://revvbfxlqavgjegqeqdc.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJldnZiZnhscWF2Z2plcWRjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MzUyNzIyMSwiZXhwIjoyMDU5MTAzMjIxfQ.aV1K9hm40fhriIaRF9CBdHFzWLk5n3FzqsbTc5RjnAs';
// Replace supabase-server-config import with direct initialization
const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey);

// Log key prefix to verify correct key is used
console.log(`[Supabase Init] Using URL=${supabaseUrl}, key prefix=${supabaseServiceRoleKey.slice(0,8)}`);

// הגדרות בסיסיות
const app = express();
const PORT = process.env.PORT || 8081;

// הפעלת CORS
app.use(require('cors')());

// Middleware לתיעוד בקשות
app.use((req, res, next) => {
    const method = req.method;
    const url = req.url;
    console.log(`[בקשה] ${method} ${url}`);
    next();
});

// שירות קבצים סטטיים מתוך תיקיית public ברמת השורש
const PUBLIC_DIR = path.join(__dirname, '../../public');
app.use(express.static(PUBLIC_DIR));

// מפתחות API
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "b7855e36bamsh122b17f6deeb803p1aca9bjsnb238415c0d28";
const RAPIDAPI_HOST = "youtube-mp3-audio-video-downloader.p.rapidapi.com";
const ZMIO_API_KEY = process.env.ZMIO_API_KEY || "hBsrDies";

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

/**
 * נקודת קצה עבור מדיניות פרטיות
 */
app.get('/privacy-policy', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>מדיניות פרטיות - שירות תמלול וידאו</title>
    <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;600;700&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Assistant', sans-serif;
            background-color: #f4f7f9;
            color: #333;
            margin: 0;
            padding: 20px;
            line-height: 1.8;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.05);
        }
        h1, h2 {
            color: #2c3e50;
            font-weight: 600;
        }
        h1 {
            font-size: 2.5rem;
            text-align: center;
            border-bottom: 2px solid #3498db;
            padding-bottom: 15px;
            margin-bottom: 30px;
        }
        h2 {
            font-size: 1.8rem;
            margin-top: 40px;
            border-bottom: 1px solid #e0e0e0;
            padding-bottom: 10px;
        }
        p, li {
            font-size: 1.1rem;
            color: #555;
        }
        ul {
            padding-right: 20px;
        }
        a {
            color: #3498db;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
        }
    </style>
    </head>
    <body>
        <div class="container">
            <h1>מדיניות פרטיות</h1>
            <p>עודכן לאחרונה: 19 ליולי, 2025</p>

            <p>תודה על השימוש בשירות תמלול הוידאו שלנו. מדיניות פרטיות זו מסבירה כיצד אנו אוספים, משתמשים, חושפים ושומרים על המידע שלך בעת השימוש בשירות.</p>
            
            <p>אנא קרא מדיניות זו בעיון. בעצם השימוש בשירות, אתה מסכים לאיסוף ושימוש במידע בהתאם למדיניות זו.</p>

            <h2>איזה מידע אנו אוספים</h2>
            
            <h3>מידע אישי</h3>
            <ul>
                <li><strong>פרטי חשבון:</strong> בעת התחברות עם גוגל, אנו מקבלים את כתובת המייל והשם שלך כדי ליצור ולנהל את חשבונך.</li>
                <li><strong>נתוני אימות:</strong> אנו משתמשים באימות של גוגל כדי לוודא את זהותך. איננו שומרים את סיסמת גוגל שלך.</li>
            </ul>

            <h3>מידע שימוש</h3>
            <ul>
                <li><strong>שימוש בשירות:</strong> אנו אוספים מידע על אופן השימוש שלך בשירות, כולל אילו תכונות נמצאות בשימוש והעדפות התמלול שלך.</li>
                <li><strong>נתוני וידאו:</strong> אנו אוספים מידע על סרטוני הוידאו שאתה מתמלל באמצעות השירות שלנו.</li>
            </ul>

            <h2>כיצד אנו משתמשים במידע שלך</h2>
            <p>אנו משתמשים במידע שאנו אוספים כדי:</p>
            <ul>
                <li>לספק, לתחזק ולשפר את השירות</li>
                <li>ליצור ולנהל את חשבון המשתמש שלך</li>
                <li>לשמור את קבצי התמלול וההעדפות שלך</li>
                <li>לעבד ולספק את בקשות התמלול שלך</li>
                <li>להגיב לפניות ובקשות תמיכה</li>
                <li>לנטר ולנתח דפוסי שימוש ומגמות</li>
            </ul>

            <h2>אחסון נתונים</h2>
            <p>אנו משתמשים ב-Supabase, שירות מסד נתונים מאובטח, לאחסון פרטי החשבון והעדפות התמלול שלך. הנתונים שלך מאוחסנים באופן מאובטח ומוגנים באמצעי אבטחה סטנדרטיים בתעשייה.</p>

            <h2>שירותי צד שלישי</h2>
            <p>השירות שלנו משתלב עם שירותי צד שלישי הבאים:</p>
            <ul>
                <li><strong>אימות גוגל:</strong> לאימות משתמשים. אנא עיין ב<a href="https://policies.google.com/privacy" target="_blank">מדיניות הפרטיות של גוגל</a> למידע על אופן הטיפול שלהם בנתונים שלך.</li>
                <li><strong>Supabase:</strong> לאחסון נתונים. אנא עיין ב<a href="https://supabase.io/privacy" target="_blank">מדיניות הפרטיות של Supabase</a> למידע על אופן הטיפול שלהם בנתונים שלך.</li>
            </ul>

            <h2>שיתוף נתונים</h2>
            <p>איננו מוכרים, סוחרים או מעבירים בדרך אחרת את המידע האישי שלך לגורמים חיצוניים, למעט כפי שמתואר במדיניות פרטיות זו. אנו עשויים לשתף את המידע שלך עם ספקי שירות המסייעים לנו בתפעול השירות, כל עוד אותם צדדים מסכימים לשמור על סודיות המידע.</p>

            <h2>אבטחה</h2>
            <p>אנו מיישמים מגוון אמצעי אבטחה כדי לשמור על בטיחות המידע האישי שלך. עם זאת, שום שיטת שידור דרך האינטרנט או אחסון אלקטרוני אינה מאובטחת ב-100%, ואיננו יכולים להבטיח את אבטחתה המוחלטת.</p>

            <h2>הזכויות שלך</h2>
            <p>יש לך את הזכות:</p>
            <ul>
                <li>לגשת למידע האישי שיש לנו עליך</li>
                <li>לתקן אי דיוקים במידע האישי שלך</li>
                <li>למחוק את המידע האישי שלך</li>
                <li>להתנגד לעיבוד המידע האישי שלך</li>
            </ul>

            <h2>שינויים במדיניות פרטיות זו</h2>
            <p>אנו עשויים לעדכן את מדיניות הפרטיות שלנו מעת לעת. אנו נודיע לך על כל שינוי על ידי פרסום מדיניות הפרטיות החדשה בעמוד זה ועדכון תאריך "עודכן לאחרונה".</p>

            <h2>צור קשר</h2>
            <p>אם יש לך שאלות כלשהן לגבי מדיניות פרטיות זו, אנא צור איתנו קשר בכתובת: support@video-transcript.com</p>

            <div class="footer">
                <p><a href="/">חזרה לעמוד הבית</a></p>
            </div>
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
    
    // טיפול ב-baseUrl ו-params אם קיימים
    let fetchUrl = url;
    if (options.baseUrl) {
        fetchUrl = options.baseUrl + (url.startsWith('/') ? url : '/' + url);
        delete options.baseUrl;
    }
    
    if (options.params) {
        const urlObj = new URL(fetchUrl);
        for (const [key, value] of Object.entries(options.params)) {
            urlObj.searchParams.append(key, value);
        }
        fetchUrl = urlObj.toString();
        delete options.params;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`ניסיון ${attempt}/${maxRetries} עבור כתובת: ${fetchUrl.substring(0, 100)}...`);
            const response = await fetch(fetchUrl, options);

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
 * Convert various duration string formats (e.g. "1:23:45", "12:34", "90", "90s") to seconds (int)
 */
function parseDurationToSeconds(raw) {
    if (!raw) return 0;
    if (typeof raw === 'number') {
        return Math.floor(raw);
    }
    if (typeof raw === 'string') {
        // Remove trailing 's'
        raw = raw.trim();
        if (/^\d+\s*s$/.test(raw)) {
            raw = raw.replace(/s$/, '');
        }
        // HH:MM:SS or MM:SS
        if (raw.includes(':')) {
            const parts = raw.split(':').map(p => parseInt(p, 10));
            if (parts.some(isNaN)) return 0;
            if (parts.length === 3) {
                return parts[0] * 3600 + parts[1] * 60 + parts[2];
            } else if (parts.length === 2) {
                return parts[0] * 60 + parts[1];
            }
        }
        // plain integer string seconds
        const n = parseInt(raw, 10);
        if (!isNaN(n)) return n;
    }
    return 0;
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
    console.log(`[${requestId}] פרמטרים: url=${videoUrl}, id=${videoId}, format=${format}`);
    
    // Handle user_id, ensure it's a valid UUID or set to null
    let userId = req.query.user_id;
    if (!userId || userId === 'undefined' || userId === 'null') {
        userId = null;
        console.log(`[${requestId}] No user_id provided, will be recorded as null`);
    } else {
        console.log(`[${requestId}] Processing request for user_id: ${userId}`);
    }
    
    // טיפול בכתובת או מזהה וידאו
    let actualVideoId = videoId;
    let isYouTube = false;
    let actualVideoUrl = videoUrl;
    
    if (videoUrl) {
        // בדיקה האם מדובר בסרטון יוטיוב
        isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
        
        if (isYouTube && !videoId) {
            // חילוץ מזהה וידאו מכתובת יוטיוב אם סופקה
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
    }
    
    if (!actualVideoId && !actualVideoUrl) {
        return res.status(400).json({
            success: false,
            error: 'חסר פרמטר חובה: id או url (מזהה סרטון או כתובת)',
            example: '/transcribe?id=YOUTUBE_VIDEO_ID או /transcribe?url=VIDEO_URL'
        });
    }
    
    console.log(`[${requestId}] מזהה סרטון: ${actualVideoId || 'לא ידוע'}, כתובת: ${actualVideoUrl || 'לא ידוע'}, פורמט: ${format}`);

    try {
        // שלב 1: הורדת וידאו
        console.log(`[${requestId}] שלב 1: מוריד וידאו במדיה ${isYouTube ? 'יוטיוב' : 'כללי'}`);

        let tempFileName = path.join(TEMP_DIR, `${actualVideoId || Date.now()}_${Date.now()}.mp4`);
        let apiMetadata = { title: `Video ${actualVideoId || Date.now()}`, duration: 0 };
        let videoDownloadUrl = '';

        if (isYouTube) {
            // Use RapidAPI for YouTube
            const apiUrl = `https://${RAPIDAPI_HOST}/download-mp3/${actualVideoId}?quality=low`;
            const apiMetadataResponse = await fetchWithRetries(apiUrl, {
                method: 'GET',
                headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST }
            });
            if (!apiMetadataResponse.ok) throw new Error(`RapidAPI failed: ${apiMetadataResponse.status}`);
            
            const metadata = await apiMetadataResponse.json();
            videoDownloadUrl = metadata?.url;
            if (!videoDownloadUrl) throw new Error('RapidAPI did not return a valid download URL');
            
            apiMetadata.title = metadata.title || apiMetadata.title;
            apiMetadata.duration = parseDurationToSeconds(metadata.duration) || apiMetadata.duration;

        } else {
            // Use ZMIO API for other platforms
            const apiUrl = 'https://api.zm.io.vn/v1/social/autolink';
            const apiResponse = await fetchWithRetries(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': ZMIO_API_KEY },
                body: JSON.stringify({ url: actualVideoUrl })
            });
            if (!apiResponse.ok) throw new Error(`ZMIO API failed: ${apiResponse.status}`);

            const zmRawData = await apiResponse.json();
            if (!zmRawData || !zmRawData.medias || zmRawData.medias.length === 0) throw new Error('Invalid data from ZMIO API');
            
            videoDownloadUrl = zmRawData.medias[0].url;
            apiMetadata.title = zmRawData.title || apiMetadata.title;
            apiMetadata.duration = parseDurationToSeconds(zmRawData.duration) || apiMetadata.duration;
        }

        if (videoDownloadUrl) {
            // שלב 1.2: הורדת הוידאו לאחסון בשרת
            console.log(`[${requestId}] מוריד את תוכן הוידאו...`);
        const videoResponse = await fetchWithRetries(videoDownloadUrl, {
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

        } // end if (videoDownloadUrl)
        const formData = new FormData();
        formData.append('file', fs.createReadStream(tempFileName));
        formData.append('model_id', 'scribe_v1');
        formData.append('timestamps_granularity', 'word');
        formData.append('language', ''); // זיהוי שפה אוטומטי
        formData.append('tag_audio_events', 'false');

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
        console.log(`[${requestId}] אורך תמלול (מספר מילים): ${data.words && Array.isArray(data.words) ? data.words.length : 'N/A'}`);
        
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
            // החזר את הזמן שנשלח ב־query (defaults to 0)
            let usageSeconds = parseFloat(req.query.duration_seconds);
            if (isNaN(usageSeconds) || usageSeconds === 0) {
                // נסה מהתמלול עצמו
                if (data && data.words && Array.isArray(data.words) && data.words.length > 0) {
                    usageSeconds = parseFloat(data.words[data.words.length - 1].end) || 0;
                }
            }
            if (!usageSeconds && apiMetadata.duration) {
                usageSeconds = parseFloat(apiMetadata.duration) || 0;
            }
            const fileNameUsage = actualVideoId || actualVideoUrl;
            const billedSeconds = Math.ceil(usageSeconds / 15) * 15;

            // החזרת נתוני JSON גולמיים כולל שדה usage
            const jsonResponse = {
                success: true,
                data: {
                    url: actualVideoUrl,
                    id: actualVideoId,
                    title: apiMetadata.title,
                    transcript: data,
                    language: data.language || 'unknown'
                },
                usage: {
                    duration_seconds: usageSeconds,
                    file_name: fileNameUsage
                }
            };
            
            // הגדרת כותרות להורדה אוטומטית - התאמה לתקן RFC 5987
            const safeFileName = apiMetadata.title
                .replace(/[^\w\s.-]/g, '_') // מחליף תווים לא-חוקיים ב-underscore
                .replace(/\s+/g, '_')       // מחליף רווחים ב-underscore
                .substring(0, 100)          // מגביל אורך שם קובץ
                || 'transcript';
                
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="transcript.json"; filename*=UTF-8''${encodeURIComponent(safeFileName + '.json')}`);
            
            // record usage server-side to Supabase
            try {
                console.log(`[${requestId}] Prisma: attempting to record usage for user ${userId || 'anonymous'}, duration=${usageSeconds}s`);
                const record = await prisma.transcribeEvent.create({
                    data: {
                        userId: userId,
                        videoId: fileNameUsage,
                        provider: 'youtube',
                        videoDuration: Math.round(usageSeconds),
                        audioSeconds: Math.round(usageSeconds),
                        billedSeconds: billedSeconds,
                        success: true,
                    },
                });
                console.log(`[${requestId}] Prisma: successfully recorded usage for user ${userId || 'anonymous'}, record:`, record);
            } catch (err) {
                console.error(`[${requestId}] Prisma error recording usage:`, err);
            }

            return res.json(jsonResponse);
        } else if (format === 'srt') {
            // המרה לפורמט SRT
            let srtContent = "";
            let counter = 1;

            if (data.words && Array.isArray(data.words)) {
                // קיבוץ מילים לקבוצות
                const chunks = [];
                let currentChunk = [];
                let wordCount = 0;
                let reachedMinWords = false;

                for (let i = 0; i < data.words.length; i++) {
                    const word = data.words[i];
                    currentChunk.push(word);
                    wordCount++;

                    // בדיקה אם הגענו למינימום 5 מילים
                    if (wordCount >= 5) {
                        reachedMinWords = true;
                    }

                    // בדיקה אם המילה מסתיימת בסימן פיסוק (. ? ! ,) וכבר הגענו למינימום מילים
                    const hasPunctuation = word.text.match(/[.!?,]$/) || 
                                          // סימני פיסוק בשפות אסיאתיות (סינית, יפנית, קוריאנית)
                                          word.text.match(/[。！？、．]$/) ||
                                          // סימני פיסוק מלאי רוחב באסיאתית
                                          word.text.match(/[\uFF01\uFF0C\uFF0E\uFF1F\uFF1B\uFF1A]$/);
                    
                    if (reachedMinWords && hasPunctuation) {
                        chunks.push([...currentChunk]);
                        currentChunk = [];
                        wordCount = 0;
                        reachedMinWords = false;
                    }
                }

                // טיפול במילים שנשארו בסוף
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
                            // תיקון פיסוק באנגלית
                            .replace(/ ([.,!?:;])/g, '$1')
                            // תיקון פיסוק באסיאתית
                            .replace(/ ([。！？、．\uFF01\uFF0C\uFF0E\uFF1F\uFF1B\uFF1A])/g, '$1');

                        srtContent += `${counter}\n`;
                        srtContent += `${startSrt} --> ${endSrt}\n`;
                        srtContent += `${text}\n\n`;

                        counter++;
                    }
                }
            }

            // הגדרת כותרות להורדה אוטומטית - התאמה לתקן RFC 5987
            const safeFileName = apiMetadata.title
                .replace(/[^\w\s.-]/g, '_') // מחליף תווים לא-חוקיים ב-underscore
                .replace(/\s+/g, '_')       // מחליף רווחים ב-underscore
                .substring(0, 100)          // מגביל אורך שם קובץ
                || 'transcript';
                
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="transcript.srt"; filename*=UTF-8''${encodeURIComponent(safeFileName + '.srt')}`);
            
            // after assembling SRT, record usage
            let durationSeconds = parseFloat(req.query.duration_seconds);
            if (isNaN(durationSeconds) || durationSeconds === 0) {
                if (data && data.words && Array.isArray(data.words) && data.words.length > 0) {
                    durationSeconds = parseFloat(data.words[data.words.length - 1].end) || 0;
                }
            }
            if (!durationSeconds && apiMetadata.duration) {
                durationSeconds = parseFloat(apiMetadata.duration) || 0;
            }
            const billedSeconds = Math.ceil(durationSeconds / 15) * 15;
            
            try {
                console.log(`[${requestId}] Prisma: attempting to record SRT usage for user ${userId || 'anonymous'}, duration=${durationSeconds}s`);
                const record = await prisma.transcribeEvent.create({
                    data: {
                        userId: userId,
                        videoId: actualVideoId || actualVideoUrl,
                        provider: 'zmio',
                        videoDuration: Math.round(durationSeconds),
                        audioSeconds: Math.round(durationSeconds),
                        billedSeconds: billedSeconds,
                        success: true,
                    },
                });
                console.log(`[${requestId}] Prisma: successfully recorded SRT usage for user ${userId || 'anonymous'}, record:`, record);
            } catch (err) {
                console.error(`[${requestId}] Prisma error recording SRT usage:`, err);
            }
            
            return res.send(srtContent);
        } else if (format === 'txt') {
            // המרה לפורמט טקסט פשוט
            let plainText = "";

            if (data.text) {
                plainText = data.text;
            } else if (data.words && Array.isArray(data.words)) {
                plainText = data.words.map(w => w.text).join(' ')
                    // תיקון פיסוק באנגלית
                    .replace(/ ([.,!?:;])/g, '$1')
                    // תיקון פיסוק באסיאתית
                    .replace(/ ([。！？、．\uFF01\uFF0C\uFF0E\uFF1F\uFF1B\uFF1A])/g, '$1');
            }

            // הגדרת כותרות להורדה אוטומטית - התאמה לתקן RFC 5987
            const safeFileName = apiMetadata.title
                .replace(/[^\w\s.-]/g, '_') // מחליף תווים לא-חוקיים ב-underscore
                .replace(/\s+/g, '_')       // מחליף רווחים ב-underscore
                .substring(0, 100)          // מגביל אורך שם קובץ
                || 'transcript';
                
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="transcript.txt"; filename*=UTF-8''${encodeURIComponent(safeFileName + '.txt')}`);
            
            // after assembling TXT, record usage
            const durationSeconds = parseFloat(req.query.duration_seconds) || (parseFloat(apiMetadata.duration) || 0);
            const billedSeconds = Math.ceil(durationSeconds / 15) * 15;
            
            try {
                console.log(`[${requestId}] Prisma: attempting to record TXT usage for user ${userId || 'anonymous'}, duration=${durationSeconds}s`);
                const record = await prisma.transcribeEvent.create({
                    data: {
                        userId: userId,
                        videoId: actualVideoId || actualVideoUrl,
                        provider: 'zmio',
                        videoDuration: Math.round(durationSeconds),
                        audioSeconds: Math.round(durationSeconds),
                        billedSeconds: billedSeconds,
                        success: true,
                    },
                });
                console.log(`[${requestId}] Prisma: successfully recorded TXT usage for user ${userId || 'anonymous'}, record:`, record);
            } catch (err) {
                console.error(`[${requestId}] Prisma error recording TXT usage:`, err);
            }
            
            return res.send(plainText);
        } else {
            throw new Error(`פורמט לא נתמך: ${format}. השתמש ב-json, srt, או txt.`);
        }

    } catch (error) {
        // record failure usage event to Supabase
        try {
            const failureDuration = parseFloat(req.query.duration_seconds) || 0;
            const failureBilled = Math.ceil(failureDuration / 15) * 15;
            console.log(`[${requestId}] Supabase: attempting to insert FAILED usage record for user ${userId || 'anonymous'}, duration=${failureDuration}s`);
            const { data, error } = await supabaseServer.from('transcribe_events').insert({
                user_id: userId,
                video_id: actualVideoId || null,
                audio_seconds: Math.round(failureDuration),
                billed_seconds: failureBilled,
                success: false
            });
            
            if (error) {
                console.error(`[${requestId}] Supabase: failed to record failure usage:`, error);
            } else {
                console.log(`[${requestId}] Supabase: successfully recorded failure usage for user ${userId || 'anonymous'}, data:`, data);
            }
        } catch (usageErr) {
            console.error(`[${requestId}] Supabase: failed to record failure usage:`, usageErr);
        }
        console.error(`[${requestId}] שגיאת תמלול:`, error);

        return res.status(500).json({
            success: false,
            error: `שגיאה בתמלול: ${error.message}`,
            requestId: requestId
        });
    }
});

app.get('/transcribe-youtube', (req, res) => {
    res.send(getTranscribeFormHTML('youtube'));
});

app.get('/transcribe-other', (req, res) => {
    res.send(getTranscribeFormHTML('other'));
});

function getTranscribeFormHTML(platform) {
    const title = platform === 'youtube' ? 'תמלול מיוטיוב' : 'תמלול מפלטפורמות אחרות';
    const actionUrl = `/transcribe`;

    return `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;600;700&display=swap" rel="stylesheet">
            <style>
                body {
                    font-family: 'Assistant', sans-serif;
                    background-color: #f4f7f9;
                    color: #333;
                    margin: 0;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    min-height: 100vh;
                }
                .container {
                    max-width: 700px;
                    width: 100%;
                    background-color: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.05);
                    padding: 40px;
                    margin-top: 20px;
                }
                h1 {
                    text-align: center;
                    font-size: 2.5rem;
                    font-weight: 700;
                    margin-top: 0;
                    margin-bottom: 30px;
                    color: #2c3e50;
                }
                .form-group {
                    margin-bottom: 25px;
                }
                label {
                    display: block;
                    margin-bottom: 10px;
                    font-weight: 600;
                    font-size: 1.1rem;
                }
                input[type="text"], select {
                    width: 100%;
                    padding: 15px;
                    border: 1px solid #ddd;
                    border-radius: 5px;
                    font-size: 1rem;
                    box-sizing: border-box;
                }
                .cta-button {
                    width: 100%;
                    background-color: #3498db;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    padding: 15px;
                    font-size: 1.2rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background-color 0.3s;
                }
                .cta-button:hover {
                    background-color: #2980b9;
                }
                .status {
                    margin-top: 25px;
                    padding: 15px;
                    border-radius: 8px;
                    text-align: center;
                    font-weight: 600;
                    display: none;
                }
                .loading {
                    color: #3498db;
                }
                .error {
                    background-color: #e74c3c20;
                    border: 1px solid #e74c3c;
                    color: #e74c3c;
                }
                .success {
                    background-color: #2ecc7120;
                    border: 1px solid #2ecc71;
                    color: #2ecc71;
                }
                footer {
                    text-align: center;
                    padding: 20px;
                    margin-top: auto;
                    color: #7f8c8d;
                }
                footer a {
                    color: #3498db;
                    text-decoration: none;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>${title}</h1>
                <form id="transcribeForm" action="${actionUrl}" method="get" target="_blank">
                    <div class="form-group">
                        <label for="videoUrl">הדבק כתובת וידאו:</label>
                        <input type="text" id="videoUrl" name="url" placeholder="https://..." dir="ltr" required>
                    </div>
                    <div class="form-group">
                        <label for="format">בחר פורמט תמלול:</label>
                        <select id="format" name="format">
                            <option value="srt">SRT (כתוביות)</option>
                            <option value="txt">טקסט בלבד</option>
                            <option value="json">JSON (למפתחים)</option>
                        </select>
                    </div>
                    <button type="submit" class="cta-button">תמלל וידאו</button>
                </form>
            </div>
            <footer>
                <p><a href="/">חזרה לעמוד הבית</a></p>
            </footer>
        </body>
        </html>
    `;
}

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
            <title>שירות תמלול וידאו</title>
            <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;600;700&display=swap" rel="stylesheet">
            <style>
                body {
                    font-family: 'Assistant', sans-serif;
                    background-color: #f4f7f9;
                    color: #333;
                    margin: 0;
                    padding: 0;
                    line-height: 1.7;
                }
                .container {
                    max-width: 960px;
                    margin: 0 auto;
                    padding: 40px 20px;
                }
                .header {
                    text-align: center;
                    padding: 40px 0;
                }
                .header h1 {
                    font-size: 3rem;
                    font-weight: 700;
                    margin: 0;
                    color: #2c3e50;
                }
                .header p {
                    font-size: 1.2rem;
                    color: #7f8c8d;
                    margin-top: 10px;
                }
                .cta-button {
                    display: inline-block;
                    background-color: #3498db;
                    color: white;
                    text-decoration: none;
                    padding: 15px 35px;
                    border-radius: 5px;
                    font-weight: 600;
                    font-size: 1.1rem;
                    transition: background-color 0.3s;
                }
                .cta-button:hover {
                    background-color: #2980b9;
                }
                .section {
                    background-color: #ffffff;
                    border-radius: 8px;
                    padding: 30px;
                    margin-bottom: 30px;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
                }
                .section h2 {
                    font-size: 2rem;
                    font-weight: 600;
                    color: #2c3e50;
                    margin-top: 0;
                    border-bottom: 2px solid #3498db;
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }
                .platform-buttons {
                    display: flex;
                    gap: 20px;
                    justify-content: center;
                    margin: 20px 0;
                }
                footer {
                    text-align: center;
                    padding: 40px 20px;
                    margin-top: 20px;
                    border-top: 1px solid #e0e0e0;
                    color: #7f8c8d;
                }
                footer a {
                    color: #3498db;
                    text-decoration: none;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>שירות תמלול וידאו</h1>
                <p>הופכים כל סרטון לטקסט, במהירות ובדיוק</p>
            </div>
            
            <div class="container">
                <div class="section">
                    <h2>בחר פלטפורמה לתמלול</h2>
                    <div class="platform-buttons">
                        <a href="/transcribe-youtube" class="cta-button">תמלול מיוטיוב</a>
                        <a href="/transcribe-other" class="cta-button">תמלול מפלטפורמות אחרות</a>
                    </div>
                </div>
            </div>
            
            <footer>
                <p>© 2024 שירות תמלול וידאו | <a href="/privacy-policy">מדיניות פרטיות</a> | כל הזכויות שמורות</p>
            </footer>
        </body>
        </html>
    `);
});

/**
 * נקודת קצה להורדת וידאו מפלטפורמות שונות
 */
app.get('/download', async (req, res) => {
    const videoUrl = req.query.url;
    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

    if (!videoUrl) {
        return res.status(400).json({
            success: false,
            error: 'חסר פרמטר חובה: url (כתובת הוידאו)',
            example: '/download?url=VIDEO_URL'
        });
    }

    console.log(`[${requestId}] ========== מתחיל תהליך הורדת וידאו ==========`);
    console.log(`[${requestId}] כתובת: ${videoUrl}`);
    
    try {
        // בדיקה האם מדובר בסרטון יוטיוב
        const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
        let videoData;
        
        if (isYouTube) {
            // שימוש ב-RapidAPI החדש להורדת mp3 מיוטיוב
            console.log(`[${requestId}] זוהה סרטון יוטיוב, משתמש ב-youtube-mp3-audio-video-downloader.p.rapidapi.com`);
            // חילוץ מזהה הוידאו
            let videoId;
            try {
                const urlObj = new URL(videoUrl);
                if (urlObj.hostname.includes('youtube.com')) {
                    videoId = urlObj.searchParams.get('v');
                } else if (urlObj.hostname.includes('youtu.be')) {
                    videoId = urlObj.pathname.substring(1);
                }
            } catch (error) {
                console.error(`[${requestId}] שגיאה בפירוק כתובת YouTube:`, error);
                throw new Error('שגיאה בפירוק כתובת YouTube');
            }

            if (!videoId) {
                throw new Error('לא ניתן לחלץ מזהה וידאו מהכתובת');
            }

            const apiUrl = `https://youtube-mp3-audio-video-downloader.p.rapidapi.com/download-mp3/${videoId}?quality=low`;
            console.log(`[${requestId}] קורא ל-RapidAPI לקבלת קובץ mp3: ${apiUrl}`);
            const apiResponse = await fetchWithRetries(apiUrl, {
                method: 'GET',
                headers: {
                    'x-rapidapi-key': RAPIDAPI_KEY,
                    'x-rapidapi-host': 'youtube-mp3-audio-video-downloader.p.rapidapi.com'
                }
            });

            if (!apiResponse.ok) {
                throw new Error(`נכשל לקבל קובץ mp3 מ-RapidAPI: ${apiResponse.status}`);
            }

            // שמירת קובץ mp3 זמני
            const tempMp3Name = path.join(TEMP_DIR, `${videoId}_${Date.now()}.mp3`);
            await new Promise((resolve, reject) => {
                const fileStream = fs.createWriteStream(tempMp3Name);
                apiResponse.body.pipe(fileStream);
                apiResponse.body.on('error', (err) => {
                    fileStream.close();
                    reject(new Error(`שגיאה בהורדת mp3: ${err.message}`));
                });
                fileStream.on('finish', () => {
                    const stats = fs.statSync(tempMp3Name);
                    console.log(`[${requestId}] הורדת mp3 הושלמה. גודל: ${formatFileSize(stats.size)}`);
                    if (stats.size === 0) {
                        reject(new Error('קובץ ה-mp3 שהורד ריק.'));
                    } else {
                        resolve();
                    }
                });
                fileStream.on('error', (err) => {
                    reject(new Error(`שגיאה בשמירת mp3: ${err.message}`));
                });
            });

            // החזרת קישור להורדה
            videoData = {
                url: videoUrl,
                source: 'youtube',
                author: '',
                title: `YouTube MP3 ${videoId}`,
                thumbnail: '',
                duration: '',
                medias: [{
                    url: `/media/${path.basename(tempMp3Name)}`,
                    quality: 'low',
                    extension: 'mp3',
                    type: 'audio'
                }]
            };

        } else {
            // שימוש בספק API החדש לשאר הפלטפורמות
            console.log(`[${requestId}] משתמש ב-ZMIO API עבור הורדת תוכן מ: ${videoUrl}`);
            
            const apiUrl = 'https://api.zm.io.vn/v1/social/autolink';
            
            console.log(`[${requestId}] שולח בקשה ל-API`);
            const apiResponse = await fetchWithRetries(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': ZMIO_API_KEY
                },
                body: JSON.stringify({ url: videoUrl })
            });

            if (!apiResponse.ok) {
                throw new Error(`נכשל לקבל מידע מ-ZMIO API: ${apiResponse.status}`);
            }

            // קבלת נתוני הוידאו
            const zmRawData = await apiResponse.json();
            
            // בדיקה שהתקבלו נתוני וידאו תקינים
            if (!zmRawData || !zmRawData.medias || zmRawData.medias.length === 0) {
                throw new Error('לא התקבלו נתונים תקינים מה-API');
            }
            
            // מיפוי למבנה אחיד כמו סנכרון עם RapidAPI branch
            videoData = {
                url: videoUrl,
                source: 'zmio',
                author: zmRawData.author || '',
                title: zmRawData.title || `Video ${videoUrl}`,
                thumbnail: zmRawData.thumbnail || '',
                duration: parseDurationToSeconds(zmRawData.duration) || '',
                medias: zmRawData.medias.map(media => ({
                    url: media.url,
                    quality: media.quality || '',
                    extension: media.extension || (media.url.split('.').pop() || ''),
                    type: media.type || 'video'
                }))
            };
        }
        
        console.log(`[${requestId}] התקבל מידע להורדה: ${videoData.title}`);
        
        // החזרת התוצאות ללקוח
        return res.json({
            success: true,
            data: videoData
        });
        
    } catch (error) {
        console.error(`[${requestId}] שגיאה בהורדת הוידאו:`, error);
        return res.status(500).json({
            success: false,
            error: `שגיאה בהורדת הוידאו: ${error.message}`
        });
    }
});

/**
 * טופס ההורדה
 */
app.get('/download-test', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'download-test.html'));
});

 // הפעלת השרת
 app.listen(PORT, () => {
    console.log(`השרת פועל על פורט ${PORT}`);
    console.log(`שירות תמלול יוטיוב זמין בכתובות:`);
    console.log(`- ממשק משתמש: http://localhost:${PORT}/`);
    console.log(`- טופס תמלול: http://localhost:${PORT}/transcribe-form`);
    console.log(`- API: http://localhost:${PORT}/transcribe?url=YOUTUBE_URL&format=srt|txt|json`);
});


