# Frontend Deployment Guide

Your frontend HTML/CSS/JS files can be deployed using one of these options:

## Option 1: Deploy to Vercel (Recommended - Free & Easy)

### Step 1: Connect GitHub Repository
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Select your GitHub repository
4. Click "Import"

### Step 2: Set Build Settings
1. **Framework Preset:** Other
2. **Build Command:** (leave empty)
3. **Output Directory:** `frontend`
4. **Install Command:** (leave empty)

### Step 3: Add Environment Variable
1. Go to your deployment settings
2. Add environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://your-render-api-url.onrender.com
   ```
   (Replace `your-render-api-url` with your actual Render backend URL)

### Step 4: Deploy
- Click "Deploy"
- Your frontend will be live at: `https://your-project.vercel.app`

### Step 5: Update Frontend Config
Once your Render API is deployed and you know the URL, update `frontend/config.js`:
```javascript
const API_URL = 'https://lumina-api-xxxx.onrender.com';
```

Then git push to redeploy.

---

## Option 2: Deploy to Netlify (Free)

### Step 1: Connect Repository
1. Go to [netlify.com](https://netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Select GitHub and your repository

### Step 2: Build Settings
- **Build command:** (leave empty)
- **Publish directory:** `frontend`
- **Build settings:** Basic

### Step 3: Add Environment Variables
Not needed for static site, but update config.js with API URL

### Step 4: Deploy
- Netlify auto-deploys when you git push
- Your site will be at: `https://your-project.netlify.app`

---

## Option 3: Deploy to Render (Static Site)

### Step 1: Create Static Site on Render
1. Go to [render.com](https://render.com)
2. Click "New +" → "Static Site"
3. Connect your GitHub repository

### Step 2: Configure
- **Name:** `lumina-frontend`
- **Build Command:** (leave empty)
- **Publish Directory:** `frontend`

### Step 3: Deploy
- Click "Create Static Site"
- Your frontend will be at: `https://lumina-frontend-xxxx.onrender.com`

---

## After Deploying Backend to Render

Once your backend is live on Render, you'll get a URL like:
```
https://lumina-api-xxxx.onrender.com
```

### Update Frontend Config
1. Update `frontend/config.js`:
```javascript
const API_URL = 'https://lumina-api-xxxx.onrender.com';
```

2. Git commit and push:
```bash
git add frontend/config.js
git commit -m "Update API URL for production"
git push
```

3. Your deployment platform will auto-redeploy

---

## How It Works

1. **config.js** sets the global API URL
2. All your JS files use `API_BASE_URL`, `API_BASE`, or `WATCHLIST_API_BASE`
3. On localhost: requests go to `http://localhost:8000`
4. On production: requests go to your Render backend

---

## Testing Locally

```bash
# In your browser, open:
file:///C:/Users/VivoBook/OneDrive/Documents/CS_Project/Lumina/frontend/index.html

# Or use Python's local server:
cd frontend
python -m http.server 5500
# Then visit http://localhost:5500
```

---

## Troubleshooting

### CORS Errors
- Make sure `CORS_ORIGINS` in your Render backend includes your frontend domain
- Example: `https://your-frontend.vercel.app`

### 404 on API Calls
- Verify `config.js` has the correct backend URL
- Make sure backend is deployed and online

### Blank Page or No Content
- Check browser console for errors (F12)
- Verify API is responding at `/health` endpoint
- Check that auth token is stored correctly in localStorage

---

## Quick Deployment Steps (Summary)

1. ✅ Backend tested and working locally
2. Push to GitHub
3. Deploy backend to Render (gets URL like `lumina-api-xxxx.onrender.com`)
4. Update `frontend/config.js` with backend URL
5. Deploy frontend to Vercel/Netlify/Render
6. Test the live app!

---

## File Structure After Deployment

Your deployed files will look like:

```
frontend/
├── index.html           (landing page)
├── login.html           (login page)
├── dashboard.html       (main app)
├── detail.html          (content detail page)
├── search.html          (search page)
├── profile.html         (user profile)
├── watchlist.html       (watchlist)
├── onboarding.html      (onboarding flow)
├── config.js            ⭐ REPLACES localhost with production URL
├── assests/
│   ├── css/
│   ├── js/
│   │   ├── dashboard.js
│   │   ├── detail.js
│   │   ├── login.js
│   │   ├── profile.js
│   │   ├── search.js
│   │   ├── watchlist-api.js
│   │   └── ...
│   └── LuminaLogo.png
```
