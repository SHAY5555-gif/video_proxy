/**
 * מנהל סיבוב פרוקסי
 * מאפשר להחליף בין כתובות IP שונות כדי להימנע מחסימות
 */

// רשימת שרתי פרוקסי ציבוריים לדוגמה
// בפרויקט אמיתי, יש להחליף אותם בשרתי פרוקסי אמינים או בשירות פרוקסי מסחרי
const publicProxies = [
    // הערה: אלו דוגמאות בלבד ולא בהכרח עובדות
    // יש להחליף אותן בשרתי פרוקסי אמיתיים שיש לך גישה אליהם
    { host: 'proxy1.example.com', port: 8080 },
    { host: 'proxy2.example.com', port: 8080 },
    { host: 'proxy3.example.com', port: 8080 }
];

// מעקב אחר הפרוקסי הנוכחי
let currentProxyIndex = 0;
let proxyEnabled = false; // כברירת מחדל, הפרוקסי מושבת

/**
 * מחזיר את הפרוקסי הבא ברשימה
 * @returns {Object|null} אובייקט פרוקסי או null אם הפרוקסי מושבת
 */
function getNextProxy() {
    if (!proxyEnabled || publicProxies.length === 0) {
        return null;
    }
    
    const proxy = publicProxies[currentProxyIndex];
    currentProxyIndex = (currentProxyIndex + 1) % publicProxies.length;
    return proxy;
}

/**
 * מפעיל או משבית את השימוש בפרוקסי
 * @param {boolean} enabled האם להפעיל את הפרוקסי
 */
function setProxyEnabled(enabled) {
    proxyEnabled = enabled;
    console.log(`Proxy rotation ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * מוסיף פרוקסי חדש לרשימה
 * @param {string} host שם השרת
 * @param {number} port פורט
 * @param {string} username שם משתמש (אופציונלי)
 * @param {string} password סיסמה (אופציונלי)
 */
function addProxy(host, port, username = null, password = null) {
    const proxy = { host, port };
    
    if (username && password) {
        proxy.auth = `${username}:${password}`;
    }
    
    publicProxies.push(proxy);
    console.log(`Added new proxy: ${host}:${port}`);
}

/**
 * מנקה את רשימת הפרוקסי
 */
function clearProxies() {
    publicProxies.length = 0;
    currentProxyIndex = 0;
    console.log('Cleared all proxies');
}

/**
 * מחזיר את רשימת הפרוקסי הנוכחית (ללא פרטי אימות רגישים)
 * @returns {Array} רשימת הפרוקסי
 */
function getProxyList() {
    return publicProxies.map(proxy => {
        const { host, port } = proxy;
        return { host, port, hasAuth: !!proxy.auth };
    });
}

/**
 * יוצר אובייקט agent לשימוש עם node-fetch
 * @returns {Object|null} אובייקט agent או null אם הפרוקסי מושבת
 */
function createProxyAgent() {
    const proxy = getNextProxy();
    
    if (!proxy) {
        return null;
    }
    
    try {
        // בדיקה אם ה-HttpsProxyAgent זמין
        // אם לא, נחזיר null ונרשום הודעה בלוג
        try {
            const { HttpsProxyAgent } = require('https-proxy-agent');
            
            const proxyUrl = proxy.auth 
                ? `http://${proxy.auth}@${proxy.host}:${proxy.port}`
                : `http://${proxy.host}:${proxy.port}`;
                
            return new HttpsProxyAgent(proxyUrl);
        } catch (err) {
            console.warn('https-proxy-agent module not available. Install it with: npm install https-proxy-agent');
            return null;
        }
    } catch (err) {
        console.error('Error creating proxy agent:', err);
        return null;
    }
}

module.exports = {
    getNextProxy,
    setProxyEnabled,
    addProxy,
    clearProxies,
    getProxyList,
    createProxyAgent
};
