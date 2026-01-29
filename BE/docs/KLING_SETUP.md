# Hướng dẫn Setup Kling AI Integration

## Bước 1: Lấy API Key

### Option 1: AIMLAPI (Recommended)
1. Đăng ký tài khoản tại: https://aimlapi.com
2. Vào Dashboard → API Keys
3. Tạo API key mới
4. Copy API key

### Option 2: Kling AI Official
1. Đăng ký tại: https://klingai.com
2. Vào Developer section
3. Tạo API credentials
4. Copy API key

## Bước 2: Cấu hình Backend

1. Tạo file `.env` từ template:
```bash
cd BE
cp env.example .env
```

2. Thêm API key vào `.env`:
```env
KLING_API_KEY="your_actual_key_here"
KLING_API_BASE_URL="https://api.aimlapi.com"
```

3. Khởi động database:
```bash
docker-compose up -d
```

4. Chạy migrations:
```bash
npm run prisma:migrate
npm run seed
```

5. Khởi động server:
```bash
npm run dev
```

## Bước 3: Test Integration

### Test 1: Text-to-Video

```bash
curl -X POST http://localhost:4000/api/v1/generations \
  -H "Content-Type: multipart/form-data" \
  -F "prompt=A majestic eagle soaring through golden sunset clouds" \
  -F "modelName=Kling 2.6" \
  -F "duration=5s" \
  -F "aspectRatio=16:9" \
  -F "resolution=1080p" \
  -F "audioEnabled=true" \
  -F "feature=text-to-video" \
  -F "generationType=text-to-video"
```

Kết quả mong đợi:
```json
{
  "data": {
    "id": "clxxxx...",
    "prompt": "A majestic eagle soaring...",
    "status": "in_progress",
    "modelName": "Kling 2.6",
    "providerJobId": "kling-job-id-xxx"
  }
}
```

### Test 2: Check Status

```bash
# Lấy generation ID từ response trên
GENERATION_ID="clxxxx..."

curl http://localhost:4000/api/v1/generations/$GENERATION_ID
```

Kết quả khi hoàn thành:
```json
{
  "data": {
    "id": "clxxxx...",
    "status": "completed",
    "videoUrl": "https://cdn.kling.ai/videos/xxx.mp4",
    "thumbnailUrl": "https://cdn.kling.ai/thumbs/xxx.jpg"
  }
}
```

### Test 3: Image-to-Video

```bash
curl -X POST http://localhost:4000/api/v1/generations \
  -F "image=@/path/to/your/image.jpg" \
  -F "prompt=Make this character dance" \
  -F "modelName=Kling 2.6" \
  -F "duration=5s" \
  -F "aspectRatio=16:9" \
  -F "resolution=1080p" \
  -F "feature=create" \
  -F "generationType=image-to-video"
```

### Test 4: Motion Control

```bash
curl -X POST http://localhost:4000/api/v1/generations \
  -F "video=@/path/to/reference-video.mp4" \
  -F "characterImage=@/path/to/character.jpg" \
  -F "prompt=Apply this motion to my character" \
  -F "modelName=Kling Motion Control" \
  -F "duration=5s" \
  -F "resolution=1080p" \
  -F "feature=motion" \
  -F "generationType=motion-control"
```

## Monitoring & Debugging

### Xem logs backend:
```bash
# Backend sẽ hiển thị:
# 🎬 Starting Kling generation for clxxxx...
# ✅ Kling job created: kling-job-id-xxx
# ⏳ Polling clxxxx - Status: processing (1/120)
# ✅ Video generation completed for clxxxx
```

### Check database:
```bash
npm run prisma:studio
```

Vào bảng `Generation` để xem:
- `status`: "in_progress" → "completed"
- `providerJobId`: Kling job ID
- `videoUrl`: Link video đã tạo
- `thumbnailUrl`: Link thumbnail

## Common Issues

### ⚠️ "Kling API not configured"
**Nguyên nhân**: Chưa set KLING_API_KEY

**Giải pháp**:
1. Check file `.env` có chứa `KLING_API_KEY`
2. Restart server: `npm run dev`

### ❌ "Generation failed"
**Nguyên nhân**: 
- API key không hợp lệ
- Hết quota/credits
- Prompt không phù hợp

**Giải pháp**:
1. Check API key còn hoạt động
2. Check balance/credits trên dashboard
3. Thử prompt đơn giản hơn

### ⏱️ "Polling timeout"
**Nguyên nhân**: Video generation mất quá 20 phút

**Giải pháp**:
1. Check Kling dashboard xem job có hoàn thành chưa
2. Có thể manually update database:
```sql
UPDATE "Generation" 
SET status = 'completed', 
    "videoUrl" = 'url-from-kling-dashboard'
WHERE id = 'generation-id';
```

## Production Checklist

- [ ] Set `KLING_API_KEY` trong production environment
- [ ] Configure `BASE_URL` để file uploads có absolute URL
- [ ] Setup webhook endpoint public để Kling callback được
- [ ] Add rate limiting cho API endpoints
- [ ] Setup monitoring/alerting cho failed generations
- [ ] Add retry logic cho transient errors
- [ ] Consider using queue system (Bull, BeeQueue) cho scale tốt hơn
- [ ] Setup CDN/cloud storage cho video files

## Next Steps

1. **Frontend Integration**: Update FE để call backend API thay vì mock data
2. **Error Handling**: Add user-friendly error messages
3. **Progress Updates**: Implement real-time progress với WebSocket/SSE
4. **Video Storage**: Upload videos lên S3/Cloudflare R2 thay vì dùng Kling URLs
5. **Cost Management**: Add usage tracking và billing
