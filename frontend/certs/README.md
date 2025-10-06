# SSL Certificates for Local Development

This directory contains SSL certificates for running the cyberEye frontend with HTTPS support during local development.

## Certificate Files

- `localhost-key.pem` - Private key for SSL/TLS
- `localhost.pem` - SSL certificate

**Note**: These files are gitignored and not committed to the repository for security reasons.

## Generating SSL Certificates

If the certificates don't exist, you need to generate them using OpenSSL:

```bash
# Navigate to the frontend directory
cd frontend

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

This will create:
- A 2048-bit RSA private key (`localhost-key.pem`)
- A self-signed certificate valid for 365 days (`localhost.pem`)

## Using the Certificates

The certificates are automatically loaded by Vite when starting the development server:

```bash
npm run dev
```

The frontend will be available at `https://localhost:8080`

## Browser Trust Warning

Since these are self-signed certificates, your browser will show a security warning when you first visit `https://localhost:8080`. This is expected behavior for development environments.

**To proceed:**
- In Chrome/Edge: Click "Advanced" and then "Proceed to localhost (unsafe)"
- In Firefox: Click "Advanced" and then "Accept the Risk and Continue"
- In Safari: Click "Show Details" and then "visit this website"

## Production Certificates

For production deployments, you should:
1. Obtain proper SSL certificates from a trusted Certificate Authority (CA) like Let's Encrypt
2. Configure your web server (nginx, Apache, etc.) to use these certificates
3. Never use self-signed certificates in production

## Security Notes

- Private keys should never be committed to version control
- These certificates are for local development only
- Regenerate certificates periodically (at least annually)
- Each developer should generate their own local certificates
