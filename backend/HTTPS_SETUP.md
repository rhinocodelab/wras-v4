# HTTPS Setup for Audio Language Detection API

This guide explains how to set up HTTPS for the Audio Language Detection API using self-signed certificates that are shared between frontend and backend.

## Prerequisites

- OpenSSL installed on your system
- Python 3.8+ with required dependencies

## Generating Self-Signed Certificate

### Step 1: Generate Certificate

From the project root directory, use the provided script to generate a self-signed certificate:

```bash
./generate_cert.sh <YOUR_IP_ADDRESS>
```

**Example:**
```bash
./generate_cert.sh 192.168.1.100
```

This will create in the project root:
- `certs/server.crt` - SSL certificate (shared)
- `certs/server.key` - Private key (shared)

### Step 2: Start the Backend Server

From the backend directory, the `start.sh` script automatically detects if SSL certificates exist and starts the server accordingly:

```bash
cd backend
./start.sh
```

If certificates exist, the server will start with HTTPS on port 5001.
If no certificates are found, it will start with HTTP on port 5001.

## Manual Server Start

You can also start the server manually with HTTPS:

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 5001 --ssl-keyfile ../certs/server.key --ssl-certfile ../certs/server.crt --reload
```

## Frontend Configuration

The certificate files are now available at the project root level, making them accessible to both frontend and backend:

- Certificate: `./certs/server.crt`
- Private Key: `./certs/server.key`

Configure your frontend server (Next.js, React, etc.) to use these certificate files for HTTPS.

## Accessing the API

### With HTTPS (after certificate generation):
- API Base URL: `https://YOUR_IP_ADDRESS:5001`
- API Documentation: `https://YOUR_IP_ADDRESS:5001/docs`
- Health Check: `https://YOUR_IP_ADDRESS:5001/health`

### With HTTP (default):
- API Base URL: `http://YOUR_IP_ADDRESS:5001`
- API Documentation: `http://YOUR_IP_ADDRESS:5001/docs`
- Health Check: `http://YOUR_IP_ADDRESS:5001/health`

## Browser Security Warning

When using self-signed certificates, browsers will show a security warning. This is normal and expected. You can:

1. **Chrome/Edge**: Click "Advanced" → "Proceed to YOUR_IP_ADDRESS (unsafe)"
2. **Firefox**: Click "Advanced" → "Accept the Risk and Continue"
3. **Safari**: Click "Show Details" → "visit this website"

## Certificate Details

The generated certificate includes:
- Subject Alternative Names (SAN) for the specified IP address
- Localhost (127.0.0.1) support
- 365-day validity
- 2048-bit RSA key

## Troubleshooting

### Certificate Generation Fails
- Ensure OpenSSL is installed: `sudo apt install openssl`
- Check if the IP address is valid
- Verify write permissions in the backend directory

### Server Won't Start with HTTPS
- Check if certificate files exist in the `certs/` directory
- Verify file permissions: `chmod 600 certs/server.key`
- Check if port 5001 is available

### Browser Connection Issues
- Ensure the IP address in the certificate matches the server IP
- Check firewall settings for port 5001
- Verify the server is running and accessible

## Security Notes

⚠️ **Important**: Self-signed certificates are for development/testing only. For production use:
- Use certificates from a trusted Certificate Authority (CA)
- Consider using Let's Encrypt for free SSL certificates
- Implement proper certificate management and renewal