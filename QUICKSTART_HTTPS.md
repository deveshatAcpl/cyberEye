# Quick Start: HTTPS Setup

Get CyberEye running with HTTPS in 5 minutes!

## Prerequisites

- Python 3.12+
- Node.js 20+
- OpenSSL (usually pre-installed on Linux/Mac)

## Step 1: Clone the Repository

```bash
git clone https://github.com/deveshatAcpl/cyberEye.git
cd cyberEye
```

## Step 2: Generate SSL Certificates (One-time setup)

```bash
# Generate certificates for backend
cd backend
mkdir -p certs
cd certs
openssl req -x509 -newkey rsa:2048 -keyout localhost-key.pem -out localhost.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Development/CN=localhost"
cd ../..

# Copy certificates to frontend
cd frontend
mkdir -p certs
cp ../backend/certs/localhost-key.pem certs/
cp ../backend/certs/localhost.pem certs/
cd ..
```

**Done!** Certificates are created and will work for 365 days.

## Step 3: Setup Backend

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure environment (optional - use defaults)
cp .env.example .env
# Edit .env to add your CVE_API_TOKEN if you have one

# Start backend
python main.py
```

You should see:
```
🔒 Starting server with HTTPS on port 8000
```

**Leave this terminal running** and open a new one for the frontend.

## Step 4: Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start frontend
npm run dev
```

You should see:
```
➜  Local:   https://localhost:8080/
```

## Step 5: Access the Application

1. Open your browser
2. Navigate to: **https://localhost:8080**
3. Click through the security warning:
   - Chrome: "Advanced" → "Proceed to localhost"
   - Firefox: "Advanced" → "Accept the Risk and Continue"

**That's it!** 🎉

## Verify Everything Works

Open browser DevTools (F12) and check:
- ✅ Page loads from `https://localhost:8080`
- ✅ API calls go to `https://localhost:8000`
- ✅ No mixed content warnings

## Common Issues

### "SSL certificates not found"

**Solution**: Make sure you ran the certificate generation commands in Step 2.

### Can't connect to backend

**Solution**: 
1. Verify backend is running: `curl -k https://localhost:8000/`
2. Should return: `{"message":"CVE Dashboard API",...}`

### Port already in use

**Solution**:
```bash
# Kill process on port 8000
lsof -i :8000
kill -9 <PID>

# Kill process on port 8080  
lsof -i :8080
kill -9 <PID>
```

## Next Steps

- Read the full [HTTPS Setup Guide](HTTPS_SETUP.md) for production deployment
- Check out the [main README](README.md) for features and usage
- Configure your CVE API token in `backend/.env` for real data

## Need Help?

- See [HTTPS_SETUP.md](HTTPS_SETUP.md) for detailed troubleshooting
- Check [README.md](README.md) for general documentation
- Open an issue on GitHub

---

**Note**: The self-signed certificates are only for local development. For production, use proper SSL certificates from a trusted Certificate Authority like Let's Encrypt.
