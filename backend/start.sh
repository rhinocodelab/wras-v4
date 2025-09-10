#!/bin/bash

# Start the FastAPI backend server
echo "Starting Audio Language Detection API..."

# Load server configuration
CONFIG_FILE="../config/server.json"
if [ -f "$CONFIG_FILE" ]; then
    SERVER_IP=$(node -p "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).server.ip")
    SERVER_PORT=$(node -p "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).server.port")
    PROTOCOL=$(node -p "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).server.protocol")
    echo "Configuration loaded: $PROTOCOL://$SERVER_IP:$SERVER_PORT (backend)"
else
    echo "Configuration file not found. Using default settings..."
    SERVER_IP="0.0.0.0"
    SERVER_PORT="5001"
    PROTOCOL="https"
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Check if SSL certificates exist (new format from project root)
CERT_FILE="../certs/cert.pem"
KEY_FILE="../certs/private.key"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "SSL certificates found. Starting server with HTTPS..."
    echo "Starting FastAPI server on https://$SERVER_IP:$SERVER_PORT"
    echo "API documentation available at https://$SERVER_IP:$SERVER_PORT/docs"
    uvicorn main:app --host $SERVER_IP --port $SERVER_PORT --ssl-keyfile "$KEY_FILE" --ssl-certfile "$CERT_FILE" --reload
else
    echo "SSL certificates not found. Starting server with HTTP..."
    echo "To enable HTTPS, run: npm run setup-server $SERVER_IP"
    echo "Starting FastAPI server on http://$SERVER_IP:$SERVER_PORT"
    echo "API documentation available at http://$SERVER_IP:$SERVER_PORT/docs"
    uvicorn main:app --host $SERVER_IP --port $SERVER_PORT --reload
fi
