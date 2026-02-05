# Quy Trình Generate Construction Stages

## Tổng Quan

Hệ thống generate 7 giai đoạn xây dựng từ một ảnh reference (ngôi nhà hoàn chỉnh), tạo ra chuỗi ảnh thể hiện quá trình xây dựng từ nhà hoàn chỉnh ngược về foundation rồi tiến lên hoàn thiện.

**Lưu ý**: Stage 1 giữ nguyên ảnh reference (nhà hoàn chỉnh) mà người dùng upload, không generate gì cả. Các stage từ Stage 2 trở đi mới bắt đầu generate.

## Quy Trình Generate

### Input
- **Ảnh Reference**: Người dùng upload ảnh ngôi nhà hoàn chỉnh (đã xây xong, có landscaping)

### Quy Trình Tuần Tự (Sequential)

```
Reference Image (Nhà hoàn chỉnh)
    ↓ [Stage 1: Pass through - giữ nguyên]
IMAGE 1: Completed House (Reference - giữ nguyên ảnh upload)
    ↓ [Stage 2: strength 0.3]
IMAGE 2: Completed House (No Landscape)
    ↓ [Stage 3: strength 0.35]
IMAGE 3: Exterior Finish Removed
    ↓ [Stage 4: strength 0.35]
IMAGE 4: Walls and Roof Structure
    ↓ [Stage 5: strength 0.35]
IMAGE 5: Structural Frame Only
    ↓ [Stage 6: strength 0.35]
IMAGE 6: Foundation Stage
    ↓ [Stage 7: strength 0.4]
IMAGE 7: Empty Land / Pre-Construction
```

**Lưu ý quan trọng**: 
- Stage 1 giữ nguyên ảnh reference (nhà hoàn chỉnh) mà người dùng upload, không generate gì cả
- Các stage từ Stage 2 trở đi sử dụng ảnh output của stage trước đó làm input, đảm bảo tính liên tục và nhất quán

## GLOBAL RULES (BẮT BUỘC)

* Exact same house from reference image
* Identical architecture, size, proportions
* Identical camera angle, lens, perspective
* Identical location, background, horizon
* NO redesign, NO style change, NO creativity
* Construction realism, civil-engineering accurate
* Use previous image output as next input

## Chi Tiết Từng Stage

### IMAGE 1 — COMPLETED HOUSE (REFERENCE)
- **Input**: Ảnh reference (nhà hoàn chỉnh) - người dùng upload
- **Output**: Giữ nguyên ảnh reference (không generate, chỉ pass through)
- **Strength**: Không áp dụng (không gọi API generate)
- **Prompt**: PASS THROUGH — use the uploaded reference image of the completed house.
- **Mô tả**: Stage này giữ nguyên ảnh nhà hoàn chỉnh mà người dùng upload, không thay đổi gì cả. Đây là điểm bắt đầu của chuỗi construction stages.

### IMAGE 2 — COMPLETED HOUSE (NO LANDSCAPE)
- **Input**: Ảnh Stage 1 (nhà hoàn chỉnh)
- **Output**: Ảnh nhà hoàn chỉnh nhưng không có landscaping
- **Strength**: 0.3 (thay đổi nhỏ, chỉ xóa landscaping)
- **Prompt**: create an image from the exact same camera angle, perspective, and distance of this exact house shown in the reference image. The building must be fully completed and identical to the reference house in shape, roof form, materials, and proportions. Remove all landscaping elements completely: no grass, no plants, no trees, no pathways. The house must sit on bare soil only. Do not change the architecture. It should look like a realistic and accurate construction site after landscaping removal.
- **Mô tả**: Nhà hoàn chỉnh giống hệt reference nhưng loại bỏ hoàn toàn tất cả landscaping (cỏ, cây, đường đi). Nhà ngồi trên đất trần.

### IMAGE 3 — EXTERIOR FINISH REMOVED
- **Input**: Ảnh Stage 2 (nhà hoàn chỉnh không có landscaping)
- **Output**: Ảnh nhà có exposed walls, chưa có exterior finishing
- **Strength**: 0.35 (thay đổi vừa phải để loại bỏ exterior finish)
- **Prompt**: create an image from the exact same camera angle and perspective of this exact house before exterior finishing was applied. The building structure must match the reference house exactly in size and shape. Exterior paint, cladding, and decorative finishes are removed, exposing raw concrete and brick surfaces. Windows and doors remain in the same positions and proportions as the reference. The environment should look like a realistic and accurate construction site.
- **Mô tả**: Nhà có exposed concrete và brick walls, không có sơn hay decorative materials. Cửa sổ và cửa ra vào vẫn ở đúng vị trí như reference.

### IMAGE 4 — WALLS AND ROOF STRUCTURE
- **Input**: Ảnh Stage 3 (exterior finish removed)
- **Output**: Ảnh nhà có walls và roof structure nhưng chưa có roof covering
- **Strength**: 0.35 (thay đổi vừa phải)
- **Prompt**: create an image from the exact same camera angle and perspective of this exact house during structural construction. The building must show completed structural walls and a visible roof structure made of beams and trusses, but no roof covering materials. No exterior finishes are present. Scaffolding and basic construction materials may appear. The building footprint, height, and roof geometry must exactly match the reference house. It should look like a realistic and accurate construction site.
- **Mô tả**: Nhà có structural walls và roof structure (beams và trusses) nhưng chưa có roof covering. Có thể có giàn giáo và vật liệu xây dựng. Không có exterior finishes.

### IMAGE 5 — STRUCTURAL FRAME ONLY
- **Input**: Ảnh Stage 4 (walls và roof structure)
- **Output**: Ảnh chỉ có structural frame (columns, beams)
- **Strength**: 0.35 (thay đổi vừa phải)
- **Prompt**: create an image from the exact same camera angle and perspective of this exact house before walls were built. Only the load-bearing structure is visible, including columns, beams, and the main structural frame. No walls, no roof covering, and no exterior finishes. The structural proportions must precisely match the final house footprint and volume. It should look like a realistic and accurate construction site.
- **Mô tả**: Chỉ có load-bearing structure (columns, beams, structural frame). Không có walls, không có roof covering, không có exterior finishes. Structural proportions phải khớp chính xác với footprint và volume của nhà cuối cùng.

### IMAGE 6 — FOUNDATION STAGE
- **Input**: Ảnh Stage 5 (structural frame)
- **Output**: Ảnh chỉ có foundation và footings
- **Strength**: 0.35 (thay đổi vừa phải)
- **Prompt**: create an image from the exact same camera angle and perspective of this exact house before the structural frame was constructed. The scene must show only the concrete foundation slab, footings, and plinth beams, with reinforcing steel bars protruding upward. The foundation footprint must exactly match the final house layout. No vertical structures above ground. It should look like a realistic and accurate construction site.
- **Mô tả**: Chỉ có concrete foundation slab, footings, và plinth beams với rebar nhô lên. Foundation footprint phải khớp chính xác với layout của nhà cuối cùng. Không có công trình nào trên mặt đất.

### IMAGE 7 — EMPTY LAND / PRE-CONSTRUCTION
- **Input**: Ảnh Stage 6 (foundation)
- **Output**: Ảnh empty land trước khi xây dựng
- **Strength**: 0.4 (thay đổi lớn hơn để xóa tất cả construction elements)
- **Prompt**: create an image from the exact same camera angle, perspective, and background of this location before any construction began. The house does not exist. The scene shows flat empty land with natural soil only. The horizon line, terrain slope, and surrounding environment must match the reference image. It should look realistic and geographically consistent.
- **Mô tả**: Nhà không tồn tại. Cảnh chỉ có đất trống với đất tự nhiên. Horizon line, terrain slope, và surrounding environment phải khớp với reference image.

## Các Yếu Tố Đảm Bảo Tính Nhất Quán

### GLOBAL RULES (BASE_PROMPT)
Mỗi stage đều tuân theo GLOBAL RULES:
- **Exact same house**: "Exact same house from reference image"
- **Identical architecture**: "identical architecture, size, proportions"
- **Identical camera**: "identical camera angle, lens, perspective"
- **Identical location**: "identical location, background, horizon"
- **NO changes**: "NO redesign, NO style change, NO creativity"
- **Realism**: "construction realism, civil-engineering accurate"
- **Sequential**: "use previous image output as next input"

### Stage-Specific Prompts
Mỗi stage prompt:
- Luôn nhắc lại "exact same camera angle", "exact same house", "exact same perspective"
- Nhấn mạnh "identical to the reference house" về shape, size, proportions
- Mô tả chi tiết các elements construction (rebar, scaffolding, materials, beams, trusses)
- Tham chiếu rõ ràng đến reference image
- Chỉ mô tả những gì thay đổi ở stage đó
- Kết thúc với "It should look like a realistic and accurate construction site"

### Strength Parameters
- **Stage 1**: Không áp dụng (giữ nguyên ảnh reference, không generate)
- **Stage 2 (0.3)**: Thay đổi nhỏ, chỉ xóa landscaping
- **Stage 3-6 (0.35)**: Thay đổi vừa phải, loại bỏ các lớp construction
- **Stage 7 (0.4)**: Thay đổi lớn hơn để xóa tất cả construction elements

## Code Flow

```typescript
// 1. User uploads reference image
inputImageUrl = uploadImage(file)
currentImageUrl = inputImageUrl

// 2. Loop through 7 stages sequentially
for (stage of CONSTRUCTION_STAGES) {
  // Stage 1: Pass through - giữ nguyên ảnh reference, không generate
  if (stage.stageOrder === 1) {
    // Không gọi API, chỉ giữ nguyên ảnh reference
    stageResult = {
      imageUrl: currentImageUrl,  // Giữ nguyên ảnh reference
      stageOrder: 1,
      stageName: stage.stageName
    }
  } else {
    // Build full prompt
    fullPrompt = BASE_PROMPT + ", " + stage.stagePrompt
    
    // Generate image using previous stage's output
    result = await klingService.generateImageToImage({
      imageUrl: currentImageUrl,  // Output từ stage trước
      prompt: fullPrompt,
      strength: stage.strength
    })
    
    stageResult = {
      imageUrl: result.imageUrl,
      stageOrder: stage.stageOrder,
      stageName: stage.stageName
    }
  }
  
  // Use this result as input for next stage
  currentImageUrl = stageResult.imageUrl
}
```

## Lưu Ý Quan Trọng

1. **Sequential Processing**: Các stage phải chạy tuần tự, không thể parallel vì mỗi stage phụ thuộc vào output của stage trước

2. **Reference Image**: Ảnh reference phải là ngôi nhà hoàn chỉnh để hệ thống có thể "reverse engineer" về các giai đoạn construction

3. **Prompt Specificity**: Prompts càng chi tiết và cụ thể càng tốt để đảm bảo tính nhất quán

4. **Strength Tuning**: Strength parameters được điều chỉnh để:
   - Stage 1: Không generate, giữ nguyên ảnh reference
   - Stage 2: Thay đổi từ nhà hoàn chỉnh về foundation
   - Stage 3-4: Thay đổi vừa phải để xây dựng cấu trúc
   - Stage 5-7: Thay đổi nhỏ để chỉ thêm details

5. **Error Handling**: Nếu một stage fail, hệ thống sẽ return partial results với các stage đã hoàn thành

## Cải Thiện So Với Phiên Bản Trước

### Vấn Đề Cũ
- Prompts quá chung chung, không đủ chi tiết
- Không nhấn mạnh đủ về tính nhất quán
- Thiếu mô tả cụ thể về construction elements
- Không có GLOBAL RULES rõ ràng

### Giải Pháp Mới
- ✅ GLOBAL RULES rõ ràng với các quy tắc bắt buộc
- ✅ Prompts chi tiết hơn với mô tả cụ thể về rebar, scaffolding, materials, beams, trusses
- ✅ Nhấn mạnh "exact same house", "identical", "exact same camera angle" ở mọi stage
- ✅ Mỗi stage prompt đều nhắc lại "exact same camera angle and perspective"
- ✅ Tham chiếu rõ ràng đến reference image với "exact same house shown in the reference image"
- ✅ Mô tả cụ thể từng construction element: foundation slab, footings, plinth beams, reinforcing steel bars, structural frame, roof structure made of beams and trusses
- ✅ Nhấn mạnh "must exactly match", "must precisely match" để đảm bảo tính chính xác
