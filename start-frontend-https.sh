#!/bin/bash

echo "Starting Next.js Frontend with HTTPS..."

# Check if SSL certificates exist
CERT_FILE="certs/server.crt"
KEY_FILE="certs/server.key"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "SSL certificates not found!"
    echo "Please run: ./generate_cert.sh <YOUR_IP_ADDRESS>"
    echo "Expected files:"
    echo "  - $CERT_FILE"
    echo "  - $KEY_FILE"
    exit 1
fi

echo "SSL certificates found. Starting frontend with HTTPS..."
echo "Frontend will be available at: https://localhost:9002"

# Start the frontend with HTTPS
npm run dev:https