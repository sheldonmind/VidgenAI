# Debug Veo 3 Video Generation

## Vấn đề: Video bị kẹt ở trạng thái "Generating"

### Nguyên nhân có thể:

1. **Backend polling không hoạt động** - Process bị dừng hoặc có lỗi
2. **Google API key không có quyền** - Không thể truy cập status endpoint
3. **Operation name sai format** - URL không đúng
4. **Server bị restart** - Polling process bị mất (vì chạy trong memory)

## Cách debug:

### 1. Kiểm tra backend logs

Khởi động backend và xem console output:

```bash
cd BE
npm run dev
```

Tìm các log message:
- `🎬 Starting Veo 3 generation for ...`
- `🔄 Starting polling for generation ...`
- `📡 Polling attempt ...`
- `✅ Veo 3 video generation completed`

### 2. Test API polling trực tiếp

Dùng script test để kiểm tra một operation cụ thể:

```bash
cd BE
npx ts-node test-veo3-polling.ts models/veo-3.0-generate-001/operations/YOUR_OPERATION_ID
```

Thay `YOUR_OPERATION_ID` bằng operation ID thực tế (lấy từ `providerJobId` trong database).

### 3. Kiểm tra status thủ công qua API

Gọi endpoint check status:

```bash
curl -X POST http://localhost:4000/api/v1/generations/YOUR_GENERATION_ID/check-status
```

Thay `YOUR_GENERATION_ID` bằng ID của generation đang "stuck".

### 4. Kiểm tra database

```bash
cd BE
npx prisma studio
```

Xem table `Generation` và kiểm tra:
- `status` - phải là "in_progress"
- `providerJobId` - phải có giá trị (operation name từ Google)
- `updatedAt` - xem lần cuối cùng được update

### 5. Kiểm tra Google API key

```bash
echo $GOOGLE_API_KEY
# Hoặc
cat BE/.env | grep GOOGLE_API_KEY
```

Đảm bảo API key:
- Đã được set trong `.env`
- Có quyền truy cập Veo 3 API
- Không bị expired hoặc revoked

## Giải pháp:

### Giải pháp 1: Restart backend

Đơn giản nhất, restart backend để bắt đầu lại polling:

```bash
cd BE
npm run dev
```

**Lưu ý**: Cách này chỉ hoạt động cho các generation MỚI. Các generation đang "stuck" sẽ không được poll lại.

### Giải pháp 2: Trigger manual check

Dùng button "Check status now" trong UI hoặc gọi API:

```bash
curl -X POST http://localhost:4000/api/v1/generations/YOUR_GENERATION_ID/check-status
```

### Giải pháp 3: Implement persistent polling

Để tránh mất polling khi restart server, cần implement một trong các cách:

#### Option A: Cron job kiểm tra pending generations

Thêm vào `BE/src/index.ts`:

```typescript
// Check for stuck generations every 30 seconds
setInterval(async () => {
  const pendingGenerations = await prisma.generation.findMany({
    where: { 
      status: 'in_progress',
      providerJobId: { not: null }
    },
    take: 10
  });

  for (const gen of pendingGenerations) {
    if (gen.providerJobId) {
      pollVeo3Generation(gen.id, gen.providerJobId).catch(console.error);
    }
  }
}, 30000);
```

#### Option B: Message queue (BullMQ, RabbitMQ)

Implement một queue system để xử lý polling một cách reliable hơn.

#### Option C: Database-based job queue

Dùng pg_cron hoặc similar để schedule checking trong database.

## Cải tiến code:

### Đã thêm:

1. ✅ Detailed logging trong `veo3Service.ts`
2. ✅ Better error handling trong `pollVeo3Generation()`
3. ✅ Manual status check endpoint: `POST /api/v1/generations/:id/check-status`
4. ✅ UI improvements: hiển thị failed status và retry button
5. ✅ Test script: `test-veo3-polling.ts`

### Cần thêm (optional):

1. ⏰ Cron job để auto-check pending generations
2. 📊 Monitoring/alerting khi polling fail
3. 💾 Persistent queue system
4. 🔄 Webhook từ Google (nếu có support)

## Troubleshooting common errors:

### Error: "Veo 3 API error: 401 Unauthorized"

➡️ API key không hợp lệ hoặc không có quyền

**Giải pháp**: Kiểm tra lại Google API key và enable Vertex AI API

### Error: "Veo 3 API error: 404 Not Found"

➡️ Operation name không tồn tại hoặc đã expired

**Giải pháp**: Google có thể xóa old operations sau một thời gian. Tạo generation mới.

### Error: "Polling timeout after 120 attempts"

➡️ Video generation mất quá nhiều thời gian (>20 phút)

**Giải pháp**: Tăng `maxAttempts` trong `pollVeo3Generation()` hoặc kiểm tra Google Cloud Console.

### Video status stuck at "in_progress" mãi

➡️ Backend polling đã dừng hoặc có lỗi

**Giải pháp**: 
1. Check backend logs
2. Dùng manual check endpoint
3. Restart backend và tạo video mới

## Testing checklist:

- [ ] Backend server đang chạy
- [ ] GOOGLE_API_KEY được set trong .env
- [ ] Database connection hoạt động
- [ ] Tạo một text-to-video generation mới
- [ ] Xem backend logs có thấy polling messages
- [ ] Đợi 1-2 phút và check status trong database
- [ ] Video URL xuất hiện khi done = true

## Liên hệ support:

Nếu vẫn gặp vấn đề, cung cấp:
1. Backend logs (full console output)
2. Database record của generation
3. Response từ test-veo3-polling.ts
4. Google API key permissions (screenshot)
