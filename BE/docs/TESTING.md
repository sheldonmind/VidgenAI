# Testing Guide

## Manual Testing với cURL

### 1. Test Health Endpoint
```bash
curl http://localhost:4000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-21T10:30:00.000Z"
}
```

### 2. Test Models API
```bash
curl http://localhost:4000/api/v1/models
```

Expected response:
```json
{
  "data": [
    {
      "id": "clxxxx",
      "name": "Seedance 1.5 Pro",
      "category": "GENERAL"
    },
    {
      "id": "clyyyy",
      "name": "Kling Motion Control",
      "category": "MOTION"
    }
  ]
}
```

### 3. Test Text-to-Video Generation
```bash
curl -X POST http://localhost:4000/api/v1/generations \
  -F "prompt=A beautiful sunset over the ocean with waves crashing" \
  -F "modelName=Kling 2.6" \
  -F "duration=5s" \
  -F "aspectRatio=16:9" \
  -F "resolution=1080p" \
  -F "audioEnabled=true" \
  -F "feature=text-to-video" \
  -F "generationType=text-to-video"
```

Save the `id` from response to check status later.

### 4. Test List Generations
```bash
curl http://localhost:4000/api/v1/generations
```

### 5. Test Get Single Generation
```bash
GENERATION_ID="your-generation-id"
curl http://localhost:4000/api/v1/generations/$GENERATION_ID
```

### 6. Test Webhook (Manual trigger)
```bash
curl -X POST http://localhost:4000/api/v1/webhooks/kling \
  -H "Content-Type: application/json" \
  -d '{
    "generation_id": "kling-job-id-from-providerJobId",
    "status": "completed",
    "video_url": "https://example.com/video.mp4",
    "thumbnail_url": "https://example.com/thumb.jpg"
  }'
```

## Testing với Postman

### Import Collection

1. Create new collection "CreateAI API"
2. Set base URL variable: `{{baseUrl}}` = `http://localhost:4000`

### Request 1: Text-to-Video
- Method: POST
- URL: `{{baseUrl}}/api/v1/generations`
- Body: form-data
  - prompt: "A golden retriever playing in the park"
  - modelName: "Kling 2.6"
  - duration: "5s"
  - aspectRatio: "16:9"
  - resolution: "1080p"
  - audioEnabled: "true"
  - feature: "text-to-video"
  - generationType: "text-to-video"

### Request 2: Image-to-Video
- Method: POST
- URL: `{{baseUrl}}/api/v1/generations`
- Body: form-data
  - image: [Upload file]
  - prompt: "Animate this image"
  - modelName: "Kling 2.6"
  - duration: "5s"
  - aspectRatio: "16:9"
  - resolution: "1080p"
  - feature: "create"
  - generationType: "image-to-video"

### Request 3: Get Generation Status
- Method: GET
- URL: `{{baseUrl}}/api/v1/generations/:id`
- Path variable: id = [generation-id from previous request]

## Testing với Frontend

### Update Frontend API Base URL

Edit `FE/.env` (create if not exists):
```env
VITE_API_BASE_URL=http://localhost:4000
```

### Test Flow:
1. Start backend: `cd BE && npm run dev`
2. Start frontend: `cd FE && npm run dev`
3. Open browser: `http://localhost:5173`
4. Fill in prompt: "A beautiful landscape with mountains"
5. Select model: "Kling 2.6"
6. Set duration: "5s"
7. Click "Generate"
8. Watch status change from "in_progress" to "completed"
9. Video should appear when ready

## Automated Testing (Future)

### Unit Tests Structure
```
src/
  services/
    __tests__/
      klingService.test.ts
  routes/
    __tests__/
      generations.test.ts
      webhooks.test.ts
```

### Integration Tests
```typescript
describe('Video Generation Flow', () => {
  it('should create text-to-video generation', async () => {
    const response = await request(app)
      .post('/api/v1/generations')
      .field('prompt', 'Test prompt')
      .field('modelName', 'Kling 2.6')
      .field('duration', '5s')
      .expect(201);
    
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.status).toBe('in_progress');
  });
});
```

## Performance Testing

### Load Testing với k6
```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 10,
  duration: '30s',
};

export default function() {
  const url = 'http://localhost:4000/api/v1/generations';
  const payload = {
    prompt: 'Test video generation',
    modelName: 'Kling 2.6',
    duration: '5s',
    aspectRatio: '16:9',
    resolution: '1080p',
  };

  const res = http.post(url, payload);
  check(res, {
    'status is 201': (r) => r.status === 201,
  });

  sleep(1);
}
```

Run:
```bash
k6 run load-test.js
```

## Monitoring During Testing

### Watch Backend Logs
```bash
cd BE
npm run dev | grep -E "(🎬|✅|❌|⏳)"
```

### Watch Database Changes
```bash
npm run prisma:studio
```
Navigate to `Generation` table and enable auto-refresh.

### Monitor Kling API Usage
Check your Kling dashboard for:
- API calls count
- Credits used
- Active jobs
- Failed jobs

## Expected Timelines

- **Text-to-Video**: 30s - 3 minutes
- **Image-to-Video**: 1 - 5 minutes
- **Motion Control**: 2 - 8 minutes

If generation takes longer than 20 minutes, it will timeout.
