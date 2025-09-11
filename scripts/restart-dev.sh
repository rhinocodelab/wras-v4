#!/bin/bash

# Script to restart development server with increased memory
echo "🔄 Restarting development server with increased memory..."

# Kill any existing Node.js processes related to this project
echo "🛑 Stopping existing processes..."
pkill -f "next dev" || true
pkill -f "turbopack" || true

# Wait a moment for processes to stop
sleep 2

# Clear any potential memory leaks
echo "🧹 Clearing system cache..."
sync
echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null 2>&1 || true

# Set Node.js memory options
export NODE_OPTIONS="--max-old-space-size=4096 --max-semi-space-size=128"

# Start the development server
echo "🚀 Starting development server with 4GB memory limit..."
npm run dev