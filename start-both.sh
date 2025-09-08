#!/bin/bash

echo "Starting WRAS Application with FastAPI Backend..."

# Function to kill background processes on exit
cleanup() {
    echo "Stopping services..."
    kill $FRONTEND_PID $BACKEND_PID 2>/dev/null
    exit
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Check if SSL certificates exist
CERT_FILE="certs/server.crt"
KEY_FILE="certs/server.key"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "SSL certificates found. Starting services with HTTPS..."
    HTTPS_MODE=true
else
    echo "SSL certificates not found. Starting services with HTTP..."
    echo "To enable HTTPS, run: ./generate_cert.sh <YOUR_IP_ADDRESS>"
    HTTPS_MODE=false
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
    echo "- FastAPI Backend: https://localhost:5001"
    echo "- Next.js Frontend: https://localhost:9002"
    echo "- API Documentation: https://localhost:5001/docs"
    echo ""
    echo "Both services are running with HTTPS using shared certificates!"
else
    echo "- FastAPI Backend: http://localhost:5001"
    echo "- Next.js Frontend: http://localhost:9002"
    echo "- API Documentation: http://localhost:5001/docs"
fi
echo ""
echo "Press Ctrl+C to stop both services"

# Wait for both processes
wait $FRONTEND_PID $BACKEND_PID
