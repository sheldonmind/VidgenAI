# CreateAI Backend

Node.js + Express + TypeScript + PostgreSQL (Prisma) backend with **Kling AI** and **Google Veo 3** integration for video generation. Designed to match the text-to-video flows in `FE/src/components/VideoGenerator.jsx`.

## Features

- 🎬 **Text-to-Video**: Generate videos from text prompts
- 🖼️ **Image-to-Video**: Animate images into videos
- 🎭 **Motion Control**: Transfer motion from reference videos to characters
- 📹 **Video-to-Video**: Transform existing videos
- 🔄 **Async Processing**: Background polling for video generation status
- 🪝 **Webhook Support**: Receive callbacks from Kling AI when videos complete

## Quick start

1. Copy env file and update values:
   ```bash
   cp env.example .env
   ```

2. **Add your API keys** to `.env`:
   ```env
   # For KLing AI models
   KLING_API_KEY="your_kling_api_key_here"
   
   # For Google Veo 3 models
   GOOGLE_API_KEY="your_google_api_key_here"
   ```
   > Get KLing AI key from [Kling AI](https://klingai.com) or [AIMLAPI](https://aimlapi.com)
   > Get Google API key from [Google AI Studio](https://aistudio.google.com/apikey)

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start PostgreSQL database:
   ```bash
   docker-compose up -d
   ```

5. Run database migration and seed models:
   ```bash
   npm run prisma:migrate
   npm run seed
   ```

6. Start the API:
   ```bash
   npm run dev
   ```

API defaults to `http://localhost:4000`.

## API Routes

### Health & Models
- `GET /health` - Health check
- `GET /api/v1/models` - List available AI models

### Generations
- `POST /api/v1/generations` - Create new video generation (multipart/form-data)
- `GET /api/v1/generations` - List all generations (with pagination)
- `GET /api/v1/generations/:id` - Get specific generation
- `PATCH /api/v1/generations/:id` - Update generation status

### Webhooks
- `POST /api/v1/webhooks/kling` - Receive callbacks from Kling AI
- `POST /api/v1/webhooks/kling/test` - Test webhook endpoint

## Example (text-to-video)

Request (multipart/form-data):

- `prompt`: string
- `modelName`: string
- `duration`: string
- `aspectRatio`: string
- `resolution`: string
- `audioEnabled`: `true` or `false`
- `feature`: `text-to-video`
- `generationType`: `text-to-video`

## Example (image-to-video)

Request (multipart/form-data):

- `image`: file (JPG/PNG/WebP)
- `prompt`: optional string
- `modelName`: string
- `duration`: string
- `aspectRatio`: string
- `resolution`: string
- `feature`: `create`
- `generationType`: `image-to-video`

## File uploads

Uploaded files are stored in `uploads/` and served from `/uploads/...`.

## TikTok (Sandbox & Visit account)

- **OAuth (Login Kit)**: Use `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, and `TIKTOK_REDIRECT_URI` from your [TikTok Developer](https://developers.tiktok.com/) app. For **Sandbox**, use the Sandbox credentials and set `TIKTOK_REDIRECT_URI` to the **exact** "Login Kit" > Redirect URI (Web) from Sandbox (e.g. `https://your-tunnel.trycloudflare.com/api/v1/tiktok/callback`). Add your TikTok account as a **Target User** in Sandbox settings so it can authorize the app.
- **Visit account – dùng đúng Chrome đang mở localhost:5173 (không mở Chrome for Testing)**: Khi bấm "Visit account", tab TikTok sẽ mở trong **cùng cửa sổ Chrome** mà bạn đang dùng app:
  1. Đóng hết Google Chrome.
  2. Mở Chrome có bật remote debugging **và chỉ định profile** (để không hiện "Who's using Chrome?"):  
     **macOS:** `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --profile-directory="Default"`  
     (Nếu bạn dùng profile khác, đổi `Default` thành `Profile 1`, `Profile 2`, … tương ứng.)  
     **Windows:** `chrome.exe --remote-debugging-port=9222 --profile-directory=Default`
  3. Trong Chrome đó mở `http://localhost:5173` (app) và đăng nhập TikTok nếu cần.
  4. Trong `.env` (thư mục BE) thêm: `TIKTOK_CHROME_CDP_URL=http://localhost:9222`
  5. Bấm "Visit account" → backend kết nối vào Chrome này và mở **tab mới** đến TikTok (không có cửa sổ Chrome for Testing).
- **Visit account – profile riêng**: Nếu không set `TIKTOK_CHROME_CDP_URL`, app sẽ mở thêm cửa sổ Chromium/Chrome for Testing. Chạy `npm run tiktok-login` một lần để đăng nhập TikTok trong profile đó.

## Environment variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/db` |
| `CORS_ORIGIN` | Allowed origins (comma-separated) | `http://localhost:5173` |
| `BASE_URL` | Base URL for file links | `http://localhost:4000` |
| `KLING_API_KEY` | KLing AI API key (for KLing models) | Your KLing API key |
| `KLING_API_BASE_URL` | KLing API endpoint | `https://api.aimlapi.com` |
| `GOOGLE_API_KEY` | Google API key (for Veo 3 models) | Your Google API key |

## How It Works

1. **Client creates generation**: POST to `/api/v1/generations` with video parameters
2. **Backend saves to database**: Generation record created with status "in_progress"
3. **API called**: Background process submits job to KLing AI or Google Veo 3 based on selected model
4. **Status polling**: Backend polls the respective API every 10 seconds for completion
5. **Video ready**: When complete, video is downloaded locally and database updated with status "completed"
6. **Client fetches result**: Frontend retrieves completed video from database

The backend automatically detects which service to use based on the model name:
- Models with "Kling" in the name use KLing AI service
- Models with "Veo" in the name use Google Veo 3 service

### Alternative: Webhook Flow

Instead of polling, Kling can POST to `/api/v1/webhooks/kling` when video is ready:

```json
{
  "generation_id": "kling-job-id",
  "status": "completed",
  "video_url": "https://cdn.kling.ai/video.mp4",
  "thumbnail_url": "https://cdn.kling.ai/thumb.jpg"
}
```

## Video Generation Services

The backend supports two AI video generation services:

### KLing AI
Supports text-to-video, image-to-video, and motion control features.

### Google Veo 3
Advanced video generation with high quality output. Supports text-to-video and image-to-video.

## Usage Examples

### KLing AI Integration

Three modes supported:

### 1. Text-to-Video
```bash
curl -X POST http://localhost:4000/api/v1/generations \
  -F "prompt=A golden retriever playing piano" \
  -F "modelName=Kling 2.6" \
  -F "duration=5s" \
  -F "aspectRatio=16:9" \
  -F "resolution=1080p" \
  -F "audioEnabled=true" \
  -F "feature=text-to-video" \
  -F "generationType=text-to-video"
```

### 2. Image-to-Video
```bash
curl -X POST http://localhost:4000/api/v1/generations \
  -F "image=@photo.jpg" \
  -F "prompt=Animate this character walking" \
  -F "modelName=Kling 2.6" \
  -F "duration=5s" \
  -F "aspectRatio=16:9" \
  -F "feature=create" \
  -F "generationType=image-to-video"
```

### 3. Motion Control
```bash
curl -X POST http://localhost:4000/api/v1/generations \
  -F "video=@reference.mp4" \
  -F "characterImage=@character.jpg" \
  -F "modelName=Kling Motion Control" \
  -F "duration=5s" \
  -F "resolution=1080p" \
  -F "feature=motion" \
  -F "generationType=motion-control"
```

### Google Veo 3 Integration

Two modes supported:

#### 1. Text-to-Video (Veo 3)
```bash
curl -X POST http://localhost:4000/api/v1/generations \
  -F "prompt=A cinematic shot of the ocean at sunset" \
  -F "modelName=Veo 3" \
  -F "duration=6s" \
  -F "aspectRatio=16:9" \
  -F "resolution=1080p" \
  -F "audioEnabled=true" \
  -F "feature=text-to-video" \
  -F "generationType=text-to-video"
```

#### 2. Image-to-Video (Veo 3)
```bash
curl -X POST http://localhost:4000/api/v1/generations \
  -F "image=@photo.jpg" \
  -F "prompt=Camera slowly zooming in" \
  -F "modelName=Veo 3" \
  -F "duration=8s" \
  -F "aspectRatio=9:16" \
  -F "feature=create" \
  -F "generationType=image-to-video"
```

**Note**: Veo 3 only supports:
- Durations: 4s, 6s, or 8s (automatically adjusted)
- Aspect ratios: 16:9 (landscape) or 9:16 (portrait)

## Troubleshooting

### API not configured
If you see: `⚠️  No video generation service configured`

**Solution**: Add the appropriate API key to your `.env` file:
- For KLing models: Add `KLING_API_KEY`
- For Veo 3 models: Add `GOOGLE_API_KEY`

### Video generation stuck in "in_progress"
Check backend logs for:
- API key validity
- API rate limits (both KLing and Google have rate limits)
- Network connectivity issues
- Check generation status manually: `POST /api/v1/generations/:id/check-status`

### Database connection failed
Ensure PostgreSQL is running:
```bash
docker-compose ps
```

Start if stopped:
```bash
docker-compose up -d
```
