# 🌥️ Cloudinary Setup Guide

## Tại sao cần Cloudinary?

Cloudinary cho phép bạn lưu trữ và phục vụ video/ảnh qua CDN công khai, giải quyết vấn đề:
- ✅ Kling API có thể truy cập được URL của file
- ✅ Không cần ngrok hay tunnel
- ✅ URL không đổi, luôn hoạt động
- ✅ Miễn phí 25GB storage + 25GB bandwidth/tháng

---

## Bước 1: Tạo tài khoản Cloudinary

1. Truy cập: **https://cloudinary.com/users/register_free**
2. Điền thông tin:
   - Email
   - Mật khẩu
   - Chọn "Developer" role
3. Xác nhận email

---

## Bước 2: Lấy API Credentials

1. Sau khi đăng nhập, vào: **https://console.cloudinary.com/**
2. Trên Dashboard, bạn sẽ thấy:

```
Cloud Name: your_cloud_name
API Key: 123456789012345
API Secret: abcdefghijklmnopqrstuvwxyz
```

3. Copy 3 giá trị này

---

## Bước 3: Cập nhật file .env

Mở file `BE/.env` và cập nhật:

```env
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="123456789012345"
CLOUDINARY_API_SECRET="abcdefghijklmnopqrstuvwxyz"
```

**Thay thế** `your_cloud_name`, `123456789012345`, và `abcdefghijklmnopqrstuvwxyz` bằng giá trị thực tế của bạn.

---

## Bước 4: Restart Backend

```bash
cd BE
npm run dev
```

---

## Bước 5: Test

1. Mở frontend: `http://localhost:5173`
2. Tạo một video mới với Motion Control
3. Kiểm tra logs backend, bạn sẽ thấy:
   ```
   ☁️ Input video uploaded to Cloudinary: https://res.cloudinary.com/...
   ☁️ Character image uploaded to Cloudinary: https://res.cloudinary.com/...
   ```

---

## Kiểm tra files trên Cloudinary

1. Vào: **https://console.cloudinary.com/console/media_library**
2. Bạn sẽ thấy folder `createai` với tất cả files đã upload
3. Click vào file để xem URL public

---

## Lưu ý

- **Free tier:** 25GB storage, 25GB bandwidth/tháng
- Files sẽ tự động có URL dạng: `https://res.cloudinary.com/your_cloud_name/video/upload/...`
- URL này stable và không đổi
- Kling API có thể truy cập trực tiếp các URL này

---

## Nếu gặp lỗi

### Lỗi: "Must supply api_key"
→ Kiểm tra lại `CLOUDINARY_API_KEY` trong `.env`

### Lỗi: "Invalid cloud_name"
→ Kiểm tra lại `CLOUDINARY_CLOUD_NAME` trong `.env`

### Files không upload lên Cloudinary
→ Kiểm tra logs backend xem có lỗi gì
→ Đảm bảo đã restart backend sau khi cập nhật `.env`

---

## Cấu trúc folder trên Cloudinary

```
createai/
  ├── video-123.mp4        (Input videos)
  ├── image-456.jpg        (Input images)
  ├── thumbnail-789.jpg    (Generated thumbnails)
  └── output-012.mp4       (Generated videos)
```

---

Xong! Bây giờ bạn có thể tạo video mà không cần ngrok nữa! 🎉
