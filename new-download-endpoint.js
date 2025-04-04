// Download endpoint using the new RapidAPI provider for direct downloads
app.get('/download', async (req, res) => {
    const videoId = req.query.id;
    const requestId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

    if (!videoId) {
        return res.status(400).json({
            success: false,
            error: 'חסר פרמטר חובה: id (מזהה סרטון)',
            example: '/download?id=YOUTUBE_VIDEO_ID'
        });
    }

    console.log(`[${requestId}] Audio download request for video ID: ${videoId}`);

    try {
        // STEP 1: Get audio download link from the new RapidAPI provider
        console.log(`[${requestId}] STEP 1: Getting audio URL from new RapidAPI provider`);

        const rapidApiKey = 'b7855e36bamsh122b17f6deeb803p1aca9bjsnb238415c0d28';
        const rapidApiHost = 'youtube-search-download3.p.rapidapi.com';
        const rapidApiUrl = `https://${rapidApiHost}/v1/download?v=${videoId}&type=mp3`;

        let audioDownloadUrl;
        let videoTitle = `Video ${videoId}`; // Default title

        console.log(`[${requestId}] Calling new RapidAPI provider: ${rapidApiUrl}`);
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

        // Check the structure of the response based on the new API
        if (!rapidApiData || !rapidApiData.url) {
            console.error(`[${requestId}] Unexpected RapidAPI response structure:`, rapidApiData);
            throw new Error('Invalid response structure from RapidAPI or download link missing.');
        }
        
        audioDownloadUrl = rapidApiData.url;
        videoTitle = rapidApiData.title || videoTitle; // Use title from API if available

        console.log(`[${requestId}] Received audio download URL from RapidAPI: ${audioDownloadUrl.substring(0, 100)}...`);
        console.log(`[${requestId}] Title: ${videoTitle}`);

        // STEP 2: Prepare filename and set up for direct download
        let filename = `${videoTitle}.mp3`; // Assume mp3 extension
        filename = filename.replace(/[<>:"\/\\|?*]+/g, '_'); // Clean filename

        // Create a proxy URL for the download
        const proxyDownloadUrl = `/proxy?url=${encodeURIComponent(audioDownloadUrl)}`;

        console.log(`[${requestId}] Setting up direct download via proxy URL: ${proxyDownloadUrl}`);
        console.log(`[${requestId}] Filename: ${filename}`);

        // Set headers for direct file download and redirect to the proxy
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
