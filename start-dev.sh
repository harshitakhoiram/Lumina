#!/bin/bash
# Local development startup script

echo "=== Lumina Local Development Startup ==="
echo ""

# Check if Docker is running
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed or not in PATH"
    exit 1
fi

# Check for .env file
if [ ! -f "backend/.env" ]; then
    echo "Creating .env from template..."
    cp backend/.env.example backend/.env
    echo "⚠️  Please edit backend/.env with your API keys before proceeding"
    echo ""
fi

# Start Docker Compose
echo "Starting services with Docker Compose..."
echo ""
docker-compose up

echo ""
echo "=== Services Started ==="
echo "API: http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
echo "Database: localhost:5432"
echo ""
echo "To stop: Press Ctrl+C"
