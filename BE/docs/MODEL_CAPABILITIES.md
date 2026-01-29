# Model Capabilities Configuration

## Tổng quan

Hệ thống hỗ trợ nhiều AI models khác nhau để tạo video, mỗi model có các khả năng và giới hạn riêng về duration, aspect ratio, resolution và audio.

## Cấu trúc Model Capabilities

File cấu hình: `src/config/modelCapabilities.ts`

Mỗi model có các thuộc tính sau:

```typescript
interface ModelCapability {
  name: string;                 // Tên model
  provider: 'google' | 'kling';  // Nhà cung cấp
  durations: string[];          // Danh sách độ dài video hỗ trợ
  aspectRatios: string[];       // Danh sách tỷ lệ khung hình hỗ trợ
  resolutions: string[];        // Danh sách độ phân giải hỗ trợ
  supportsAudio: boolean;       // Hỗ trợ audio hay không
  defaultDuration: string;      // Độ dài mặc định
  defaultAspectRatio: string;   // Tỷ lệ khung hình mặc định
  defaultResolution: string;    // Độ phân giải mặc định
}
```

## Cấu hình các Models

### Google Veo 3 Models

#### Veo 3 / Veo 3.1
- **Durations**: 4s, 6s, 8s
- **Aspect Ratios**: 16:9, 9:16
- **Resolutions**: 480p, 720p, 1080p
- **Audio**: ✓ Supported

#### Veo 3 Fast
- **Durations**: 4s, 6s, 8s
- **Aspect Ratios**: 16:9, 9:16
- **Resolutions**: 480p, 720p
- **Audio**: ✓ Supported

### Kling AI Models

#### Kling 2.6
- **Durations**: 5s, 10s
- **Aspect Ratios**: 1:1, 16:9, 9:16, 4:3, 3:4
- **Resolutions**: 480p, 720p, 1080p
- **Audio**: ✓ Supported

#### Kling 2.5 Turbo
- **Durations**: 5s, 10s
- **Aspect Ratios**: 1:1, 16:9, 9:16, 4:3, 3:4
- **Resolutions**: 480p, 720p
- **Audio**: ✗ Not supported

#### Kling Motion Control
- **Durations**: 5s, 10s
- **Aspect Ratios**: 1:1, 16:9, 9:16
- **Resolutions**: 480p, 720p, 1080p
- **Audio**: ✗ Not supported

## Cách thức hoạt động

### Backend

1. **API Models**: Endpoint `/api/v1/models` trả về danh sách models kèm capabilities
2. **Validation**: Services (Veo3Service, KlingService) tự động validate và điều chỉnh giá trị về gần nhất nếu không hợp lệ
3. **Helper Functions**:
   - `getModelCapabilities(modelName)`: Lấy capabilities của một model
   - `isDurationSupported(modelName, duration)`: Kiểm tra duration có được hỗ trợ không
   - `isAspectRatioSupported(modelName, aspectRatio)`: Kiểm tra aspect ratio có được hỗ trợ không
   - `isResolutionSupported(modelName, resolution)`: Kiểm tra resolution có được hỗ trợ không
   - `getNearestSupportedDuration(modelName, duration)`: Tìm duration gần nhất được hỗ trợ

### Frontend

1. **Dynamic Options**: Dropdown menus (Duration, Aspect Ratio, Resolution) tự động cập nhật dựa trên model được chọn
2. **Auto-adjustment**: Khi đổi model, các giá trị không hợp lệ sẽ tự động chuyển về giá trị mặc định của model mới
3. **Audio Control**: Toggle audio tự động disable nếu model không hỗ trợ
4. **Capabilities Display**: Hiển thị thông tin về khả năng của model hiện tại

## Ví dụ sử dụng

### Thêm Model mới

```typescript
// Trong src/config/modelCapabilities.ts
export const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  // ... các models hiện tại ...
  
  "New Model Name": {
    name: "New Model Name",
    provider: "google", // hoặc "kling"
    durations: ["3s", "5s", "10s"],
    aspectRatios: ["16:9", "1:1"],
    resolutions: ["720p", "1080p", "4K"],
    supportsAudio: true,
    defaultDuration: "5s",
    defaultAspectRatio: "16:9",
    defaultResolution: "1080p"
  }
};
```

### Kiểm tra Validation trong Service

```typescript
import { getNearestSupportedDuration } from "../config/modelCapabilities";

const requestedDuration = "7s";
const modelName = "Kling 2.6";
const validDuration = getNearestSupportedDuration(modelName, requestedDuration);
// Kết quả: "5s" hoặc "10s" (tùy thuộc vào giá trị gần nhất)
```

## API Response Example

```json
{
  "data": [
    {
      "id": "cm5kw...",
      "name": "Kling 2.6",
      "category": "GENERAL",
      "capabilities": {
        "name": "Kling 2.6",
        "provider": "kling",
        "durations": ["5s", "10s"],
        "aspectRatios": ["1:1", "16:9", "9:16", "4:3", "3:4"],
        "resolutions": ["480p", "720p", "1080p"],
        "supportsAudio": true,
        "defaultDuration": "5s",
        "defaultAspectRatio": "16:9",
        "defaultResolution": "720p"
      }
    }
  ]
}
```

## Lưu ý quan trọng

1. **Kling Models chỉ hỗ trợ 5s và 10s**: Mọi giá trị duration khác sẽ được tự động điều chỉnh về 5s (nếu < 7.5s) hoặc 10s (nếu ≥ 7.5s)

2. **Veo 3 Models chỉ hỗ trợ 4s, 6s, 8s**: Giá trị duration sẽ được snap về giá trị gần nhất

3. **Audio Support**: Một số models như Kling 2.5 Turbo và Kling Motion Control không hỗ trợ audio generation

4. **Aspect Ratios**: 
   - Veo 3: Chỉ hỗ trợ 16:9 và 9:16
   - Kling: Hỗ trợ nhiều tỷ lệ hơn bao gồm 1:1, 4:3, 3:4

5. **Frontend Auto-sync**: Khi user chọn model mới, UI sẽ tự động:
   - Load các options phù hợp
   - Reset các giá trị không hợp lệ về defaults
   - Disable audio nếu không được hỗ trợ
