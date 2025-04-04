/**
 * Background script - YouTube Transcription Extension
 * 
 * אחראי על הפעלת רכיבי התוסף והתקשורת עם שירות הענן
 */

// כתובת שירות הרנדר
const RENDER_SERVICE_URL = 'https://video-proxy-obqa.onrender.com';

// קבועים
const CONTEXT_MENU_ID = 'transcribe-youtube-video';

/**
 * הגדרת פעולות תפריט ההקשר
 */
function setupContextMenu() {
  // הסרת פריטים קודמים אם קיימים
  chrome.contextMenus.removeAll(() => {
    // יצירת פריט חדש בתפריט ההקשר
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'תמלל סרטון יוטיוב',
      contexts: ['link', 'page'],
      documentUrlPatterns: ['*://*.youtube.com/watch*', '*://youtu.be/*']
    });
  });
}

/**
 * האזנה ללחיצה על תפריט ההקשר
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    let videoUrl = '';
    
    // קבלת כתובת הסרטון מהקישור או מהדף
    if (info.linkUrl && (
        info.linkUrl.includes('youtube.com/watch') || 
        info.linkUrl.includes('youtu.be/'))) {
      videoUrl = info.linkUrl;
    } else {
      videoUrl = info.pageUrl;
    }
    
    // פתיחת תפריט בחירת פורמט
    chrome.tabs.sendMessage(tab.id, { 
      action: 'showTranscriptionMenu',
      videoUrl: videoUrl
    });
  }
});

/**
 * האזנה להודעות מתוך ה-content scripts או הפופאפ
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // טיפול בבקשה לתמלול
  if (request.action === 'transcribeVideo') {
    const { videoUrl, format } = request;
    const transcriptionUrl = `${RENDER_SERVICE_URL}/transcribe?url=${encodeURIComponent(videoUrl)}&format=${format}`;
    
    // פתיחת חלון חדש עם התמלול
    chrome.tabs.create({ url: transcriptionUrl }, (tab) => {
      sendResponse({ success: true, tabId: tab.id });
    });
    
    return true; // החזרת true לאפשר sendResponse אסינכרוני
  }
  
  // בדיקת זמינות השירות
  if (request.action === 'checkServiceAvailability') {
    fetch(`${RENDER_SERVICE_URL}/health`)
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Service unavailable');
      })
      .then(data => {
        sendResponse({ available: data.status === 'OK' });
      })
      .catch(error => {
        console.error('Error checking service availability:', error);
        sendResponse({ available: false, error: error.message });
      });
    
    return true; // החזרת true לאפשר sendResponse אסינכרוני
  }
});

/**
 * האזנה להתקנת התוסף
 */
chrome.runtime.onInstalled.addListener((details) => {
  // הגדרת תפריט ההקשר
  setupContextMenu();
  
  // הצגת דף ברוכים הבאים בהתקנה חדשה
  if (details.reason === 'install') {
    chrome.tabs.create({ url: `${RENDER_SERVICE_URL}/` });
  }
});

/**
 * האזנה לשינויים בלשונית הפעילה
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // שליחת עדכון ל-content script כאשר נטען סרטון יוטיוב חדש
  if (changeInfo.status === 'complete' && 
      tab.url && 
      (tab.url.includes('youtube.com/watch') || tab.url.includes('youtu.be/'))) {
    
    chrome.tabs.sendMessage(tabId, { 
      action: 'youtubePageLoaded',
      url: tab.url
    }).catch(err => {
      // התעלמות משגיאות אם ה-content script לא נטען עדיין
    });
  }
}); 