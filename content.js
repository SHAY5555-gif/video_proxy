/**
 * Content Script - YouTube Transcription Service
 * מוסיף פונקציונליות תמלול לדפי יוטיוב
 */

// כתובת השרת בענן
const RENDER_SERVICE_URL = 'https://video-proxy-obqa.onrender.com';

// מידע על התמלול הנוכחי
let transcriptionInProgress = false;
let lastTranscribedVideoId = null;
let downloadInProgress = false;

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
 * הוספת כפתור הורדה לממשק
 */
function addDownloadButton() {
  // אם כבר קיים כפתור, לא צריך להוסיף שוב
  if (document.querySelector('.video-download-btn')) {
    return;
  }

  // חיפוש מיקום מתאים בדף
  const targetSelectors = [
    '.ytp-right-controls', // בפקדי הנגן הימניים (YouTube)
    '#above-the-fold #top-row', // מתחת לכותרת הסרטון (YouTube)
    '#menu-container', // בתפריט הסרטון (YouTube)
    '#actions', // באזור הפעולות (YouTube)
    '.tiktok-head', // TikTok
    '.video-actions', // Instagram
    '.video-container', // Facebook
    'header' // כללי
  ];

  let targetContainer = null;
  for (const selector of targetSelectors) {
    const container = document.querySelector(selector);
    if (container) {
      targetContainer = container;
      break;
    }
  }

  // אם לא נמצא מיקום מתאים, ננסה ליצור כפתור צף
  if (!targetContainer) {
    targetContainer = document.body;
    console.log('לא נמצא מיקום ספציפי להוספת כפתור הורדה, יוצר כפתור צף');
  }
  
  // יצירת כפתור
  const downloadButton = document.createElement('button');
  downloadButton.className = 'video-download-btn';
  downloadButton.innerHTML = `
    <span class="video-download-icon">
      <svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/>
      </svg>
    </span>
    <span class="video-download-text">הורד וידאו</span>
  `;

  // סגנון הכפתור
  if (targetContainer === document.body) {
    // סגנון לכפתור צף
    downloadButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #2196F3;
      color: white;
      border: none;
      border-radius: 50px;
      padding: 10px 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 9999;
      transition: background-color 0.2s;
    `;
  } else {
    // סגנון לכפתור רגיל
    downloadButton.style.cssText = `
      background-color: #2196F3;
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
  }

  // הוספת מאזין לאירוע לחיצה
  downloadButton.addEventListener('click', showDownloadMenu);
  
  // הוספת הכפתור לדף
  targetContainer.appendChild(downloadButton);
  console.log('כפתור הורדה נוסף בהצלחה');
}

/**
 * הצגת תפריט הורדת וידאו
 */
function showDownloadMenu() {
  // הסרת תפריט קודם אם קיים
  removeExistingMenu();

  // קבלת כתובת הדף הנוכחי
  const currentUrl = window.location.href;
  
  // יצירת תפריט
  const menu = document.createElement('div');
  menu.className = 'youtube-transcribe-menu video-download-menu';
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
    <div style="font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #333;">הורדת וידאו</div>
    <div style="margin-bottom: 20px; color: #555; font-size: 14px;">הזן את כתובת הוידאו שברצונך להוריד:</div>
    
    <div style="margin-bottom: 20px;">
      <input type="text" id="video-url-input" value="${currentUrl}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; direction: ltr;">
    </div>
    
    <div class="supported-sites" style="margin-bottom: 15px; font-size: 12px; color: #666;">
      אתרים נתמכים: יוטיוב, טיקטוק, אינסטגרם, פייסבוק, טוויטר, וואטסאפ ועוד רבים.
    </div>
    
    <div style="border-top: 1px solid #e5e5e5; padding-top: 15px; display: flex; justify-content: flex-end; gap: 10px;">
      <button id="menu-cancel-btn" style="padding: 8px 15px; background: none; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">ביטול</button>
      <button id="menu-download-btn" style="padding: 8px 15px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">הורד וידאו</button>
    </div>
  `;

  // הוספת התפריט לדף
  document.body.appendChild(menu);
  
  // הוספת מאזינים לכפתורים
  document.getElementById('menu-cancel-btn').addEventListener('click', removeExistingMenu);
  
  document.getElementById('menu-download-btn').addEventListener('click', () => {
    const videoUrl = document.getElementById('video-url-input').value.trim();
    if (videoUrl) {
      startDownload(videoUrl);
      removeExistingMenu();
    } else {
      showNotification('יש להזין כתובת וידאו', 3000);
    }
  });
  
  // מיקוד על שדה הקלט
  document.getElementById('video-url-input').select();
  
  // סגירת התפריט בלחיצה מחוץ לו
  document.addEventListener('click', handleOutsideClick);
}

/**
 * התחלת תהליך הורדת הוידאו
 */
function startDownload(videoUrl) {
  if (downloadInProgress) {
    showNotification('הורדה כבר מתבצעת. המתן לסיומה.', 3000);
    return;
  }
  
  downloadInProgress = true;
  showNotification('מתחיל תהליך הורדה... אנא המתן', 3000);
  
  // יצירת תיבת תוצאות
  createResultsBox('טוען מידע על הוידאו...');
  
  // שליחת בקשה לשרת
  fetch(`${RENDER_SERVICE_URL}/download?url=${encodeURIComponent(videoUrl)}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`שגיאה בהורדה (${response.status})`);
      }
      return response.json();
    })
    .then(data => {
      if (!data.success || !data.data) {
        throw new Error('לא התקבלו נתונים תקינים מהשרת');
      }
      
      // עדכון תיבת התוצאות
      updateResultsBox(data.data);
    })
    .catch(error => {
      updateResultsBox(null, error.message);
      showNotification(`שגיאה: ${error.message}`, 5000);
    })
    .finally(() => {
      downloadInProgress = false;
    });
}

/**
 * יצירת תיבת תוצאות להצגת קישורי ההורדה
 */
function createResultsBox(loadingMessage) {
  // הסרת תיבה קיימת אם יש
  const existingBox = document.querySelector('.video-download-results');
  if (existingBox) {
    existingBox.remove();
  }
  
  // יצירת תיבה חדשה
  const resultsBox = document.createElement('div');
  resultsBox.className = 'video-download-results';
  resultsBox.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    padding: 15px;
    z-index: 9999;
    min-width: 300px;
    max-width: 90vw;
    max-height: 80vh;
    overflow-y: auto;
    direction: rtl;
    text-align: right;
    font-family: 'Segoe UI', Arial, sans-serif;
  `;
  
  // תוכן ראשוני - מסך טעינה
  resultsBox.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <h3 style="margin: 0; font-size: 16px; color: #333;">תוצאות הורדה</h3>
      <button class="close-results-btn" style="background: none; border: none; cursor: pointer; font-size: 18px; color: #999;">×</button>
    </div>
    <div class="results-content" style="color: #555;">
      <div class="loading-message" style="display: flex; align-items: center; gap: 10px;">
        <div class="spinner" style="border: 3px solid #f3f3f3; border-top: 3px solid #2196F3; border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite;"></div>
        <div>${loadingMessage}</div>
      </div>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
  
  // הוספה לדף
  document.body.appendChild(resultsBox);
  
  // הוספת מאזין לכפתור סגירה
  document.querySelector('.close-results-btn').addEventListener('click', () => {
    resultsBox.remove();
  });
}

/**
 * עדכון תיבת התוצאות עם מידע הוידאו
 */
function updateResultsBox(videoData, errorMessage) {
  const resultsBox = document.querySelector('.video-download-results');
  if (!resultsBox) return;
  
  const resultsContent = resultsBox.querySelector('.results-content');
  
  if (errorMessage) {
    // הצגת שגיאה
    resultsContent.innerHTML = `
      <div class="error-message" style="color: #e53935; padding: 10px; background-color: #ffebee; border-radius: 4px;">
        <strong>שגיאה:</strong> ${errorMessage}
      </div>
    `;
    return;
  }
  
  // עיצוב הנתונים
  let mediaLinks = '';
  
  if (videoData.medias && videoData.medias.length > 0) {
    mediaLinks = `
      <div class="media-links" style="margin-top: 15px;">
        <h4 style="margin: 0 0 10px; font-size: 14px; color: #333;">קישורי הורדה:</h4>
        <ul style="list-style: none; padding: 0; margin: 0;">
    `;
    
    videoData.medias.forEach((media, index) => {
      const fileType = media.type || 'וידאו';
      const quality = media.quality || '';
      const extension = media.extension || 'mp4';
      
      mediaLinks += `
        <li style="margin-bottom: 8px; padding: 8px; background-color: #f5f5f5; border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>${fileType} ${quality} (${extension})</span>
            <a href="${media.url}" target="_blank" download style="background-color: #2196F3; color: white; text-decoration: none; padding: 5px 10px; border-radius: 4px; font-size: 13px;">הורד</a>
          </div>
        </li>
      `;
    });
    
    mediaLinks += `</ul></div>`;
  }
  
  // עדכון התוכן
  resultsContent.innerHTML = `
    <div class="video-info" style="margin-bottom: 10px;">
      ${videoData.thumbnail ? `<img src="${videoData.thumbnail}" alt="תמונה ממוזערת" style="max-width: 100%; border-radius: 4px; margin-bottom: 10px;">` : ''}
      <h3 style="margin: 0 0 5px; font-size: 16px; color: #333;">${videoData.title || 'וידאו ללא כותרת'}</h3>
      ${videoData.author ? `<div style="font-size: 13px; color: #666; margin-bottom: 5px;">יוצר: ${videoData.author}</div>` : ''}
      ${videoData.duration ? `<div style="font-size: 13px; color: #666; margin-bottom: 5px;">אורך: ${videoData.duration}</div>` : ''}
      <div style="font-size: 13px; color: #666; margin-bottom: 5px;">מקור: ${videoData.source || 'לא ידוע'}</div>
    </div>
    ${mediaLinks}
  `;
}

/**
 * פונקציית אתחול התוסף
 */
function initialize() {
  console.log('מאתחל תוסף תמלול יוטיוב...');
  
  // אתחול ניטור ניווט
  setupNavigationMonitoring();
  
  // הוספת כפתור תמלול אם נמצאים בדף וידאו
  if (isVideoPage()) {
    setTimeout(addTranscribeButton, 1000);
  }
  
  // הוספת כפתור הורדה לכל סוגי הדפים
  setTimeout(addDownloadButton, 1500);
}

// הפעלת הסקריפט
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  // אם הדף כבר נטען
  initialize();
} else {
  // אם הדף עדיין נטען
  window.addEventListener('DOMContentLoaded', initialize); 