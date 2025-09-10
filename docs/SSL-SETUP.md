# SSL Certificate Setup and Dynamic Configuration

This document explains how to set up SSL certificates and configure the application to use dynamic IP addresses.

## 🚀 Quick Setup

### 1. Generate SSL Certificates and Update Configuration

```bash
# Generate SSL certificates and update configuration in one command
./scripts/generate-ssl-cert.sh 192.168.1.34

# Or using npm script
npm run setup-server 192.168.1.34

# For external IP addresses
./scripts/generate-ssl-cert.sh 27.107.17.167
```

### 2. Start the HTTPS Server

```bash
# Development with HTTPS
npm run dev:https

# Production with HTTPS
npm run start:https
```

## 📁 Configuration Files

### `config/server.json`
Main configuration file that contains:
- Server IP address
- Port number
- SSL certificate paths
- Protocol settings

```json
{
  "server": {
    "ip": "27.107.17.167",
    "port": 5001,
    "protocol": "https",
    "domain": "27.107.17.167"
  },
  "ssl": {
    "enabled": true,
    "certPath": "./certs/cert.pem",
    "keyPath": "./certs/private.key"
  },
  "environment": "production"
}
```

## 🔧 Available Scripts

| Script | Description |
|--------|-------------|
| `./scripts/generate-ssl-cert.sh <IP>` | Generate SSL certificates and update configuration (removes old certs first) |
| `npm run setup-server <IP>` | Generate SSL certificates and update configuration |
| `./scripts/cleanup-certificates.sh` | Remove all existing SSL certificates |
| `npm run cleanup-certs` | Remove all existing SSL certificates |
| `npm run generate-ssl` | Generate SSL certificates (requires existing config) |
| `npm run update-ip <IP>` | Update IP address in configuration only |
| `npm run dev:https` | Start development server with HTTPS |
| `npm run start:https` | Start production server with HTTPS |

## 🔐 SSL Certificate Details

### Certificate Location
- **Certificate**: `certs/cert.pem`
- **Private Key**: `certs/private.key`

### Certificate Information
- **Type**: Self-signed certificate
- **Validity**: 365 days
- **Subject**: CN=27.107.17.167
- **Subject Alternative Names**: IP:27.107.17.167, DNS:localhost

### Security Notes
- This is a **self-signed certificate** for development/testing
- For production, consider using a certificate from a trusted CA
- You can use Let's Encrypt for free SSL certificates

## 🌐 Dynamic Configuration Usage

### Backend Usage
```typescript
import { getServerConfig, getServerUrl, getServerIP } from '@/lib/config';

// Get full configuration
const config = getServerConfig();

// Get server URL
const serverUrl = getServerUrl(); // https://27.107.17.167:5001

// Get server IP
const serverIP = getServerIP(); // 27.107.17.167
```

### Frontend Usage
```typescript
import { getClientConfig, getServerUrl, getServerIP } from '@/lib/client-config';

// Get full configuration
const config = getClientConfig();

// Get server URL
const serverUrl = getServerUrl(); // https://27.107.17.167:5001

// Get server IP
const serverIP = getServerIP(); // 27.107.17.167
```

## 🔄 How It Works

### 1. Configuration Loading
- Backend loads configuration from `config/server.json`
- Frontend receives configuration via `/api/config` endpoint
- Configuration is cached for performance

### 2. SSL Certificate Generation
- Script generates self-signed certificate for the specified IP
- Certificate includes Subject Alternative Names (SAN)
- Proper file permissions are set automatically

### 3. Server Startup
- Server reads configuration and uses specified IP/port
- SSL certificates are loaded from configured paths
- HTTPS server starts with the configured settings

## 🛠️ Troubleshooting

### Certificate Issues
```bash
# Check certificate validity
openssl x509 -in certs/cert.pem -text -noout

# Verify certificate matches IP
openssl x509 -in certs/cert.pem -text -noout | grep -A 1 "Subject Alternative Name"
```

### Configuration Issues
```bash
# Check configuration file
cat config/server.json

# Test configuration API
curl https://27.107.17.167:5001/api/config
```

### Port Issues
```bash
# Check if port is in use
netstat -tulpn | grep :5001

# Kill process using port (if needed)
sudo fuser -k 5001/tcp
```

## 📝 Manual Configuration

If you need to manually update the configuration:

1. Edit `config/server.json`
2. Update the IP address in the `server.ip` and `server.domain` fields
3. Regenerate SSL certificates: `npm run generate-ssl`
4. Restart the server: `npm run start:https`

## 🔒 Security Considerations

1. **Self-signed Certificates**: Browser will show security warning
2. **Certificate Storage**: Keep private keys secure
3. **Production Use**: Use trusted CA certificates for production
4. **Firewall**: Ensure port 5001 is accessible
5. **HTTPS Only**: Application is configured for HTTPS only

## 📞 Support

If you encounter issues:
1. Check the console logs for error messages
2. Verify the configuration file format
3. Ensure SSL certificates are properly generated
4. Check network connectivity and firewall settings