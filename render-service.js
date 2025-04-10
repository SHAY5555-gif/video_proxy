/**
 * YouTube Transcription API Client
 * קוד לחיבור התוסף לשירות התמלול בענן שמופעל ב-Render
 */

// כתובת השרת בענן
const RENDER_SERVICE_URL = 'https://video-proxy-obqa.onrender.com';

/**
 * פונקציה לתמלול סרטון יוטיוב באמצעות שירות הענן
 * @param {string} videoUrl - כתובת סרטון היוטיוב
 * @param {string} format - פורמט הפלט (srt/txt/json)
 * @param {Function} onStart - פונקציית callback לתחילת התהליך (אופציונלי)
 * @param {Function} onSuccess - פונקציית callback להצלחה (אופציונלי)
 * @param {Function} onError - פונקציית callback לשגיאה (אופציונלי)
 * @returns {Promise} - במקרה של json, מחזיר Promise עם נתוני התמלול
 */
async function transcribeYouTubeVideo(videoUrl, format = 'srt', onStart, onSuccess, onError) {
  try {
    // קריאה לפונקציית התחלה אם סופקה
    if (typeof onStart === 'function') {
      onStart();
    }

    // בניית כתובת ה-API
    const apiUrl = `${RENDER_SERVICE_URL}/transcribe?url=${encodeURIComponent(videoUrl)}&format=${format}`;
    
    // במקרה של JSON, נבצע fetch ונחזיר את התוצאה
    if (format === 'json') {
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        let errorMessage = `שגיאה בתמלול (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // התעלמות משגיאת פירוק JSON
        }
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      
      // קריאה לפונקציית הצלחה אם סופקה
      if (typeof onSuccess === 'function') {
        onSuccess(result);
      }
      
      return result;
    } 
    // במקרה של SRT או TXT, נפנה את המשתמש ישירות או נחזיר קישור
    else {
      // פתיחת חלון חדש או הפניה לקישור
      window.open(apiUrl, '_blank');
      
      // קריאה לפונקציית הצלחה אם סופקה
      if (typeof onSuccess === 'function') {
        onSuccess({ 
          success: true, 
          message: 'התמלול הושלם בהצלחה. הקובץ יורד אוטומטית.',
          downloadUrl: apiUrl
        });
      }
      
      return { 
        success: true, 
        downloadUrl: apiUrl 
      };
    }
  } catch (error) {
    console.error('שגיאה בתמלול:', error);
    
    // קריאה לפונקציית שגיאה אם סופקה
    if (typeof onError === 'function') {
      onError(error);
    }
    
    throw error;
  }
}

/**
 * פונקציה להורדת סרטונים מפלטפורמות שונות
 * @param {string} videoUrl - כתובת הסרטון להורדה
 * @param {Function} onStart - פונקציית callback לתחילת התהליך (אופציונלי)
 * @param {Function} onSuccess - פונקציית callback להצלחה (אופציונלי)
 * @param {Function} onError - פונקציית callback לשגיאה (אופציונלי)
 * @returns {Promise} - מחזיר Promise עם נתוני הסרטון
 */
async function downloadVideo(videoUrl, onStart, onSuccess, onError) {
  try {
    // קריאה לפונקציית התחלה אם סופקה
    if (typeof onStart === 'function') {
      onStart();
    }

    // בניית כתובת ה-API
    const apiUrl = `${RENDER_SERVICE_URL}/download?url=${encodeURIComponent(videoUrl)}`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      let errorMessage = `שגיאה בהורדה (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // התעלמות משגיאת פירוק JSON
      }
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    
    // קריאה לפונקציית הצלחה אם סופקה
    if (typeof onSuccess === 'function') {
      onSuccess(result);
    }
    
    return result;
  } catch (error) {
    console.error('שגיאה בהורדת וידאו:', error);
    
    // קריאה לפונקציית שגיאה אם סופקה
    if (typeof onError === 'function') {
      onError(error);
    }
    
    throw error;
  }
}

/**
 * פונקציה לבדיקת זמינות השירות
 * @returns {Promise<boolean>} - האם השירות זמין
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
 * פונקציה להפנייה לטופס התמלול בממשק המשתמש הגרפי
 */
function openTranscriptionForm() {
  window.open(`${RENDER_SERVICE_URL}/transcribe-form`, '_blank');
}

// ייצוא הפונקציות כך שיהיו זמינות מקבצים אחרים
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    transcribeYouTubeVideo,
    downloadVideo,
    checkServiceAvailability,
    openTranscriptionForm,
    RENDER_SERVICE_URL
  };
} 