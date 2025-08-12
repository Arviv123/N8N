# פריסה ב-Render - מדריך שלב אחר שלב

## 1. הכנת הקבצים הנדרשים

### package.json
```json
{
  "name": "iplan-mcp-server",
  "version": "1.0.0",
  "description": "MCP Server for Israel Planning Authority",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node server.js http $PORT 0.0.0.0",
    "dev": "node server.js http 3000",
    "build": "echo 'No build step required'"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "node-fetch": "^3.3.2"
  },
  "keywords": ["mcp", "israel", "planning", "n8n", "automation"],
  "author": "Your Name",
  "license": "MIT"
}
```

### render.yaml (אופציונלי - לאוטומציה)
```yaml
services:
  - type: web
    name: iplan-mcp-server
    env: node
    repo: https://github.com/yourusername/iplan-mcp-server
    buildCommand: npm install
    startCommand: node server.js http $PORT 0.0.0.0
    plan: free
    envVars:
      - key: NODE_ENV
        value: production
      - key: CORS_ORIGIN
        value: "*"
```

## 2. הגדרות ב-Render Dashboard

### Environment Variables שכדאי להוסיף:
- `NODE_ENV` = `production`
- `CORS_ORIGIN` = `*` (או כתובת n8n הספציפית שלך)

### Build & Deploy Settings:
- **Build Command**: `npm install`
- **Start Command**: `node server.js http $PORT 0.0.0.0`
- **Node Version**: 18.x או חדש יותר

## 3. בדיקת הפריסה

### בדוק את הlogs:
1. לך ל-Dashboard שלך ב-Render
2. בדוק שרואה הודעות כמו:
```
🚀 Iplan MCP Server running on http://0.0.0.0:10000
📊 Health check: http://0.0.0.0:10000/
🔗 SSE endpoint for n8n: http://0.0.0.0:10000/sse
```

### בדוק את הendpoints:
```bash
# Health check
curl https://your-app.onrender.com/

# Server info
curl https://your-app.onrender.com/info

# בדיקת SSE (אמור להחזיר text/event-stream)
curl -H "Accept: text/event-stream" https://your-app.onrender.com/sse
```

## 4. חיבור ל-n8n

### ב-n8n MCP Client Tool:
- **SSE Endpoint**: `https://your-app.onrender.com/sse`
- השאר את שאר השדות ריקים אלא אם יש authentication specific

## 5. פתרון בעיות נפוצות

### אם השרת לא מתחיל:
1. **בדוק את הlogs ב-Render**:
   - האם יש שגיאות בinstallation?
   - האם הport נקרא נכון ($PORT)?

2. **וודא שה-Start Command נכון**:
   ```
   node server.js http $PORT 0.0.0.0
   ```

3. **בדוק את Dependencies**:
   - האם כל החבילות התקינו בהצלחה?

### אם יש בעיות SSE:
1. **CORS Headers** - וודא שמוגדר נכון:
   ```javascript
   res.writeHead(200, {
       'Content-Type': 'text/event-stream',
       'Cache-Control': 'no-cache',
       'Connection': 'keep-alive',
       'Access-Control-Allow-Origin': '*'
   });
   ```

2. **Render Timeout** - Render עלול לנתק חיבורים ארוכים:
   - השרת שלנו שולח keep-alive messages
   - אם עדיין יש בעיה, נוסיף heartbeat

### אם n8n לא מתחבר:
1. **בדוק שה-URL נכון**: `https://your-app.onrender.com/sse`
2. **בדוק logs של Render**: האם יש בקשות מגיעות?
3. **נסה בדפדפן**: לך ל-`https://your-app.onrender.com/` - אמור להראות status page

## 6. Render Free Plan מגבלות

### זכור ש-Render Free יש לו:
- **Sleep אחרי 15 דקות חוסר פעילות**
- **750 שעות חופשיות בחודש**
- **Cold start של 30+ שניות**

### לשמירת השרת ער:
```javascript
// בתוך server.js - heartbeat לעצמנו כל 10 דקות
if (process.env.NODE_ENV === 'production') {
    setInterval(async () => {
        try {
            await fetch(`http://localhost:${process.env.PORT || 3000}/`);
            console.log('Heartbeat sent');
        } catch (error) {
            console.log('Heartbeat failed:', error.message);
        }
    }, 10 * 60 * 1000); // 10 minutes
}
```

## 7. עקיבה ומניטור

### Logs חשובים לעקוב:
- הודעות startup של השרת
- בקשות MCP מ-n8n
- שגיאות API של מינהל התכנון
- SSE connection events

### מטריקות לבדוק:
- Response time של הendpoints
- Memory usage (Render מראה בdashboard)
- מספר active SSE connections

## 8. שדרוג לPaid Plan (אם נחוץ)

### מתי לשקול שדרוג:
- אם השרת נרדם יותר מדי
- אם צריך custom domain
- אם צריך יותר מ-750 שעות

### Starter Plan ($7/חודש) נותן:
- No sleep
- Custom domains
- More resources
- Faster builds

---

## טיפים מעשיים:

1. **תמיד בדוק את הlogs תחילה** - רוב הבעיות נראות שם
2. **השתמש בcurl לבדיקות** - לפני שמנסה עם n8n
3. **שמור את הURLs** - תצטרך אותם לn8n configuration
4. **עקוב אחר המגבלות** - Render Free מוגבל

האם אתה רואה שגיאות ספציפיות בlogs? אני יכול לעזור לפתור אותן!