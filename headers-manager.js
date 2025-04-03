/**
 * מנהל ה-Headers לבקשות HTTP
 * מספק headers מתקדמים שנראים כמו דפדפן אמיתי
 */

// רשימה של User-Agents נפוצים של דפדפנים
const userAgents = [
    // Chrome on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    
    // Firefox on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    
    // Edge on Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
    
    // Safari on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
    
    // Chrome on macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    
    // Chrome on Android
    'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
    
    // Safari on iOS
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
];

// רשימות של ערכים אפשריים לשדות headers שונים
const acceptLanguages = [
    'en-US,en;q=0.9',
    'en-US,en;q=0.8,he;q=0.5',
    'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
    'en-GB,en;q=0.9,en-US;q=0.8',
    'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
];

const acceptEncodings = [
    'gzip, deflate, br',
    'gzip, deflate',
    'identity' // שימוש ב-identity בלבד לפעמים עוזר עם YouTube
];

// רשימה של Referers אפשריים
const referers = [
    'https://www.youtube.com/',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // סרטון פופולרי
    'https://www.youtube.com/feed/trending',
    'https://www.youtube.com/feed/subscriptions',
    'https://www.google.com/search?q=youtube+videos'
];

// רשימה של מקורות (Origins) אפשריים
const origins = [
    'https://www.youtube.com',
    'https://youtube.com',
    'https://www.google.com'
];

// פונקציה שמחזירה ערך אקראי מתוך מערך
function getRandomValue(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// פונקציה שמחזירה מספר אקראי בטווח
function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * יוצר headers מתקדמים שנראים כמו דפדפן אמיתי
 * @param {Object} options - אפשרויות נוספות
 * @returns {Object} - אובייקט headers
 */
function generateAdvancedHeaders(options = {}) {
    // בחירת User-Agent אקראי או שימוש בזה שסופק
    const userAgent = options.userAgent || getRandomValue(userAgents);
    
    // בדיקה איזה סוג של דפדפן נבחר
    const isMobile = userAgent.includes('Mobile');
    const isChrome = userAgent.includes('Chrome/');
    const isFirefox = userAgent.includes('Firefox/');
    const isSafari = userAgent.includes('Safari/') && !userAgent.includes('Chrome/');
    
    // יצירת אובייקט הבסיס של ה-headers
    const headers = {
        'User-Agent': userAgent,
        'Accept': '*/*',
        'Accept-Language': getRandomValue(acceptLanguages),
        'Accept-Encoding': getRandomValue(acceptEncodings),
        'Connection': Math.random() > 0.5 ? 'keep-alive' : 'close',
        'Referer': options.referer || getRandomValue(referers),
        'Origin': options.origin || getRandomValue(origins),
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache'
    };
    
    // הוספת headers ספציפיים לדפדפן
    if (isChrome) {
        headers['sec-ch-ua'] = `"Google Chrome";v="${getRandomNumber(110, 123)}", "Chromium";v="${getRandomNumber(110, 123)}"`;
        headers['sec-ch-ua-mobile'] = isMobile ? '?1' : '?0';
        headers['sec-ch-ua-platform'] = userAgent.includes('Windows') ? '"Windows"' : 
                                        userAgent.includes('Mac') ? '"macOS"' : 
                                        userAgent.includes('Linux') ? '"Linux"' : 
                                        userAgent.includes('Android') ? '"Android"' : 
                                        userAgent.includes('iPhone') ? '"iOS"' : '"Unknown"';
    }
    
    // הוספת headers ספציפיים לבקשות YouTube
    if (options.isYouTubeRequest) {
        headers['x-youtube-client-name'] = '1';
        headers['x-youtube-client-version'] = `2.${getRandomNumber(20230101, 20240401)}.00.00`;
    }
    
    // הוספת Range header אם סופק
    if (options.rangeHeader) {
        headers['Range'] = options.rangeHeader;
    }
    
    // הוספת Cookie אקראי (לא אמיתי, רק לצורך הסוואה)
    if (Math.random() > 0.3) { // 70% מהזמן נוסיף cookie אקראי
        const randomId = Math.random().toString(36).substring(2, 15);
        headers['Cookie'] = `YSC=${randomId}; VISITOR_INFO1_LIVE=${randomId}; PREF=f4=${getRandomNumber(1000, 9999)}`;
    }
    
    return headers;
}

/**
 * יוצר headers מותאמים לבקשת YouTube
 * @param {Object} baseOptions - אפשרויות הבסיס
 * @returns {Object} - אובייקט headers מותאם
 */
function generateYouTubeHeaders(baseOptions = {}) {
    return generateAdvancedHeaders({
        ...baseOptions,
        isYouTubeRequest: true
    });
}

module.exports = {
    generateAdvancedHeaders,
    generateYouTubeHeaders,
    getRandomValue,
    userAgents,
    referers,
    origins
};
