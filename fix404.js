/**
 * סקריפט לתיקון אוטומטי של בעיית מיקום מטפל ה-404 בקובץ server.js
 * 
 * הסקריפט הזה:
 * 1. יוצר גיבוי של הקובץ המקורי
 * 2. מוחק את מטפל ה-404 הנוכחי
 * 3. מוסיף מטפל 404 חדש בסוף הקובץ
 * 
 * לשימוש:
 * node fix404.js
 */

const fs = require('fs');
const path = require('path');

// הקובץ שצריך לתקן
const SERVER_FILE = path.join(__dirname, 'server.js');
// קובץ גיבוי
const BACKUP_FILE = path.join(__dirname, 'server.js.backup');

// הרץ את הפעולות
fixServer404Handler();

async function fixServer404Handler() {
    try {
        console.log('מתחיל תיקון מיקום מטפל ה-404...');
        
        // קרא את תוכן הקובץ המקורי
        const originalContent = fs.readFileSync(SERVER_FILE, 'utf8');
        
        // צור גיבוי
        console.log(`יוצר גיבוי בקובץ ${BACKUP_FILE}`);
        fs.writeFileSync(BACKUP_FILE, originalContent);
        
        // מצא את מטפל ה-404 הנוכחי
        const pattern404Handler = /\/\/ Custom 404 handler\s+app\.use\(\(req, res\) => \{[\s\S]+?}\);/;
        const match = originalContent.match(pattern404Handler);
        
        if (!match) {
            console.error('לא נמצא מטפל 404 בקובץ המקורי. יכול להיות שהוא כבר הוסר או שיש שינוי בפורמט.');
            console.log('בבקשה בדוק את הקובץ ידנית.');
            return;
        }
        
        console.log('נמצא מטפל 404 בקובץ. מסיר אותו ומוסיף בסוף הקובץ...');
        
        // הסר את מטפל ה-404 הנוכחי
        let newContent = originalContent.replace(pattern404Handler, '// מטפל ה-404 הועבר לסוף הקובץ');
        
        // הוסף מטפל 404 חדש בסוף הקובץ
        newContent += `

// IMPORTANT: 404 handler must be the last middleware to ensure all routes are properly matched
app.use((req, res) => {
    console.log(\`[404] No handler found for \${req.method} \${req.url}\`);
    res.status(404).send(\`
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
                    <p>The requested resource <code>\${req.url}</code> was not found on this server.</p>
                    
                    <div class="available-routes">
                        <h2>Available Routes</h2>
                        <ul>
                            <li><code>GET /</code> - Home page</li>
                            <li><code>GET /proxy?url=URL</code> - Proxy endpoint</li>
                            <li><code>GET /youtube-info?id=VIDEO_ID</code> - Get video formats</li>
                            <li><code>GET /download?id=VIDEO_ID&format=audio|video|combined</code> - Download video</li>
                            <li><code>GET /transcribe?id=VIDEO_ID&format=json|srt|txt</code> - Transcribe video</li>
                            <li><code>GET /health</code> - Health check</li>
                            <li><code>GET /test-proxy?url=URL</code> - Test proxy</li>
                        </ul>
                    </div>
                </div>
            </body>
        </html>
    \`);
});`;
        
        // שמור את הקובץ המתוקן
        fs.writeFileSync(SERVER_FILE, newContent);
        
        console.log('התיקון הושלם בהצלחה!');
        console.log('הפעל מחדש את השרת כדי להחיל את השינויים.');
        console.log('גיבוי של הקובץ המקורי נשמר ב-', BACKUP_FILE);
        
    } catch (error) {
        console.error('אירעה שגיאה בעת תיקון הקובץ:', error);
        console.log('נסה לעקוב אחר ההוראות לתיקון ידני במקום.');
    }
} 