# Changelog: Model-Specific Capabilities Implementation

## Ngày: 2026-01-22

## Tóm tắt

Đã triển khai hệ thống cấu hình riêng cho từng AI model, cho phép mỗi model có các tùy chọn Duration, Aspect Ratio, Resolution và Audio phù hợp với khả năng của nó.

## Vấn đề đã giải quyết

- ❌ **Trước**: Tất cả models dùng chung cấu hình (4s, 6s, 8s) mặc dù Kling chỉ hỗ trợ 5s và 10s
- ✅ **Sau**: Mỗi model có cấu hình riêng, tự động validate và điều chỉnh giá trị phù hợp

## Files đã thêm mới

### Backend

1. **`/BE/src/config/modelCapabilities.ts`** (MỚI)
   - Định nghĩa interface `ModelCapability`
   - Cấu hình chi tiết cho từng model (Veo 3, Kling 2.6, etc.)
   - Helper functions để validate và lấy giá trị gần nhất

2. **`/BE/docs/MODEL_CAPABILITIES.md`** (MỚI)
   - Documentation chi tiết về model capabilities
   - Hướng dẫn thêm model mới
   - Ví dụ API response

## Files đã sửa đổi

### Backend

1. **`/BE/src/routes/models.ts`**
   - Import `getModelCapabilities`
   - Thêm `capabilities` vào response của API `/api/v1/models`
   - Mỗi model giờ trả về đầy đủ thông tin về khả năng của nó

2. **`/BE/src/services/klingService.ts`**
   - Cập nhật `generateTextToVideo()`:
     - Validate duration (chỉ 5s hoặc 10s)
     - Tự động snap về giá trị gần nhất
     - Log thông báo khi điều chỉnh giá trị
   - Cập nhật `generateImageToVideo()`:
     - Tương tự validate duration

### Frontend

1. **`/FE/src/components/VideoGenerator.jsx`**
   
   **Đã xóa**:
   - Hardcoded constants: `DURATIONS`, `ASPECT_RATIOS`, `RESOLUTIONS`
   
   **Đã thêm**:
   - State: `currentCapabilities` - lấy từ selectedModel
   - Effect: Auto-adjust settings khi đổi model
   - Component: Model Capabilities Info Panel
   
   **Đã cập nhật**:
   - Duration dropdown: Sử dụng `currentCapabilities.durations`
   - Aspect Ratio dropdown: Sử dụng `currentCapabilities.aspectRatios`
   - Resolution dropdown: Sử dụng `currentCapabilities.resolutions`
   - Audio toggle: Disable khi model không hỗ trợ
   - Thêm text "(Not supported)" cho audio toggle

## Cấu hình Models

### Veo 3 Models
```
Veo 3, Veo 3.1:
  ⏱ Durations: 4s, 6s, 8s
  📐 Aspect Ratios: 16:9, 9:16
  📺 Resolutions: 480p, 720p, 1080p
  🎵 Audio: ✓ Supported

Veo 3 Fast:
  ⏱ Durations: 4s, 6s, 8s
  📐 Aspect Ratios: 16:9, 9:16
  📺 Resolutions: 480p, 720p
  🎵 Audio: ✓ Supported
```

### Kling Models
```
Kling 2.6:
  ⏱ Durations: 5s, 10s
  📐 Aspect Ratios: 1:1, 16:9, 9:16, 4:3, 3:4
  📺 Resolutions: 480p, 720p, 1080p
  🎵 Audio: ✓ Supported

Kling 2.5 Turbo:
  ⏱ Durations: 5s, 10s
  📐 Aspect Ratios: 1:1, 16:9, 9:16, 4:3, 3:4
  📺 Resolutions: 480p, 720p
  🎵 Audio: ✗ Not supported

Kling Motion Control:
  ⏱ Durations: 5s, 10s
  📐 Aspect Ratios: 1:1, 16:9, 9:16
  📺 Resolutions: 480p, 720p, 1080p
  🎵 Audio: ✗ Not supported
```

## Tính năng mới

### 1. Dynamic Options
- Dropdown menus tự động cập nhật dựa trên model được chọn
- User chỉ thấy các options mà model hỗ trợ

### 2. Auto-adjustment
- Khi đổi model, giá trị không hợp lệ tự động chuyển về default
- Ví dụ: Đổi từ Veo 3 (4s) sang Kling (5s hoặc 10s) → Tự động chọn 5s

### 3. Audio Control
- Toggle tự động disable nếu model không hỗ trợ
- Hiển thị "(Not supported)" rõ ràng

### 4. Capabilities Display
- Panel mới hiển thị khả năng của model hiện tại
- User có thể xem nhanh model hỗ trợ gì

### 5. Backend Validation
- Service tự động validate và điều chỉnh giá trị
- Đảm bảo request gửi đến API provider luôn hợp lệ

## Breaking Changes

Không có breaking changes. API vẫn tương thích ngược.

## Testing Checklist

- [ ] Chọn Veo 3 → Dropdown chỉ hiển thị 4s, 6s, 8s
- [ ] Chọn Kling 2.6 → Dropdown chỉ hiển thị 5s, 10s
- [ ] Đổi từ Veo sang Kling → Duration tự động điều chỉnh
- [ ] Chọn Kling 2.5 Turbo → Audio toggle disabled
- [ ] Kiểm tra capabilities panel hiển thị đúng thông tin
- [ ] Test API `/api/v1/models` trả về capabilities

## Next Steps (Tùy chọn)

1. Thêm validation tooltip khi user cố chọn option không hợp lệ
2. Thêm animation khi auto-adjust settings
3. Lưu preferences của user cho từng model
4. Thêm unit tests cho helper functions
5. Thêm E2E tests cho flow đổi model

## Notes

- Kling models có nhiều aspect ratios hơn Veo 3 (bao gồm 1:1, 4:3, 3:4)
- Một số Kling models không hỗ trợ audio (Turbo, Motion Control)
- Frontend tự động sync với backend capabilities, không cần hardcode

## Migration Guide

Nếu có models mới, chỉ cần:

1. Thêm vào `MODEL_CAPABILITIES` trong `modelCapabilities.ts`
2. Thêm vào database seeder trong `prisma/seed.ts`
3. Frontend tự động nhận và hiển thị đúng options

Không cần sửa code frontend! 🎉
