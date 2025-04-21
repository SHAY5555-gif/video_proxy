/**
 * Content Script - YouTube Transcription
 * מוסיף כפתור תמלול לדפי יוטיוב
 */

// יבוא הגדרות השירות (אם נתמך)
let RENDER_SERVICE_URL = 'https://video-proxy-obqa.onrender.com';

/**
 * הוספת כפתור תמלול לסרטוני יוטיוב
 */
function addTranscribeButtonToYouTube() {
  // מיקומים אפשריים בדף יוטיוב להוספת הכפתור
  const possibleContainers = [
    '#below #top-row', // מתחת לכותרת הסרטון
    '#menu-container', // בתפריט נגן הוידאו
    '#actions', // אזור הפעולות (שיתוף, שמירה וכו')
    '#buttons' // אזור הכפתורים (לייק, דיסלייק וכו')
  ];
  
  let targetContainer = null;
  for (const selector of possibleContainers) {
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
  
  // בדיקה אם הכפתור כבר קיים
  if (document.querySelector('.yt-transcribe-button')) {
    return;
  }
  
  // יצירת כפתור תמלול
  const button = document.createElement('button');
  button.className = 'yt-transcribe-button';
  button.innerHTML = 'תמלל סרטון';
  button.style.cssText = `
    background-color: #d32f2f;
    color: white;
    border: none;
    border-radius: 2px;
    padding: 8px 12px;
    margin: 0 4px;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 14px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  `;
  
  // הוספת מאזין לאירוע לחיצה
  button.addEventListener('click', () => {
    // קבלת מזהה הסרטון או כתובת הסרטון
    const currentUrl = window.location.href;
    const videoId = new URL(currentUrl).searchParams.get('v');
    
    if (!videoId) {
      alert('לא נמצא מזהה סרטון תקין');
      return;
    }
    
    // הקפצת תפריט לבחירת פורמט התמלול
    showTranscriptionFormatMenu(currentUrl, videoId);
  });
  
  // הוספת הכפתור לדף
  targetContainer.appendChild(button);
  console.log('כפתור תמלול נוסף בהצלחה');
}

/**
 * יצירת תפריט צף לבחירת פורמט התמלול
 */
function showTranscriptionFormatMenu(videoUrl, videoId) {
  // הסרת תפריט קודם אם קיים
  const existingMenu = document.querySelector('.yt-transcribe-menu');
  if (existingMenu) {
    existingMenu.remove();
  }
  
  // יצירת התפריט
  const menu = document.createElement('div');
  menu.className = 'yt-transcribe-menu';
  menu.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    padding: 16px;
    z-index: 9999;
    min-width: 300px;
    direction: rtl;
    text-align: right;
    font-family: 'Segoe UI', Arial, sans-serif;
  `;
  
  // תוכן התפריט
  menu.innerHTML = `
    <div style="font-size: 18px; font-weight: bold; margin-bottom: 12px; color: #333;">תמלול סרטון</div>
    <div style="margin-bottom: 16px; color: #555; font-size: 14px;">בחר את הפורמט הרצוי:</div>
    <div class="format-options" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
      <div class="format-option" data-format="srt">
        <input type="radio" id="format-srt" name="format" value="srt" checked>
        <label for="format-srt">SRT - קובץ כתוביות עם חותמות זמן</label>
      </div>
      <div class="format-option" data-format="txt">
        <input type="radio" id="format-txt" name="format" value="txt">
        <label for="format-txt">TXT - טקסט פשוט</label>
      </div>
      <div class="format-option" data-format="json">
        <input type="radio" id="format-json" name="format" value="json">
        <label for="format-json">JSON - פורמט מפורט (למפתחים)</label>
      </div>
    </div>
    <div style="border-top: 1px solid #e5e5e5; padding-top: 16px; display: flex; justify-content: flex-end; gap: 12px;">
      <button id="cancel-transcribe" style="padding: 8px 12px; background: none; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">ביטול</button>
      <button id="submit-transcribe" style="padding: 8px 12px; background-color: #d32f2f; color: white; border: none; border-radius: 4px; cursor: pointer;">תמלל סרטון</button>
    </div>
  `;
  
  // הוספת התפריט לדף
  document.body.appendChild(menu);
  
  // הוספת מאזינים לכפתורים
  document.getElementById('cancel-transcribe').addEventListener('click', () => {
    menu.remove();
  });
  
  document.getElementById('submit-transcribe').addEventListener('click', () => {
    // קבלת הפורמט הנבחר
    const selectedFormat = document.querySelector('input[name="format"]:checked').value;
    
    // פתיחת חלון חדש עם הבקשה לשרת הרנדר
    (async () => {
      let userIdParam = '';
      try {
        if (typeof window.getCurrentUserId === 'function') {
          const uid = await window.getCurrentUserId();
          if (uid) userIdParam = `&user_id=${encodeURIComponent(uid)}`;
        }
      } catch (e) {}
      const transcriptionUrl = `${RENDER_SERVICE_URL}/transcribe?url=${encodeURIComponent(videoUrl)}&format=${selectedFormat}${userIdParam}`;
      window.open(transcriptionUrl, '_blank');
    })();
    
    // הסרת התפריט
    menu.remove();
  });
  
  // סגירת התפריט בלחיצה מחוץ לו
  document.addEventListener('click', function closeMenu(e) {
    if (!menu.contains(e.target) && !e.target.classList.contains('yt-transcribe-button')) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  });
}

/**
 * פונקציה הנקראת כאשר משתנה כתובת URL ללא טעינת דף מחדש
 */
function onUrlChange() {
  // בדיקה שאנחנו בדף צפייה בסרטון
  if (window.location.pathname === '/watch') {
    console.log('זוהה דף צפייה בסרטון, מנסה להוסיף כפתור תמלול...');
    // המתנה קצרה לטעינת הממשק
    setTimeout(addTranscribeButtonToYouTube, 1500);
  }
}

/**
 * פונקציה להתחלת מעקב אחר שינויים בכתובת URL
 */
function startUrlChangeDetection() {
  let lastUrl = window.location.href;
  
  // מעקב אחר שינויים בהיסטוריה
  window.addEventListener('popstate', onUrlChange);
  
  // מעקב אחר שינויים ב-DOM שעשויים להצביע על שינוי בסרטון הנוכחי
  new MutationObserver(() => {
    if (lastUrl !== window.location.href) {
      lastUrl = window.location.href;
      onUrlChange();
    }
  }).observe(document.body, { childList: true, subtree: true });
}

// הפעלה של הסקריפט רק בדפי יוטיוב
if (window.location.hostname.includes('youtube.com')) {
  console.log('תוסף תמלול יוטיוב נטען בהצלחה');
  
  // הוספת הכפתור בטעינת הדף
  if (window.location.pathname === '/watch') {
    console.log('זוהה דף צפייה בסרטון, מוסיף כפתור תמלול...');
    
    // המתנה קצרה לטעינת הממשק
    window.addEventListener('load', () => {
      setTimeout(addTranscribeButtonToYouTube, 1500);
    });
    
    // ניסיון ראשוני ללא המתנה לאירוע load
    if (document.readyState === 'complete') {
      setTimeout(addTranscribeButtonToYouTube, 1000);
    }
  }
  
  // התחלת מעקב אחר שינויי URL
  startUrlChangeDetection();
} 