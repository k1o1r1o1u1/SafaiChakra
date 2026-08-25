#!/bin/bash

echo "♻️ Starting SafaiChakra..."

# Function to handle script termination and kill background processes
cleanup() {
    echo "Stopping SafaiChakra processes..."
    kill $BACKEND_PID
    exit
}

# Catch the Ctrl+C signal and run the cleanup function
trap cleanup SIGINT SIGTERM

# Start the backend in the background
echo "-> Starting Backend (Port 8000)..."
cd backend
if [ -d ".venv" ]; then
    source .venv/bin/activate
else
    echo "Warning: .venv not found in backend/. Make sure you ran 'python3 -m venv .venv'."
fi
python run.py &
BACKEND_PID=$!
cd ..

# Start the frontend
echo "-> Starting Frontend (Port 3000)..."
cd frontend
HOST=0.0.0.0 npm start

# Wait for background processes to finish (this keeps the script running until you Ctrl+C)
wait $BACKEND_PID
