# 🚀 Lumina Deployment Checklist

## Phase 1: Backend (Render)

- [ ] **Step 1:** Create GitHub repository and push code
  ```bash
  git init
  git add .
  git commit -m "Initial commit: Lumina"
  git push -u origin main
  ```

- [ ] **Step 2:** Create PostgreSQL on Render
  - Go to [render.com/dashboard](https://render.com/dashboard)
  - Create a new PostgreSQL database
  - Copy the `DATABASE_URL`

- [ ] **Step 3:** Deploy Backend Web Service
  - Create new Web Service in Render
  - Connect GitHub repo
  - **Root Directory:** `backend`
  - **Build Command:** `pip install -r requirements.txt`
  - **Start Command:** `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
  - **Health Check Path:** `/health`

- [ ] **Step 4:** Set Environment Variables in Render
  ```
  DATABASE_URL=postgresql://...  (from Step 2)
  JWT_SECRET=lumina-ai-secret
  TMDB_BEARER_TOKEN=<your-token>
  GOOGLE_BOOKS_API_KEY=<your-key>
  CORS_ORIGINS=https://your-frontend.vercel.app
  ENVIRONMENT=production
  ```

- [ ] **Step 5:** Test Backend
  - Wait for deployment (~3-5 mins)
  - Visit `https://lumina-api-xxxx.onrender.com/health`
  - Should return: `{"status":"ok"}`
  - Copy the backend URL for Step 8

---

## Phase 2: Frontend (Vercel)

- [ ] **Step 6:** Update Frontend Config
  - Edit `frontend/config.js`
  - Replace `https://your-render-api-url.onrender.com` with your actual backend URL from Step 5
  - Example: `https://lumina-api-abc123.onrender.com`

  ```javascript
  const API_URL = 'https://lumina-api-abc123.onrender.com';
  ```

- [ ] **Step 7:** Push Updated Config
  ```bash
  git add frontend/config.js
  git commit -m "Update API URL for production"
  git push
  ```

- [ ] **Step 8:** Deploy Frontend to Vercel
  - Go to [vercel.com](https://vercel.com)
  - Click "Add New..." → "Project"
  - Import your GitHub repository
  - **Framework:** Other
  - **Build Command:** (leave empty)
  - **Output Directory:** `frontend`
  - Click "Deploy"

- [ ] **Step 9:** Update CORS on Backend
  - Go back to Render backend settings
  - Update `CORS_ORIGINS` to include Vercel URL
  - Example: `https://lumina-yourusername.vercel.app`
  - Redeploy backend

- [ ] **Step 10:** Test Live App
  - Visit `https://lumina-yourusername.vercel.app`
  - Try logging in
  - Check browser console (F12) for errors
  - Test dashboard, search, recommendations

---

## ✅ Expected Results

### Backend (Render)
- ✅ Health check: `https://lumina-api-xxxx.onrender.com/health` → `{"status":"ok"}`
- ✅ Database check: `https://lumina-api-xxxx.onrender.com/db-check` → `{"db":"ok"}`
- ✅ API Docs: `https://lumina-api-xxxx.onrender.com/docs` (Swagger UI)

### Frontend (Vercel)
- ✅ Landing page loads
- ✅ Login page functional
- ✅ Can create account
- ✅ Recommendations load
- ✅ Search works
- ✅ No CORS errors in console

---

## 🐛 Troubleshooting

### Frontend shows "Cannot reach API"
- Check if `config.js` has correct backend URL
- Check browser console for specific errors (F12)
- Verify backend `CORS_ORIGINS` includes your frontend domain

### API returns 404 or 500
- Check Render dashboard logs
- Verify all environment variables are set
- Make sure database is initialized

### Login doesn't work
- Verify JWT_SECRET is set
- Check browser localStorage for access_token
- Review API logs in Render dashboard

### Pages are blank
- Check if config.js loaded (look in Network tab, F12)
- Verify all API endpoints are working
- Clear browser cache and reload

---

## 📊 Final Architecture

```
┌─────────────────────────────────────────────┐
│          Vercel Frontend                      │
│   https://lumina-yourusername.vercel.app     │
│  • index.html, login.html, dashboard.html    │
│  • All HTML/CSS/JS files                     │
│  • config.js points to Render backend        │
└──────────────┬──────────────────────────────┘
               │ HTTPS API calls
               │
┌──────────────▼──────────────────────────────┐
│       Render Backend API                      │
│   https://lumina-api-xxxx.onrender.com       │
│  • FastAPI server                            │
│  • Python v3.11                              │
│  • uvicorn                                   │
└──────────────┬──────────────────────────────┘
               │ SQL queries
               │
┌──────────────▼──────────────────────────────┐
│   Render PostgreSQL Database                  │
│   oregon-postgres.render.com:5432            │
│  • Users, preferences, watchlist             │
│  • All data persistence                      │
└──────────────────────────────────────────────┘
```

---

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)
- [PostgreSQL Render Setup](https://render.com/docs/databases)

---

## ✨ Success!

Once all steps are complete, you have a fully deployed Lumina app!

**Share with friends:** `https://lumina-yourusername.vercel.app`

