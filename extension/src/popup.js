/**
 * קובץ JavaScript עבור חלונית התוסף (popup)
 */

// כתובת שירות הרנדר
const RENDER_SERVICE_URL = 'https://video-proxy-obqa.onrender.com';

/**
 * בדיקת זמינות השירות
 */
async function checkServiceAvailability() {
  try {
    const response = await fetch(`${RENDER_SERVICE_URL}/health`);
    if (response.ok) {
      const data = await response.json();
      return data.status === 'OK';
    }
    return false;
  } catch (error) {
    console.error('שגיאה בבדיקת זמינות השירות:', error);
    return false;
  }
}

/**
 * פתיחת טופס התמלול המלא
 */
function openTranscriptionForm() {
  chrome.tabs.create({ url: `${RENDER_SERVICE_URL}/transcribe-form` });
}

/**
 * קבלת הלשונית הנוכחית
 */
async function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

/**
 * בדיקה האם כתובת היא סרטון יוטיוב
 */
function isYouTubeVideoUrl(url) {
  return /youtube\.com\/watch\?v=|youtu\.be\//.test(url);
}

/**
 * שליחת סרטון לתמלול
 */
function transcribeVideo(videoUrl, format) {
  if (!isYouTubeVideoUrl(videoUrl)) {
    alert('הכתובת שהוזנה אינה כתובת תקינה של סרטון יוטיוב');
    return;
  }
  
  let userIdParam = '';
  if (typeof window.getCurrentUserId === 'function') {
    try {
      const uid = await window.getCurrentUserId();
      if (uid) userIdParam = `&user_id=${encodeURIComponent(uid)}`;
    } catch (e) {}
  }
  const transcriptionUrl = `${RENDER_SERVICE_URL}/transcribe?url=${encodeURIComponent(videoUrl)}&format=${format}${userIdParam}`;
  chrome.tabs.create({ url: transcriptionUrl });
}

/**
 * איתחול הממשק בעת טעינת הדף
 */
document.addEventListener('DOMContentLoaded', async function() {
  // בדיקת זמינות השירות
  const isServiceAvailable = await checkServiceAvailability();
  const statusElement = document.getElementById('service-status');
  
  if (isServiceAvailable) {
    statusElement.textContent = '✓ שירות התמלול זמין';
    statusElement.classList.add('online');
  } else {
    statusElement.textContent = '✗ שירות התמלול אינו זמין כרגע';
    statusElement.classList.add('offline');
  }
  
  // בדיקה אם אנחנו בדף יוטיוב
  const currentTab = await getCurrentTab();
  const currentVideoSection = document.getElementById('current-video-section');
  
  if (!isYouTubeVideoUrl(currentTab.url)) {
    document.getElementById('transcribe-current').disabled = true;
    document.getElementById('transcribe-current').style.opacity = '0.5';
    document.getElementById('transcribe-current').title = 'יש לפתוח סרטון יוטיוב לפני השימוש באפשרות זו';
  }
  
  // הוספת מאזין לכפתור תמלול הסרטון הנוכחי
  document.getElementById('transcribe-current').addEventListener('click', async function() {
    const currentTab = await getCurrentTab();
    const format = document.getElementById('format').value;
    
    if (isYouTubeVideoUrl(currentTab.url)) {
      transcribeVideo(currentTab.url, format);
    } else {
      alert('יש לפתוח סרטון יוטיוב לפני השימוש באפשרות זו');
    }
  });
  
  // הוספת מאזין לכפתור תמלול סרטון לפי כתובת
  document.getElementById('transcribe-url').addEventListener('click', function() {
    const videoUrl = document.getElementById('youtube-url').value.trim();
    const format = document.getElementById('format').value;
    
    if (videoUrl) {
      transcribeVideo(videoUrl, format);
    } else {
      alert('נא להזין כתובת סרטון יוטיוב');
    }
  });
  
  // הוספת מאזין לכפתור פתיחת הטופס המלא
  document.getElementById('open-form-button').addEventListener('click', openTranscriptionForm);
}); 