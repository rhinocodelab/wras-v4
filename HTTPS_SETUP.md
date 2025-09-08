# HTTPS Setup for WRAS Application

This guide explains how to set up HTTPS for the entire WRAS application (both frontend and backend) using shared self-signed certificates.

## Overview

The application uses a single set of SSL certificates that are shared between:
- **Backend API** (FastAPI on port 5001)
- **Frontend** (Next.js application)

## Prerequisites

- OpenSSL installed on your system
- Node.js and Python 3.8+ with required dependencies

## Quick Start

### 1. Generate Shared Certificate

From the project root directory:

```bash
./generate_cert.sh <YOUR_IP_ADDRESS>
```

**Example:**
```bash
./generate_cert.sh 192.168.1.100
```

This creates shared certificates in `./certs/`:
- `server.crt` - SSL certificate
- `server.key` - Private key

### 2. Start Backend with HTTPS

```bash
cd backend
./start.sh
```

The backend will automatically detect the certificates and start with HTTPS on port 5001.

### 3. Start Frontend with HTTPS

The frontend is now configured to automatically use HTTPS when certificates are available:

**Automatic HTTPS Setup:**
- Custom Node.js server (`server.js`) automatically detects SSL certificates
- Starts Next.js with HTTPS support using shared certificates
- No additional configuration needed

**Available Commands:**
```bash
# Development with HTTPS
npm run dev:https

# Production with HTTPS  
npm run start:https

# Quick start frontend with HTTPS
./start-frontend-https.sh
```

**Manual HTTPS Server:**
```bash
# Using custom server with HTTPS
node server.js  # Uses ./certs/server.crt and ./certs/server.key
```

## Certificate Details

The generated certificate includes:
- **Subject Alternative Names (SAN)** for the specified IP address
- **Localhost support** (127.0.0.1)
- **365-day validity**
- **2048-bit RSA key**
- **Shared access** for both frontend and backend

## File Structure

```
wras-v4/
├── generate_cert.sh          # Certificate generation script
├── certs/                    # Shared certificate directory
│   ├── server.crt           # SSL certificate
│   └── server.key           # Private key
├── backend/
│   ├── start.sh             # Backend startup script (auto-detects HTTPS)
│   └── HTTPS_SETUP.md       # Backend-specific HTTPS documentation
└── frontend/                 # Frontend application
    └── ...                   # Configure to use ../certs/ files
```

## Accessing the Application

### With HTTPS (after certificate generation):
- **Backend API**: `https://YOUR_IP_ADDRESS:5001`
- **API Documentation**: `https://YOUR_IP_ADDRESS:5001/docs`
- **Frontend**: `https://YOUR_IP_ADDRESS:3000` (or your frontend port)

### With HTTP (default, no certificates):
- **Backend API**: `http://YOUR_IP_ADDRESS:5001`
- **API Documentation**: `http://YOUR_IP_ADDRESS:5001/docs`
- **Frontend**: `http://YOUR_IP_ADDRESS:3000` (or your frontend port)

## Browser Security Warning

When using self-signed certificates, browsers will show a security warning. This is normal and expected:

1. **Chrome/Edge**: Click "Advanced" → "Proceed to YOUR_IP_ADDRESS (unsafe)"
2. **Firefox**: Click "Advanced" → "Accept the Risk and Continue"
3. **Safari**: Click "Show Details" → "visit this website"

## Troubleshooting

### Certificate Generation Fails
```bash
# Install OpenSSL if not available
sudo apt install openssl

# Check if the IP address is valid
ping YOUR_IP_ADDRESS
```

### Backend Won't Start with HTTPS
```bash
# Check if certificate files exist
ls -la certs/

# Verify file permissions
chmod 600 certs/server.key
chmod 644 certs/server.crt
```

### Frontend HTTPS Issues
- Ensure your frontend server is configured to use `./certs/server.crt` and `./certs/server.key`
- Check that the IP address in the certificate matches your server IP
- Verify firewall settings for both frontend and backend ports

## Security Notes

⚠️ **Important**: Self-signed certificates are for development/testing only. For production use:
- Use certificates from a trusted Certificate Authority (CA)
- Consider using Let's Encrypt for free SSL certificates
- Implement proper certificate management and renewal
- Use proper domain names instead of IP addresses

## Development Workflow

1. **Generate certificate once**: `./generate_cert.sh YOUR_IP_ADDRESS`
2. **Start backend**: `cd backend && ./start.sh`
3. **Start frontend**: Configure to use `../certs/` files
4. **Access application**: Use HTTPS URLs in browser

The certificates are valid for 365 days and will work for both frontend and backend automatically.