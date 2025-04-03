/**
 * מנהל סיבוב פרוקסי
 * מאפשר להחליף בין כתובות IP שונות כדי להימנע מחסימות
 */

// רשימת שרתי פרוקסי ציבוריים מוגדרים מראש
// שרתים אלה נבדקו ועבדו נכון לזמן הכתיבה, אך ייתכן שיפסיקו לעבוד בעתיד
const publicProxies = [
    // שרתי פרוקסי ציבוריים שנבדקו ועבדו בזמן הכתיבה
    { host: '103.152.112.162', port: 80 },
    { host: '185.82.139.1', port: 8080 },
    { host: '51.159.115.233', port: 3128 },
    { host: '103.118.46.77', port: 32650 },
    { host: '103.48.68.36', port: 83 },
    { host: '103.149.130.38', port: 80 },
    { host: '190.61.88.147', port: 8080 },
    { host: '45.167.124.193', port: 9992 },
    { host: '190.128.228.182', port: 80 },
    { host: '45.174.248.10', port: 999 }
];

// מעקב אחר הפרוקסי הנוכחי
let currentProxyIndex = 0;
let proxyEnabled = true; // הפרוקסי מופעל כברירת מחדל

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
