# HTTPS Setup Guide for CyberEye

This guide provides detailed instructions for setting up HTTPS on the CyberEye application for local development and production deployment.

## Table of Contents

1. [Overview](#overview)
2. [Local Development Setup](#local-development-setup)
3. [Configuration Details](#configuration-details)
4. [Testing HTTPS Setup](#testing-https-setup)
5. [Production Deployment](#production-deployment)
6. [Troubleshooting](#troubleshooting)

## Overview

CyberEye uses HTTPS for secure communication between:
- Frontend (React + Vite) running on `https://localhost:8080`
- Backend (FastAPI + Uvicorn) running on `https://localhost:8000`

### Architecture

```
┌─────────────────┐         HTTPS Proxy         ┌─────────────────┐
│   Frontend      │  ─────────────────────────► │   Backend       │
│   Vite Dev      │  ◄─────────────────────────  │   FastAPI       │
│   localhost:8080│         (via /api)          │   localhost:8000│
└─────────────────┘                             └─────────────────┘
      HTTPS                                           HTTPS
  (Self-signed)                                  (Self-signed)
```

## Local Development Setup

### Prerequisites

- **OpenSSL**: For generating SSL certificates
- **Python 3.12+**: For backend server
- **Node.js 20+**: For frontend development server

### Step 1: Generate SSL Certificates

You only need to generate certificates once per development machine.

#### Option A: Generate for Backend (Recommended)

```bash
# Navigate to backend directory
cd backend

# Create certs directory
mkdir -p certs
cd certs

# Generate self-signed certificate
openssl req -x509 -newkey rsa:2048 \
  -keyout localhost-key.pem \
  -out localhost.pem \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=State/L=City/O=Development/CN=localhost"

# Verify files were created
ls -la
# You should see: localhost-key.pem and localhost.pem
```

#### Option B: Copy Certificates to Frontend

```bash
# From the root directory
cd frontend
mkdir -p certs

# Copy certificates from backend
cp ../backend/certs/localhost-key.pem certs/
cp ../backend/certs/localhost.pem certs/

# Verify
ls -la certs/
```

#### Option C: Generate Separately for Frontend

```bash
cd frontend
mkdir -p certs
cd certs

openssl req -x509 -newkey rsa:2048 \
  -keyout localhost-key.pem \
  -out localhost.pem \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=State/L=City/O=Development/CN=localhost"
```

### Step 2: Configure Backend

#### Backend Environment Variables

The backend `.env` file should include:

```bash
# SSL Configuration
SSL_KEYFILE=./certs/localhost-key.pem
SSL_CERTFILE=./certs/localhost.pem

# CORS Origins (include HTTPS frontend URL)
CORS_ORIGINS=https://localhost:8080,http://localhost:8080
```

#### Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

#### Start Backend

```bash
python main.py
```

You should see:
```
🔒 Starting server with HTTPS on port 8000
   SSL Key: ./certs/localhost-key.pem
   SSL Cert: ./certs/localhost.pem
INFO:     Uvicorn running on https://0.0.0.0:8000
```

### Step 3: Configure Frontend

#### Frontend Environment Variables

Create or update `frontend/.env`:

```bash
# Backend API Configuration
VITE_API_BASE_URL=https://localhost:8000
```

#### Install Frontend Dependencies

```bash
cd frontend
npm install
```

#### Start Frontend

```bash
npm run dev
```

You should see:
```
VITE v5.4.19  ready in 211 ms

➜  Local:   https://localhost:8080/
➜  Network: https://10.x.x.x:8080/
```

### Step 4: Access the Application

1. Open your browser and navigate to: `https://localhost:8080`

2. You will see a security warning about the self-signed certificate:
   - **Chrome/Edge**: Click "Advanced" → "Proceed to localhost (unsafe)"
   - **Firefox**: Click "Advanced" → "Accept the Risk and Continue"
   - **Safari**: Click "Show Details" → "visit this website"

3. The application should load successfully

## Configuration Details

### Frontend Configuration (vite.config.ts)

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, "./certs/localhost-key.pem")),
      cert: fs.readFileSync(path.resolve(__dirname, "./certs/localhost.pem")),
    },
    proxy: {
      '/api': {
        target: 'https://localhost:8000',
        changeOrigin: true,
        secure: false, // Allow self-signed certificates
      },
    },
  },
  // ... rest of config
}));
```

### Backend Configuration (main.py)

```python
if __name__ == "__main__":
    import uvicorn
    
    ssl_keyfile = os.getenv("SSL_KEYFILE", "./certs/localhost-key.pem")
    ssl_certfile = os.getenv("SSL_CERTFILE", "./certs/localhost.pem")
    
    if os.path.exists(ssl_keyfile) and os.path.exists(ssl_certfile):
        print(f"🔒 Starting server with HTTPS on port 8000")
        uvicorn.run(
            app, 
            host="0.0.0.0", 
            port=8000, 
            ssl_keyfile=ssl_keyfile,
            ssl_certfile=ssl_certfile
        )
    else:
        print(f"⚠️  SSL certificates not found. Starting with HTTP")
        uvicorn.run(app, host="0.0.0.0", port=8000)
```

## Testing HTTPS Setup

### Test Backend HTTPS

```bash
# Test root endpoint
curl -k https://localhost:8000/

# Expected response:
# {"message":"CVE Dashboard API","version":"1.0.0",...}
```

### Test Backend API Endpoint

```bash
# Test API connection endpoint
curl -k https://localhost:8000/api/cve/test

# Expected response (may show error if no API token configured):
# {"status":"error","message":"API connection failed",...}
```

### Test Frontend HTTPS

```bash
# Test frontend is serving over HTTPS
curl -k -I https://localhost:8080/

# Expected response:
# HTTP/1.1 200 OK
# Content-Type: text/html
```

### Test Frontend-Backend Communication

```bash
# Test proxy from frontend to backend
curl -k https://localhost:8080/api/cve/test

# Expected response (same as direct backend call):
# {"status":"error","message":"API connection failed",...}
```

### Verify in Browser

1. Open browser DevTools (F12)
2. Go to Network tab
3. Navigate to `https://localhost:8080`
4. Check that all requests use HTTPS protocol
5. Verify requests to `/api/*` are proxied to backend

## Production Deployment

### Using Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot

# Generate certificate (replace with your domain)
sudo certbot certonly --standalone -d your-domain.com

# Certificates will be stored in:
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

### Backend Production Configuration

Update `backend/.env`:

```bash
SSL_KEYFILE=/etc/letsencrypt/live/your-domain.com/privkey.pem
SSL_CERTFILE=/etc/letsencrypt/live/your-domain.com/fullchain.pem
CORS_ORIGINS=https://your-domain.com
```

### Frontend Production Configuration

Update `frontend/.env`:

```bash
VITE_API_BASE_URL=https://api.your-domain.com
```

Build frontend:

```bash
cd frontend
npm run build
```

### Using Nginx Reverse Proxy (Recommended for Production)

Create `/etc/nginx/sites-available/cybereye`:

```nginx
# Backend API
server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Frontend
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    root /var/www/cybereye/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass https://api.your-domain.com;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com api.your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/cybereye /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Troubleshooting

### Issue: "SSL certificate not found" Error

**Symptoms**: Backend starts with HTTP instead of HTTPS

**Solution**:
```bash
# Verify certificates exist
ls -la backend/certs/

# If missing, generate them
cd backend/certs
openssl req -x509 -newkey rsa:2048 -keyout localhost-key.pem -out localhost.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Development/CN=localhost"
```

### Issue: Frontend Can't Connect to Backend

**Symptoms**: Network errors in browser console

**Solution**:
1. Verify backend is running on HTTPS:
   ```bash
   curl -k https://localhost:8000/
   ```

2. Check `VITE_API_BASE_URL` in `frontend/.env`:
   ```bash
   VITE_API_BASE_URL=https://localhost:8000
   ```

3. Verify CORS settings in `backend/.env`:
   ```bash
   CORS_ORIGINS=https://localhost:8080,http://localhost:8080
   ```

4. Restart both servers

### Issue: "NET::ERR_CERT_AUTHORITY_INVALID" in Browser

**Symptoms**: Browser blocks the page with certificate error

**Solution**:
This is expected for self-signed certificates. Click "Advanced" and proceed to localhost. For production, use proper SSL certificates from a trusted CA.

### Issue: Vite Can't Read Certificate Files

**Symptoms**: Error starting Vite dev server

**Solution**:
```bash
# Check file permissions
ls -la frontend/certs/

# Key file should be readable
chmod 644 frontend/certs/localhost-key.pem
chmod 644 frontend/certs/localhost.pem

# Verify path in vite.config.ts matches actual location
```

### Issue: Certificate Expired

**Symptoms**: Browser shows "NET::ERR_CERT_DATE_INVALID"

**Solution**:
```bash
# Check certificate expiration
openssl x509 -in frontend/certs/localhost.pem -noout -dates

# If expired, regenerate
cd frontend/certs
rm localhost-key.pem localhost.pem
openssl req -x509 -newkey rsa:2048 -keyout localhost-key.pem -out localhost.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Development/CN=localhost"
```

### Issue: Mixed Content Warnings

**Symptoms**: Some resources load over HTTP instead of HTTPS

**Solution**:
1. Check all hardcoded URLs in code are using HTTPS
2. Use environment variables instead of hardcoded URLs
3. Search for `http://` in codebase:
   ```bash
   grep -r "http://localhost" frontend/src/
   ```

### Issue: Port Already in Use

**Symptoms**: "Address already in use" error

**Solution**:
```bash
# Find process using port 8000 (backend)
lsof -i :8000
kill -9 <PID>

# Find process using port 8080 (frontend)
lsof -i :8080
kill -9 <PID>
```

## Security Best Practices

### Development

1. **Never commit private keys** to version control
2. **Use .gitignore** to exclude `*.pem` files
3. **Regenerate certificates** every 365 days
4. **Use different certificates** for each developer

### Production

1. **Use trusted CA certificates** (Let's Encrypt, etc.)
2. **Enable HSTS** (HTTP Strict Transport Security)
3. **Use strong cipher suites**
4. **Implement certificate pinning** if needed
5. **Monitor certificate expiration**
6. **Use automated renewal** (Certbot cron job)
7. **Implement CSP** (Content Security Policy)
8. **Enable OCSP stapling**

### Example HSTS Header (Nginx)

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

### Example Security Headers (Nginx)

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

## Additional Resources

- [Vite HTTPS Documentation](https://vitejs.dev/config/server-options.html#server-https)
- [Uvicorn SSL Documentation](https://www.uvicorn.org/#running-with-https)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [OpenSSL Documentation](https://www.openssl.org/docs/)
- [OWASP TLS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Protection_Cheat_Sheet.html)

## Support

For issues or questions:
- Check the [Troubleshooting](#troubleshooting) section above
- Review the main [README.md](README.md) for general setup
- Open an issue on the [GitHub repository](https://github.com/deveshatAcpl/cyberEye/issues)
