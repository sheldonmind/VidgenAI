#!/bin/bash

# Test script for Kling AI video generation

BASE_URL="${BASE_URL:-http://localhost:4000}"
API_KEY="${KLING_API_KEY}"

echo "🎬 Testing CreateAI Backend with Kling AI Integration"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
HEALTH_RESPONSE=$(curl -s "${BASE_URL}/health")
echo "Response: $HEALTH_RESPONSE"
if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
    exit 1
fi
echo ""

# Test 2: List Models
echo -e "${YELLOW}Test 2: List Models${NC}"
MODELS_RESPONSE=$(curl -s "${BASE_URL}/api/v1/models")
echo "Response: $MODELS_RESPONSE"
if echo "$MODELS_RESPONSE" | grep -q "Kling"; then
    echo -e "${GREEN}✅ Models endpoint working${NC}"
else
    echo -e "${RED}❌ Models endpoint failed${NC}"
fi
echo ""

# Test 3: Create Text-to-Video Generation
echo -e "${YELLOW}Test 3: Create Text-to-Video Generation${NC}"
GENERATION_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/v1/generations" \
  -F "prompt=A beautiful sunset over the ocean with gentle waves" \
  -F "modelName=Kling 2.6" \
  -F "duration=5s" \
  -F "aspectRatio=16:9" \
  -F "resolution=1080p" \
  -F "audioEnabled=true" \
  -F "feature=text-to-video" \
  -F "generationType=text-to-video")

echo "Response: $GENERATION_RESPONSE"

# Extract generation ID
GENERATION_ID=$(echo "$GENERATION_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$GENERATION_ID" ]; then
    echo -e "${RED}❌ Failed to create generation${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Generation created with ID: $GENERATION_ID${NC}"
echo ""

# Test 4: Get Generation Status
echo -e "${YELLOW}Test 4: Check Generation Status${NC}"
echo "Generation ID: $GENERATION_ID"
echo "Polling for status updates (will check 5 times with 10s intervals)..."
echo ""

for i in {1..5}
do
    echo "Poll attempt $i/5..."
    STATUS_RESPONSE=$(curl -s "${BASE_URL}/api/v1/generations/${GENERATION_ID}")
    STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    echo "Current status: $STATUS"
    
    if [ "$STATUS" == "completed" ]; then
        echo -e "${GREEN}✅ Video generation completed!${NC}"
        VIDEO_URL=$(echo "$STATUS_RESPONSE" | grep -o '"videoUrl":"[^"]*"' | cut -d'"' -f4)
        echo "Video URL: $VIDEO_URL"
        break
    elif [ "$STATUS" == "failed" ]; then
        echo -e "${RED}❌ Video generation failed${NC}"
        break
    else
        echo "Still processing..."
        if [ $i -lt 5 ]; then
            echo "Waiting 10 seconds before next check..."
            sleep 10
        fi
    fi
    echo ""
done

echo ""
echo "=========================================="
echo "🎬 Testing Complete!"
echo ""
echo "View generation details at:"
echo "${BASE_URL}/api/v1/generations/${GENERATION_ID}"
echo ""
echo "Monitor in Prisma Studio:"
echo "npm run prisma:studio"
