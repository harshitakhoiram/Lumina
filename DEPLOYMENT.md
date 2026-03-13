# Lumina Deployment Guide

## Overview

This guide walks through deploying Lumina to production. The app consists of:
- **Backend**: FastAPI Python server
- **Database**: PostgreSQL
- **Frontend**: Static HTML/CSS/JS files

## Prerequisites

- Docker & Docker Compose (for local testing)
- A cloud account (Render, Railway, or Heroku)
- API keys:
  - `GOOGLE_BOOKS_API_KEY` (from Google Cloud Console)
  - `TMDB_BEARER_TOKEN` (from TMDB)

## Option 1: Deploy to Render (Recommended)

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/lumina.git
git push -u origin main
```

### Step 2: Create PostgreSQL Database on Render
1. Go to [render.com](https://render.com)
2. Click "New +" → "PostgreSQL"
3. Name: `lumina-postgres`
4. Copy the connection string (Internal Database URL)

### Step 3: Deploy Backend
1. Click "New +" → "Web Service"
2. Connect your GitHub repo
3. Use these settings:
   - **Name**: `lumina-api`
   - **Runtime**: Python 3
  - **Root Directory**: `backend`
  - **Build Command**: `pip install -r requirements.txt`
  - **Start Command**: `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
  - **Health Check Path**: `/health`
4. Add environment variables:
   ```
   DATABASE_URL=postgresql://...  (from step 2)
   JWT_SECRET=<run: python -c "import secrets; print(secrets.token_urlsafe(32))">
   GOOGLE_BOOKS_API_KEY=your-api-key
   TMDB_BEARER_TOKEN=your-token
   CORS_ORIGINS=https://your-frontend-url.com,https://www.your-frontend-url.com
   ENVIRONMENT=production
   ```
5. Click "Create Web Service"

### Step 4: Deploy Frontend
Option A: Deploy static files to Render
1. Click "New +" → "Static Site"
2. Connect GitHub repo
3. Build Command: (leave empty)
4. Publish Directory: `frontend`

Option B: Host on a CDN (Vercel, Netlify)
1. Push `frontend/` folder to Vercel
2. Update `CORS_ORIGINS` to include your Vercel domain

## Option 2: Deploy with Docker Compose (Local)

### Quick Start
```bash
# Create local .env file
cp backend/.env.example backend/.env

# Edit backend/.env with your API keys and a strong JWT_SECRET

# Start services
docker-compose up
```

Access the API at `http://localhost:8000`

### Generate a Strong JWT Secret
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Option 3: Deploy to Railway

1. Go to [railway.app](https://railway.app)
2. Create new project
3. Add PostgreSQL plugin
4. Add Web Service from GitHub
5. Set environment variables same as Render (step 3)
6. Deploy!

## Environment Variables (Production)

| Variable | Required | Example |
|----------|----------|---------|
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Yes | 32+ character random string |
| `GOOGLE_BOOKS_API_KEY` | Yes | From Google Cloud Console |
| `TMDB_BEARER_TOKEN` | Yes | From TMDB API |
| `CORS_ORIGINS` | Yes | `https://myapp.com,https://www.myapp.com` |
| `ENVIRONMENT` | No | `production` |

## Database Initialization

When deploying, you need to run database migrations:

```bash
# On Render: Add pre-deploy command to run schema
```

The database schema is in `backend/schema.sql`. Most cloud providers allow you to run SQL on creation.

## Pre-Deployment Checklist

- [ ] Update `CORS_ORIGINS` in `.env` with your domain
- [ ] Generate strong `JWT_SECRET` (32+ chars)
- [ ] Set all required API keys
- [ ] Test locally with `docker-compose up`
- [ ] Verify database connectivity
- [ ] Test auth endpoints
- [ ] Test recommendation endpoints
- [ ] Frontend configured to call production API

## Testing Production Deployment

```bash
# Check API health
curl https://your-api-url.com/health

# Check database connection
curl https://your-api-url.com/db-check

# Test auth (create user, get token)
curl -X POST https://your-api-url.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

## Troubleshooting

### CORS Errors
- Check `CORS_ORIGINS` includes your frontend domain
- Don't include trailing slashes
- For development: allow `http://localhost:*`

### Database Connection Errors
- Verify `DATABASE_URL` format: `postgresql://user:pass@host:port/db`
- Check firewall/network rules
- Ensure database is running and initialized

### 500 Errors
- Check cloud provider logs
- Verify all environment variables are set
- Check JWT_SECRET is not default

### Static Files Not Loading
- Ensure `frontend/` is deployed separately or served via CDN
- Update frontend API_BASE_URL to point to deployed backend

## Scaling & Maintenance

- Monitor API performance in Render/Railway dashboard
- Set up error tracking (Sentry integration)
- Run database backups regularly
- Keep dependencies updated
- Monitor API rate limits

## Security Considerations

1. **Always use HTTPS** in production
2. **Rotate JWT_SECRET** if compromised
3. **Use strong passwords** for database
4. **Enable IP whitelisting** on database if possible
5. **Set ENVIRONMENT=production** to disable debug mode
6. **Keep .env files out of version control** (use .gitignore)

## Rollback

If deployment fails:
1. Render: Click "Revert to Previous Deploy" in dashboard
2. Railway: Use deployment history
3. Revert git commit and push again

## Support

For issues:
- Check cloud provider documentation
- Review app logs in console
- Verify environment variables
- Test locally first with `docker-compose`
