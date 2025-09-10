#!/bin/bash

# SSL Certificate Generation Script for IP Address
# This script generates a self-signed SSL certificate for the specified IP address
# and updates the server configuration
# Usage: ./scripts/generate-ssl-cert.sh <IP_ADDRESS>

set -e

# Get IP address from command line argument
IP_ADDRESS=$1

if [ -z "$IP_ADDRESS" ]; then
    echo "❌ Error: Please provide an IP address"
    echo "Usage: $0 <IP_ADDRESS>"
    echo "Example: $0 192.168.1.100"
    echo "Example: $0 27.107.17.167"
    exit 1
fi

# Validate IP address format (basic validation)
if ! [[ $IP_ADDRESS =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    echo "❌ Error: Invalid IP address format"
    echo "Please provide a valid IPv4 address (e.g., 192.168.1.100)"
    exit 1
fi

# Configuration
CERT_DIR="./certs"
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/private.key"
CONFIG_FILE="./config/server.json"
DAYS=365

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔐 SSL Certificate Generation for IP: $IP_ADDRESS${NC}"
echo "=================================================="

# Create certificates directory if it doesn't exist
if [ ! -d "$CERT_DIR" ]; then
    echo -e "${YELLOW}📁 Creating certificates directory...${NC}"
    mkdir -p "$CERT_DIR"
fi

# Remove existing certificates if they exist
echo -e "${YELLOW}🧹 Cleaning up existing certificates...${NC}"
if [ -f "$CERT_FILE" ]; then
    rm -f "$CERT_FILE"
    echo -e "${YELLOW}   Removed existing certificate: $CERT_FILE${NC}"
fi
if [ -f "$KEY_FILE" ]; then
    rm -f "$KEY_FILE"
    echo -e "${YELLOW}   Removed existing private key: $KEY_FILE${NC}"
fi
if [ -f "$CERT_DIR/cert.csr" ]; then
    rm -f "$CERT_DIR/cert.csr"
    echo -e "${YELLOW}   Removed existing CSR file${NC}"
fi

# Remove old certificate formats (from previous versions)
if [ -f "$CERT_DIR/server.crt" ]; then
    rm -f "$CERT_DIR/server.crt"
    echo -e "${YELLOW}   Removed old certificate format: $CERT_DIR/server.crt${NC}"
fi
if [ -f "$CERT_DIR/server.key" ]; then
    rm -f "$CERT_DIR/server.key"
    echo -e "${YELLOW}   Removed old private key format: $CERT_DIR/server.key${NC}"
fi
if [ -f "$CERT_DIR/server.csr" ]; then
    rm -f "$CERT_DIR/server.csr"
    echo -e "${YELLOW}   Removed old CSR format: $CERT_DIR/server.csr${NC}"
fi

# Check if OpenSSL is installed
if ! command -v openssl &> /dev/null; then
    echo -e "${RED}❌ OpenSSL is not installed. Please install OpenSSL first.${NC}"
    echo "Ubuntu/Debian: sudo apt-get install openssl"
    echo "CentOS/RHEL: sudo yum install openssl"
    echo "macOS: brew install openssl"
    exit 1
fi

# Generate private key
echo -e "${YELLOW}🔑 Generating private key...${NC}"
openssl genrsa -out "$KEY_FILE" 2048

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Private key generated successfully${NC}"
else
    echo -e "${RED}❌ Failed to generate private key${NC}"
    exit 1
fi

# Generate certificate signing request (CSR)
echo -e "${YELLOW}📝 Generating certificate signing request...${NC}"
openssl req -new -key "$KEY_FILE" -out "$CERT_DIR/cert.csr" -subj "/C=IN/ST=Maharashtra/L=Mumbai/O=Western Railway/OU=IT Department/CN=$IP_ADDRESS"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Certificate signing request generated successfully${NC}"
else
    echo -e "${RED}❌ Failed to generate certificate signing request${NC}"
    exit 1
fi

# Generate self-signed certificate
echo -e "${YELLOW}📜 Generating self-signed certificate...${NC}"
openssl x509 -req -in "$CERT_DIR/cert.csr" -signkey "$KEY_FILE" -out "$CERT_FILE" -days $DAYS -extensions v3_req -extfile <(
cat <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = IN
ST = Maharashtra
L = Mumbai
O = Western Railway
OU = IT Department
CN = $IP_ADDRESS

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
IP.1 = $IP_ADDRESS
DNS.1 = localhost
DNS.2 = *.localhost
EOF
)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Self-signed certificate generated successfully${NC}"
else
    echo -e "${RED}❌ Failed to generate self-signed certificate${NC}"
    exit 1
fi

# Set proper permissions
echo -e "${YELLOW}🔒 Setting proper permissions...${NC}"
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

# Clean up temporary files
echo -e "${YELLOW}🧹 Cleaning up temporary files...${NC}"
rm -f "$CERT_DIR/cert.csr"
rm -f "$CERT_DIR/server.csr"
echo -e "${YELLOW}   Removed temporary CSR files${NC}"

# Update server configuration
echo -e "${BLUE}⚙️  Updating server configuration...${NC}"
if [ -f "$CONFIG_FILE" ]; then
    # Backup existing config
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
    echo -e "${YELLOW}📋 Backed up existing configuration to $CONFIG_FILE.backup${NC}"
    
    # Update configuration with new IP
    node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
    const oldIP = config.server.ip;
    config.server.ip = '$IP_ADDRESS';
    config.server.domain = '$IP_ADDRESS';
    fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
    console.log('✅ Configuration updated: IP changed from', oldIP, 'to', '$IP_ADDRESS');
    "
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Server configuration updated successfully${NC}"
    else
        echo -e "${RED}❌ Failed to update server configuration${NC}"
        # Restore backup
        mv "$CONFIG_FILE.backup" "$CONFIG_FILE"
        exit 1
    fi
else
    # Create new configuration file
    echo -e "${YELLOW}📋 Creating new server configuration...${NC}"
    mkdir -p "$(dirname "$CONFIG_FILE")"
    cat > "$CONFIG_FILE" << EOF
{
  "server": {
    "ip": "$IP_ADDRESS",
    "port": 5001,
    "frontendPort": 9002,
    "protocol": "https",
    "domain": "$IP_ADDRESS"
  },
  "ssl": {
    "enabled": true,
    "certPath": "./certs/cert.pem",
    "keyPath": "./certs/private.key"
  },
  "environment": "production"
}
EOF
    echo -e "${GREEN}✅ New server configuration created${NC}"
fi

# Display certificate information
echo -e "${GREEN}📋 Certificate Information:${NC}"
echo "=================================================="
openssl x509 -in "$CERT_FILE" -text -noout | grep -E "(Subject:|Issuer:|Not Before|Not After|IP Address)"

echo ""
echo -e "${GREEN}🎉 SSL Certificate generation and configuration update completed successfully!${NC}"
echo "=================================================="
echo -e "${YELLOW}📁 Certificate files:${NC}"
echo "   Certificate: $CERT_FILE"
echo "   Private Key: $KEY_FILE"
echo ""
echo -e "${YELLOW}⚙️  Configuration:${NC}"
echo "   Config file: $CONFIG_FILE"
echo "   Server IP: $IP_ADDRESS"
echo "   Server Port: 5001"
echo "   Protocol: https"
echo ""
echo -e "${YELLOW}🚀 Ready to start:${NC}"
echo "   ./start-both.sh"
echo "   or"
echo "   npm run start:https"
echo ""
echo -e "${YELLOW}⚠️  Note: This is a self-signed certificate.${NC}"
echo "   For production use, consider using a certificate from a trusted CA."
echo "   You can use Let's Encrypt for free SSL certificates."