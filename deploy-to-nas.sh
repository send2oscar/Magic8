#!/bin/bash

# Shirt Changer - Docker Deployment Script for Synology NAS
# This script automates the deployment process

set -e

echo "=========================================="
echo "Shirt Changer - Docker Deployment Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: docker-compose is not installed. Please install docker-compose first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker and docker-compose are installed${NC}"
echo ""

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p uploads
mkdir -p ssl
mkdir -p mysql-data
echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found. Creating from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}Please edit .env file with your configuration before running docker-compose${NC}"
        echo -e "${YELLOW}Important values to update:${NC}"
        echo "  - MYSQL_ROOT_PASSWORD"
        echo "  - JWT_SECRET"
        echo "  - ADMIN_SESSION_SECRET"
        echo "  - VITE_APP_ID"
        echo "  - ADMIN_PASSWORD"
        echo "  - OWNER_OPEN_ID"
        echo "  - API keys and tokens"
        exit 1
    else
        echo -e "${RED}Error: .env.example not found${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ .env file exists${NC}"
echo ""

# Build the Docker image
echo "Building Docker image..."
docker-compose build
echo -e "${GREEN}✓ Docker image built successfully${NC}"
echo ""

# Start the containers
echo "Starting containers..."
docker-compose up -d
echo -e "${GREEN}✓ Containers started${NC}"
echo ""

# Wait for MySQL to be ready
echo "Waiting for MySQL to be ready..."
sleep 10

# Check container status
echo ""
echo "Container Status:"
docker-compose ps
echo ""

# Get the NAS IP or hostname
echo -e "${GREEN}=========================================="
echo "Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Your application is now running!"
echo ""
echo "Access the application at:"
echo -e "${YELLOW}http://localhost:3000${NC}"
echo "or"
echo -e "${YELLOW}http://<NAS_IP>:3000${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:           docker-compose logs -f app"
echo "  Stop containers:     docker-compose down"
echo "  Restart containers:  docker-compose restart"
echo "  Enter app shell:     docker exec -it shirt-changer-app bash"
echo ""
echo -e "${GREEN}For more information, see DOCKER_DEPLOYMENT_GUIDE.md${NC}"
