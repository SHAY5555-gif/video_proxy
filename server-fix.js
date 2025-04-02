/**
 * קוד זה מיועד לפתור את בעיית מיקום מטפל ה-404.
 * 
 * העתק את הקטע הבא ישירות לסוף הקובץ server.js, 
 * אחרי השורה האחרונה במקום מטפל ה-404 הקיים.
 * 
 * שלבים:
 * 1. חפש ומחק את הבלוק הנוכחי של מטפל ה-404 (שורות ~1832-1886)
 * 2. העתק את הקוד הבא לסוף הקובץ server.js
 * 3. הפעל מחדש את השרת
 */

// IMPORTANT: 404 handler must be the last middleware to ensure all routes are properly matched
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
    `);
}); 