#!/bin/bash

echo "Starting WRAS Application with Dynamic Configuration..."

# Function to kill background processes on exit
cleanup() {
    echo "Stopping services..."
    kill $FRONTEND_PID $BACKEND_PID 2>/dev/null
    exit
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Load server configuration
CONFIG_FILE="config/server.json"
if [ -f "$CONFIG_FILE" ]; then
    SERVER_IP=$(node -p "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).server.ip")
    SERVER_PORT=$(node -p "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).server.port")
    FRONTEND_PORT=$(node -p "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).server.frontendPort || 9002")
    PROTOCOL=$(node -p "JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8')).server.protocol")
    echo "Configuration loaded: $PROTOCOL://$SERVER_IP:$SERVER_PORT (backend), $PROTOCOL://$SERVER_IP:$FRONTEND_PORT (frontend)"
else
    echo "Configuration file not found. Using default settings..."
    SERVER_IP="27.107.17.167"
    SERVER_PORT="5001"
    FRONTEND_PORT="9002"
    PROTOCOL="https"
fi

# Check if SSL certificates exist (new format)
CERT_FILE="certs/cert.pem"
KEY_FILE="certs/private.key"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "SSL certificates found. Starting services with HTTPS..."
    HTTPS_MODE=true
else
    echo "SSL certificates not found. Starting services with HTTP..."
    echo "To enable HTTPS, run: npm run setup-server $SERVER_IP"
    HTTPS_MODE=false
    PROTOCOL="http"
fi

# Start FastAPI backend
echo "Starting FastAPI backend..."
cd backend
./start.sh &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 5

# Start Next.js frontend
echo "Starting Next.js frontend..."
if [ "$HTTPS_MODE" = true ]; then
    echo "Starting frontend with HTTPS..."
    npm run dev:https &
else
    echo "Starting frontend with HTTP..."
    npm run dev &
fi
FRONTEND_PID=$!

# Display service information
echo ""
echo "Services started:"
if [ "$HTTPS_MODE" = true ]; then
    echo "- FastAPI Backend: $PROTOCOL://$SERVER_IP:$SERVER_PORT"
    echo "- Next.js Frontend: $PROTOCOL://$SERVER_IP:$FRONTEND_PORT"
    echo "- API Documentation: $PROTOCOL://$SERVER_IP:$SERVER_PORT/docs"
    echo ""
    echo "Both services are running with HTTPS using dynamic configuration!"
    echo "Server IP: $SERVER_IP"
    echo "Backend Port: $SERVER_PORT"
    echo "Frontend Port: $FRONTEND_PORT"
else
    echo "- FastAPI Backend: $PROTOCOL://$SERVER_IP:$SERVER_PORT"
    echo "- Next.js Frontend: $PROTOCOL://$SERVER_IP:$FRONTEND_PORT"
    echo "- API Documentation: $PROTOCOL://$SERVER_IP:$SERVER_PORT/docs"
    echo ""
    echo "Services are running with HTTP (no SSL certificates found)"
    echo "Server IP: $SERVER_IP"
    echo "Backend Port: $SERVER_PORT"
    echo "Frontend Port: $FRONTEND_PORT"
fi
echo ""
echo "Press Ctrl+C to stop both services"

# Wait for both processes
wait $FRONTEND_PID $BACKEND_PID
