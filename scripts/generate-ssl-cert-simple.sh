#!/bin/bash

# Simple SSL Certificate Generation Script
# This script generates a self-signed SSL certificate without CSR step
# Usage: ./scripts/generate-ssl-cert-simple.sh <IP_ADDRESS>

set -e

# Get IP address from command line argument
IP_ADDRESS=$1

if [ -z "$IP_ADDRESS" ]; then
    echo "❌ Error: Please provide an IP address"
    echo "Usage: $0 <IP_ADDRESS>"
    echo "Example: $0 192.168.1.100"
    exit 1
fi

# Validate IP address format
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

echo -e "${GREEN}🔐 Simple SSL Certificate Generation for IP: $IP_ADDRESS${NC}"
echo "=================================================="

# Create certificates directory if it doesn't exist
if [ ! -d "$CERT_DIR" ]; then
    echo -e "${YELLOW}📁 Creating certificates directory...${NC}"
    mkdir -p "$CERT_DIR"
fi

# Remove existing certificates if they exist
echo -e "${YELLOW}🧹 Cleaning up existing certificates...${NC}"
rm -f "$CERT_FILE" "$KEY_FILE" "$CERT_DIR/server.crt" "$CERT_DIR/server.key" "$CERT_DIR/cert.csr" "$CERT_DIR/server.csr"

# Check if OpenSSL is installed
if ! command -v openssl &> /dev/null; then
    echo -e "${RED}❌ OpenSSL is not installed. Please install OpenSSL first.${NC}"
    exit 1
fi

# Generate private key and certificate in one step
echo -e "${YELLOW}🔑 Generating private key and certificate...${NC}"
openssl req -x509 -newkey rsa:2048 -keyout "$KEY_FILE" -out "$CERT_FILE" -days $DAYS -nodes \
    -subj "/C=IN/ST=Maharashtra/L=Mumbai/O=Western Railway/OU=IT Department/CN=$IP_ADDRESS" \
    -addext "subjectAltName=IP:$IP_ADDRESS,DNS:localhost,DNS:*.localhost" \
    -addext "keyUsage=digitalSignature,keyEncipherment" \
    -addext "extendedKeyUsage=serverAuth,clientAuth"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Certificate generated successfully${NC}"
else
    echo -e "${RED}❌ Failed to generate certificate${NC}"
    exit 1
fi

# Set proper permissions
echo -e "${YELLOW}🔒 Setting proper permissions...${NC}"
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

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
openssl x509 -in "$CERT_FILE" -text -noout | grep -E "(Subject:|Issuer:|Not Before|Not After|IP Address|DNS)"

echo ""
echo -e "${GREEN}🎉 Simple SSL Certificate generation completed successfully!${NC}"
echo "=================================================="
echo -e "${YELLOW}📁 Certificate files:${NC}"
echo "   Certificate: $CERT_FILE"
echo "   Private Key: $KEY_FILE"
echo ""
echo -e "${YELLOW}⚙️  Configuration:${NC}"
echo "   Config file: $CONFIG_FILE"
echo "   Server IP: $IP_ADDRESS"
echo "   Server Port: 5001"
echo "   Frontend Port: 9002"
echo "   Protocol: https"
echo ""
echo -e "${YELLOW}🚀 Ready to start:${NC}"
echo "   ./start-both.sh"
echo "   or"
echo "   npm run start:https"
echo ""
echo -e "${YELLOW}⚠️  Note: This is a self-signed certificate.${NC}"
echo "   For production use, consider using a certificate from a trusted CA."