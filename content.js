/**
 * Content Script - YouTube Transcription Service
 * מוסיף פונקציונליות תמלול לדפי יוטיוב
 */

// כתובת השרת בענן
const RENDER_SERVICE_URL = 'https://video-proxy-obqa.onrender.com';

// מידע על התמלול הנוכחי
let transcriptionInProgress = false;
let lastTranscribedVideoId = null;

/**
 * הוספת כפתור התמלול לממשק YouTube
 */
function addTranscribeButton() {
  // אם כבר קיים כפתור, לא צריך להוסיף שוב
  if (document.querySelector('.youtube-transcribe-btn')) {
    return;
  }

  // חיפוש מיקום מתאים בדף
  const targetSelectors = [
    '.ytp-right-controls', // בפקדי הנגן הימניים
    '#above-the-fold #top-row', // מתחת לכותרת הסרטון
    '#menu-container', // בתפריט הסרטון
    '#actions' // באזור הפעולות
  ];

  let targetContainer = null;
  for (const selector of targetSelectors) {
    const container = document.querySelector(selector);
    if (container) {
      targetContainer = container;
      break;
    }
  }

  if (!targetContainer) {
    console.log('לא נמצא מיקום מתאים להוספת כפתור תמלול');
    return;
  }

  // יצירת כפתור
  const transcribeButton = document.createElement('button');
  transcribeButton.className = 'youtube-transcribe-btn';
  transcribeButton.innerHTML = `
    <span class="youtube-transcribe-icon">
      <svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
      </svg>
    </span>
    <span class="youtube-transcribe-text">תמלל</span>
  `;

  // סגנון הכפתור
  transcribeButton.style.cssText = `
    background-color: #cc0000;
    color: white;
    border: none;
    border-radius: 3px;
    padding: 6px 12px;
    margin: 0 5px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 14px;
    transition: background-color 0.2s;
  `;

  // הוספת מאזין לאירוע לחיצה
  transcribeButton.addEventListener('click', showTranscribeMenu);
  
  // הוספת הכפתור לדף
  targetContainer.appendChild(transcribeButton);
  console.log('כפתור תמלול נוסף בהצלחה');
}

/**
 * הצגת תפריט תמלול בלחיצה על הכפתור
 */
function showTranscribeMenu() {
  // הסרת תפריט קודם אם קיים
  removeExistingMenu();

  // קבלת מידע על הסרטון הנוכחי
  const videoId = getCurrentVideoId();
  const videoUrl = window.location.href;
  
  if (!videoId) {
    showNotification('לא ניתן לזהות את מזהה הסרטון', 3000);
    return;
  }

  // יצירת תפריט
  const menu = document.createElement('div');
  menu.className = 'youtube-transcribe-menu';
  menu.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    padding: 20px;
    z-index: 9999;
    min-width: 320px;
    max-width: 90vw;
    direction: rtl;
    text-align: right;
    font-family: 'Segoe UI', Arial, sans-serif;
  `;

  // תוכן התפריט
  menu.innerHTML = `
    <div style="font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #333;">תמלול סרטון יוטיוב</div>
    <div style="margin-bottom: 20px; color: #555; font-size: 14px;">בחר את הפורמט הרצוי לתמלול:</div>
    
    <div class="format-options" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
      <div class="format-option" style="display: flex; align-items: center;">
        <input type="radio" id="format-srt" name="format" value="srt" checked>
        <label for="format-srt" style="margin-right: 8px; cursor: pointer;">SRT - קובץ כתוביות עם חותמות זמן</label>
      </div>
      
      <div class="format-option" style="display: flex; align-items: center;">
        <input type="radio" id="format-txt" name="format" value="txt">
        <label for="format-txt" style="margin-right: 8px; cursor: pointer;">TXT - טקסט פשוט</label>
      </div>
      
      <div class="format-option" style="display: flex; align-items: center;">
        <input type="radio" id="format-json" name="format" value="json">
        <label for="format-json" style="margin-right: 8px; cursor: pointer;">JSON - פורמט מפורט (למפתחים)</label>
      </div>
    </div>
    
    <div style="border-top: 1px solid #e5e5e5; padding-top: 15px; display: flex; justify-content: flex-end; gap: 10px;">
      <button id="menu-cancel-btn" style="padding: 8px 15px; background: none; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">ביטול</button>
      <button id="menu-transcribe-btn" style="padding: 8px 15px; background-color: #cc0000; color: white; border: none; border-radius: 4px; cursor: pointer;">תמלל סרטון</button>
    </div>
  `;

  // הוספת התפריט לדף
  document.body.appendChild(menu);
  
  // הוספת מאזינים לכפתורים
  document.getElementById('menu-cancel-btn').addEventListener('click', removeExistingMenu);
  
  document.getElementById('menu-transcribe-btn').addEventListener('click', () => {
    const selectedFormat = document.querySelector('input[name="format"]:checked').value;
    startTranscription(videoUrl, selectedFormat);
    removeExistingMenu();
  });
  
  // סגירת התפריט בלחיצה מחוץ לו
  document.addEventListener('click', handleOutsideClick);
}

/**
 * הסרת תפריט קיים
 */
function removeExistingMenu() {
  const existingMenu = document.querySelector('.youtube-transcribe-menu');
  if (existingMenu) {
    existingMenu.remove();
    document.removeEventListener('click', handleOutsideClick);
  }
}

/**
 * טיפול בלחיצה מחוץ לתפריט
 */
function handleOutsideClick(event) {
  const menu = document.querySelector('.youtube-transcribe-menu');
  if (menu && !menu.contains(event.target) && !event.target.classList.contains('youtube-transcribe-btn')) {
    removeExistingMenu();
  }
}

/**
 * התחלת תהליך התמלול
 */
function startTranscription(videoUrl, format) {
  if (transcriptionInProgress) {
    showNotification('תמלול כבר מתבצע. המתן לסיומו.', 3000);
    return;
  }
  
  transcriptionInProgress = true;
  showNotification('מתחיל תהליך תמלול... הדפדפן יפתח חלון חדש עם התוצאה.', 5000);
  
  // בניית כתובת התמלול
  const transcriptionUrl = `${RENDER_SERVICE_URL}/transcribe?url=${encodeURIComponent(videoUrl)}&format=${format}`;
  
  // פתיחת חלון חדש עם תוצאת התמלול
  window.open(transcriptionUrl, '_blank');
  
  // שמירת מזהה הסרטון האחרון שתומלל
  lastTranscribedVideoId = getCurrentVideoId();
  
  // איפוס דגל התמלול לאחר זמן קצר
  setTimeout(() => {
    transcriptionInProgress = false;
  }, 3000);
}

/**
 * קבלת מזהה הסרטון הנוכחי
 */
function getCurrentVideoId() {
  try {
    // ניסיון לחלץ מזהה מכתובת URL
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    
    if (videoId) {
      return videoId;
    }
    
    // אם לא מצאנו בכתובת, ננסה לחלץ מהסרטון עצמו
    const videoElement = document.querySelector('video');
    if (videoElement && videoElement.src) {
      const srcMatch = videoElement.src.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^?&]+)/i);
      if (srcMatch && srcMatch[1]) {
        return srcMatch[1];
      }
    }
    
    return null;
  } catch (error) {
    console.error('שגיאה בחילוץ מזהה הסרטון:', error);
    return null;
  }
}

/**
 * הצגת הודעה למשתמש
 */
function showNotification(message, duration = 3000) {
  // הסרת הודעה קודמת אם קיימת
  const existingNotification = document.querySelector('.youtube-transcribe-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // יצירת אלמנט ההודעה
  const notification = document.createElement('div');
  notification.className = 'youtube-transcribe-notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 14px;
    z-index: 10000;
    max-width: 90vw;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.3s, transform 0.3s;
  `;
  
  // הוספת ההודעה לדף
  document.body.appendChild(notification);
  
  // אנימציית הופעה
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0)';
  }, 10);
  
  // הסרת ההודעה לאחר זמן מסוים
  if (duration > 0) {
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(20px)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, duration);
  }
  
  return notification;
}

/**
 * בדיקה אם הדף הנוכחי הוא דף צפייה בסרטון
 */
function isVideoPage() {
  return window.location.pathname === '/watch' && new URLSearchParams(window.location.search).has('v');
}

/**
 * טיפול בשינויי ניווט בדף (בלי טעינה מחדש)
 */
function setupNavigationMonitoring() {
  // משתנה לשמירת הכתובת האחרונה
  let lastUrl = window.location.href;
  
  // ניטור שינויים בהיסטוריה
  window.addEventListener('popstate', onNavigationChange);
  
  // הגדרת צופה שינויים בדף
  const observer = new MutationObserver(() => {
    if (lastUrl !== window.location.href) {
      lastUrl = window.location.href;
      onNavigationChange();
    }
  });
  
  // התחלת הניטור
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * פעולות לביצוע בשינוי ניווט
 */
function onNavigationChange() {
  if (isVideoPage()) {
    console.log('זוהה דף צפייה בסרטון, מוסיף כפתור תמלול...');
    // השהייה קצרה כדי לוודא שהממשק נטען
    setTimeout(addTranscribeButton, 1500);
  }
}

/**
 * פונקציה ראשית - הפעלה בטעינת הסקריפט
 */
function initialize() {
  console.log('סקריפט תמלול יוטיוב נטען');
  
  // בדיקה אם אנחנו בדף צפייה בסרטון
  if (isVideoPage()) {
    console.log('זוהה דף צפייה בסרטון, מוסיף כפתור תמלול...');
    
    // השהייה קצרה כדי לוודא שהממשק נטען
    setTimeout(addTranscribeButton, 1500);
  }
  
  // הגדרת ניטור ניווט
  setupNavigationMonitoring();
  
  // האזנה להודעות מרכיבי רקע
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('התקבלה הודעה:', message);
    
    if (message.action === 'showTranscriptionMenu') {
      showTranscribeMenu();
      sendResponse({ success: true });
    } else if (message.action === 'youtubePageLoaded') {
      if (isVideoPage()) {
        setTimeout(addTranscribeButton, 1000);
      }
      sendResponse({ success: true });
    }
    
    return true; // לאפשר sendResponse אסינכרוני
  });
}

// הפעלת הסקריפט
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  // אם הדף כבר נטען
  initialize();
} else {
  // אם הדף עדיין נטען
  window.addEventListener('DOMContentLoaded', initialize);
} 