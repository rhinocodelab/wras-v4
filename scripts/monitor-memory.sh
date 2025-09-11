#!/bin/bash

# Memory monitoring script for Node.js processes
echo "📊 Node.js Memory Usage Monitor"
echo "================================"

while true; do
    clear
    echo "📊 Node.js Memory Usage Monitor - $(date)"
    echo "================================"
    
    # Show Node.js processes and their memory usage
    echo "🔍 Node.js Processes:"
    ps aux | grep -E "(node|next)" | grep -v grep | awk '{print $2, $4, $6, $11}' | head -10
    
    echo ""
    echo "💾 System Memory:"
    free -h
    
    echo ""
    echo "🔄 Press Ctrl+C to exit"
    sleep 5
done