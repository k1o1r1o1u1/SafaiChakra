#!/bin/bash

echo "=================================================="
echo "    Starting SafaiChakra (Backend & Frontend)     "
echo "=================================================="

# Function to gracefully stop both servers when CTRL+C is pressed
cleanup() {
    echo ""
    echo "Shutting down SafaiChakra servers..."
    if [ -n "$BACKEND_PID" ]; then kill $BACKEND_PID 2>/dev/null; fi
    if [ -n "$FRONTEND_PID" ]; then kill $FRONTEND_PID 2>/dev/null; fi
    echo "Done. Goodbye!"
    exit 0
}

# Catch CTRL+C (SIGINT) and run the cleanup function
trap cleanup SIGINT SIGTERM

# 1. Start the Backend
echo "[1/2] Starting Backend Server (FastAPI)..."
cd backend
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi
python3 run.py &
BACKEND_PID=$!
cd ..

# Wait 2 seconds to let backend initialize
sleep 2

# 2. Start the Frontend
echo "[2/2] Starting Frontend Server (React)..."
cd frontend
npm start &
FRONTEND_PID=$!
cd ..

echo "=================================================="
echo "SafaiChakra is now running in the background!"
echo "Press CTRL+C at any time to stop both servers."
echo "=================================================="

# Keep the script running to catch CTRL+C
wait $BACKEND_PID
wait $FRONTEND_PID
