# 🚀 Hướng dẫn Push Code lên GitHub

## Bước 1: Khởi tạo Git Repository

```bash
cd /Users/luongphuong/CreateAI
git init
```

## Bước 2: Thêm Remote Repository

```bash
git remote add origin https://github.com/Bphuong173/VidgenAI.git
```

## Bước 3: Kiểm tra các file sẽ được commit

```bash
git status
```

**Lưu ý**: File `.env` sẽ KHÔNG được push (đã có trong `.gitignore`)

## Bước 4: Add tất cả files

```bash
git add .
```

## Bước 5: Commit code

```bash
git commit -m "Initial commit: VidgenAI - AI-powered video generation platform"
```

## Bước 6: Đổi tên branch sang main (nếu cần)

```bash
git branch -M main
```

## Bước 7: Push lên GitHub

```bash
git push -u origin main
```

## ⚠️ Xác thực GitHub

GitHub không còn hỗ trợ password authentication. Bạn cần dùng một trong hai phương pháp:

### Option 1: Personal Access Token (PAT) - Khuyến nghị

1. Vào GitHub Settings: https://github.com/settings/tokens
2. Chọn **Developer settings** → **Personal access tokens** → **Tokens (classic)**
3. Click **Generate new token (classic)**
4. Đặt tên cho token (ví dụ: "VidgenAI Push Access")
5. Chọn quyền: `repo` (full control of private repositories)
6. Click **Generate token**
7. **Copy token ngay** (chỉ hiển thị một lần!)

Khi push, dùng token thay cho password:
- Username: `Bphuong173`
- Password: `<paste_your_token_here>`

### Option 2: SSH Key

```bash
# Tạo SSH key mới
ssh-keygen -t ed25519 -C "your_email@example.com"

# Copy public key
cat ~/.ssh/id_ed25519.pub

# Thêm vào GitHub: Settings → SSH and GPG keys → New SSH key

# Đổi remote sang SSH
git remote set-url origin git@github.com:Bphuong173/VidgenAI.git

# Push
git push -u origin main
```

## 🔍 Kiểm tra

Sau khi push thành công, truy cập:
https://github.com/Bphuong173/VidgenAI

## 📝 Các file đã được tạo

✅ `.gitignore` - Loại bỏ files không cần thiết (node_modules, .env, uploads, etc.)  
✅ `FE/.gitignore` - Gitignore riêng cho Frontend  
✅ `README.md` - Tài liệu tổng quan project  
✅ `BE/env.example` - Template cho environment variables  
✅ `.gitattributes` - Đảm bảo line endings nhất quán

## 🛡️ Bảo mật

Các file sau đã được gitignore và KHÔNG được push lên GitHub:
- ❌ `.env` (chứa API keys)
- ❌ `node_modules/` (dependencies)
- ❌ `uploads/` (user files)
- ❌ `dist/` và `build/` (build outputs)

## 🔄 Cập nhật sau này

Khi có thay đổi, chỉ cần:

```bash
git add .
git commit -m "Your commit message"
git push
```

---

**Need help?** Contact: Bphuong173
