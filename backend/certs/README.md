# SSL Certificates for Backend API

This directory contains SSL certificates for running the cyberEye backend API with HTTPS support.

## Certificate Files

- `localhost-key.pem` - Private key for SSL/TLS
- `localhost.pem` - SSL certificate

**Note**: These files are gitignored and not committed to the repository for security reasons.

## Certificate Generation

The backend uses the same certificates as the frontend. To generate them:

```bash
# Navigate to the backend directory
cd backend

# Create the certs directory if it doesn't exist
mkdir -p certs
cd certs

# Generate self-signed SSL certificate
openssl req -x509 -newkey rsa:2048 \
  -keyout localhost-key.pem \
  -out localhost.pem \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=State/L=City/O=Development/CN=localhost"
```

## Backend Configuration

The backend is configured to use HTTPS via environment variables in `.env`:

```bash
SSL_KEYFILE=./certs/localhost-key.pem
SSL_CERTFILE=./certs/localhost.pem
```

## Running with HTTPS

When you start the backend with `python main.py`, it will automatically:
1. Check for SSL certificate files
2. If found, start with HTTPS on port 8000
3. If not found, fall back to HTTP with a warning

```bash
python main.py
```

The backend API will be available at `https://localhost:8000`

## API Documentation

With HTTPS enabled:
- API Documentation: `https://localhost:8000/docs`
- Alternative Documentation: `https://localhost:8000/redoc`
- Root Endpoint: `https://localhost:8000/`

## Production Deployment

For production:
1. Use certificates from a trusted Certificate Authority (Let's Encrypt, DigiCert, etc.)
2. Configure proper security headers
3. Enable certificate validation
4. Use a reverse proxy (nginx, Apache) for SSL termination
5. Update the `CORS_ORIGINS` in `.env` to include your production domain

## Security Notes

- Private keys must never be committed to version control
- Use self-signed certificates only for local development
- Regenerate certificates before they expire
- Keep certificates secure and restrict file permissions:
  ```bash
  chmod 600 localhost-key.pem
  chmod 644 localhost.pem
  ```
