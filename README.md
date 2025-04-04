# שירות תמלול סרטוני יוטיוב

שירות זה מאפשר תמלול אוטומטי של סרטוני יוטיוב באמצעות טכנולוגיית הזיהוי הקולי המתקדמת של ElevenLabs. השירות מקבל כתובת של סרטון יוטיוב ומחזיר תמלול טקסטואלי בפורמטים שונים: SRT (לכתוביות), טקסט רגיל או JSON (לעיבוד מתקדם).

## תכונות

- 🎬 תמלול סרטוני יוטיוב באמצעות הזנת כתובת URL או מזהה סרטון
- 📝 יצוא תמלול בפורמטים שונים (SRT, TXT, JSON)
- 🌐 זיהוי אוטומטי של שפה
- ⏱️ חותמות זמן מדויקות ברמת המילה הבודדת
- 🖥️ ממשק משתמש נוח לשימוש

## התקנה

### דרישות מקדימות

- Node.js (גרסה 14 ומעלה)
- npm (מנהל החבילות של Node.js)
- חשבון ElevenLabs עם מפתח API (ניתן להירשם בחינם ב-[elevenlabs.io](https://elevenlabs.io))
- חשבון RapidAPI עם מפתח API עבור שירות YouTube Search and Download

### שלבי התקנה

1. שכפל את המאגר:
```bash
git clone https://github.com/username/youtube-transcription.git
cd youtube-transcription
```

2. התקן את התלויות:
```bash
npm install
```

3. הגדר את מפתחות ה-API כמשתני סביבה:
```bash
export ELEVENLABS_API_KEY=your_elevenlabs_api_key
export RAPIDAPI_KEY=your_rapidapi_key
```

לחילופין, ניתן להגדיר את המפתחות בקובץ `.env` בתיקיית השורש של הפרויקט:
```
ELEVENLABS_API_KEY=your_elevenlabs_api_key
RAPIDAPI_KEY=your_rapidapi_key
```

4. הפעל את השרת:
```bash
npm start
```

השירות יהיה זמין בכתובת `http://localhost:3000`.

## שימוש

### ממשק משתמש גרפי

גש לכתובת `http://localhost:3000/transcribe-form` בדפדפן שלך. הזן את כתובת סרטון היוטיוב ובחר את פורמט התמלול הרצוי (SRT, TXT או JSON).

### באמצעות API

#### תמלול לפי כתובת URL

```
GET /transcribe?url=https://www.youtube.com/watch?v=VIDEO_ID&format=srt
```

#### תמלול לפי מזהה וידאו

```
GET /transcribe?id=VIDEO_ID&format=txt
```

#### פרמטרים

- `url`: כתובת URL של סרטון יוטיוב
- `id`: מזהה הסרטון ביוטיוב (אם לא סופקה כתובת URL)
- `format`: פורמט הפלט (ברירת מחדל: `srt`). אפשרויות: `srt`, `txt`, `json`

## דוגמאות

### תמלול לפורמט SRT

```
GET /transcribe?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&format=srt
```

### תמלול לפורמט טקסט

```
GET /transcribe?id=dQw4w9WgXcQ&format=txt
```

## פריסה לשירותי אירוח

ניתן לפרוס את השירות במגוון פלטפורמות אירוח כגון Render, Heroku, AWS, או Google Cloud. 

### פריסה ב-Render

1. ודא שיש לך חשבון ב-[Render](https://render.com)
2. צור שירות וב חדש
3. התחבר לחשבון GitHub שלך וגש למאגר
4. הגדר את הפרמטרים הבאים:
   - שם: `youtube-transcription-service`
   - Build Command: `npm install`
   - Start Command: `node server.js`
5. הוסף את משתני הסביבה `ELEVENLABS_API_KEY` ו-`RAPIDAPI_KEY`
6. לחץ על "Create Web Service"

## מגבלות וחשיבה עתידית

- השירות מוגבל על ידי מגבלות ה-API של ElevenLabs ו-RapidAPI
- הקפד לבדוק את תוכניות התמחור וגבולות השימוש של השירותים הללו
- פיתוח עתידי עשוי לכלול תמיכה בשפות נוספות, זיהוי דוברים, ואינטגרציה עם שירותי תמלול נוספים

## רישיון

פרויקט זה מופץ תחת רישיון MIT. ראה קובץ `LICENSE` לפרטים נוספים.
