#!/bin/bash

# Start the FastAPI backend server
echo "Starting Audio Language Detection API..."

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

# Check if SSL certificates exist (from project root)
CERT_FILE="../certs/server.crt"
KEY_FILE="../certs/server.key"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "SSL certificates found. Starting server with HTTPS..."
    echo "Starting FastAPI server on https://0.0.0.0:5001"
    echo "API documentation available at https://localhost:5001/docs"
    uvicorn main:app --host 0.0.0.0 --port 5001 --ssl-keyfile "$KEY_FILE" --ssl-certfile "$CERT_FILE" --reload
else
    echo "SSL certificates not found. Starting server with HTTP..."
    echo "To enable HTTPS, run: ../generate_cert.sh <YOUR_IP_ADDRESS>"
    echo "Starting FastAPI server on http://0.0.0.0:5001"
    echo "API documentation available at http://localhost:5001/docs"
    uvicorn main:app --host 0.0.0.0 --port 5001 --reload
fi
