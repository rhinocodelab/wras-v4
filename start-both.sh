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

# Start FastAPI backend
echo "Starting FastAPI backend on port 8000..."
cd backend
./start.sh &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 5

# Start Next.js frontend
echo "Starting Next.js frontend on port 9002..."
npm run dev &
FRONTEND_PID=$!

echo "Services started:"
echo "- FastAPI Backend: http://localhost:8000"
echo "- Next.js Frontend: http://localhost:9002"
echo "- API Documentation: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both services"

# Wait for both processes
wait $FRONTEND_PID $BACKEND_PID
