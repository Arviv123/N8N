# שרת MCP למינהל התכנון הישראלי

שרת Model Context Protocol (MCP) למינהל התכנון הישראלי המאפשר חיפוש תכניות, בדיקת הגבלות בנייה ועוד.

## פריסה מהירה ב-Render

### 1. העלה את הקבצים ל-GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. פרוס ב-Render
1. היכנס ל-[Render](https://render.com)
2. צור Web Service חדש
3. חבר את הrepository
4. הגדרות:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: `NODE_ENV=production`

### 3. בדוק שהשרת עובד
גש ל-`https://your-app.onrender.com/` ותראה:
```json
{
  "status": "running",
  "server": "Iplan MCP Server",
  "version": "1.0.0"
}
```

### 4. השתמש עם n8n
ב-n8n MCP Client Tool השתמש ב:
**SSE Endpoint**: `https://your-app.onrender.com/sse`

## השרת כולל כלים:
- `search_plans` - חיפוש תכניות
- `get_plan_details` - פרטי תכנית
- `search_by_location` - חיפוש לפי מיקום
- `get_building_restrictions` - הגבלות בנייה
- `get_infrastructure_data` - מידע תשתיות
- `get_conservation_sites` - אתרי שימור
- `get_comprehensive_location_data` - מידע מקיף על מיקום
- `check_service_status` - בדיקת סטטוס השירותים

## הרצה מקומית
```bash
npm install
npm run dev
```

השרת יעלה על: http://localhost:3000

## רישיון
MIT