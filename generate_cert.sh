#!/bin/bash

# Script to generate self-signed SSL certificate for the application (frontend + backend)
# Usage: ./generate_cert.sh <IP_ADDRESS>

set -e

# Check if IP address is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <IP_ADDRESS>"
    echo "Example: $0 192.168.1.100"
    exit 1
fi

IP_ADDRESS=$1
CERT_DIR="certs"
CERT_FILE="$CERT_DIR/server.crt"
KEY_FILE="$CERT_DIR/server.key"

# Create certificates directory if it doesn't exist
mkdir -p "$CERT_DIR"

echo "Generating self-signed certificate for IP: $IP_ADDRESS"
echo "Certificate will be available for both frontend and backend"

# Generate private key
openssl genrsa -out "$KEY_FILE" 2048

# Generate certificate signing request (CSR)
openssl req -new -key "$KEY_FILE" -out "$CERT_DIR/server.csr" -subj "/C=US/ST=State/L=City/O=Organization/CN=$IP_ADDRESS"

# Create a config file for the certificate with IP address
cat > "$CERT_DIR/server.conf" << EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = State
L = City
O = Organization
CN = $IP_ADDRESS

[v3_req]
keyUsage = critical, digitalSignature, keyEncipherment, dataEncipherment
extendedKeyUsage = critical, serverAuth
subjectAltName = @alt_names
basicConstraints = critical, CA:FALSE

[alt_names]
IP.1 = $IP_ADDRESS
IP.2 = 127.0.0.1
DNS.1 = localhost
EOF

# Generate self-signed certificate
openssl x509 -req -in "$CERT_DIR/server.csr" -signkey "$KEY_FILE" -out "$CERT_FILE" -days 365 -extensions v3_req -extfile "$CERT_DIR/server.conf"

# Set proper permissions
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

# Clean up temporary files
rm "$CERT_DIR/server.csr" "$CERT_DIR/server.conf"

echo "Certificate generated successfully!"
echo "Certificate file: $CERT_FILE"
echo "Private key file: $KEY_FILE"
echo ""
echo "Certificate is now available for both frontend and backend:"
echo "  - Backend: ./certs/server.crt and ./certs/server.key"
echo "  - Frontend: ./certs/server.crt and ./certs/server.key"
echo ""
echo "To start the backend with HTTPS:"
echo "  cd backend && ./start.sh"
echo ""
echo "To start the frontend with HTTPS, configure your frontend server to use:"
echo "  - Certificate: ./certs/server.crt"
echo "  - Private Key: ./certs/server.key"