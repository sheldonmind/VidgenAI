# VidgenAI

AI-powered video generation platform supporting multiple AI models including **Kling AI** and **Google Veo 3**. Transform text, images, and videos into stunning AI-generated videos.

## 🚀 Features

- 🎬 **Text-to-Video**: Generate videos from text prompts
- 🖼️ **Image-to-Video**: Animate static images into dynamic videos
- 🎭 **Motion Control**: Transfer motion from reference videos to characters
- 📹 **Video-to-Video**: Transform and enhance existing videos
- 🤖 **Multiple AI Models**: Support for Kling AI and Google Veo 3
- 🔄 **Real-time Status**: Background polling with live generation status updates
- 🎨 **Modern UI**: Beautiful and responsive interface built with React

## 📁 Project Structure

```
VidgenAI/
├── BE/                 # Backend API (Node.js + Express + TypeScript + PostgreSQL)
│   ├── src/           # Source code
│   ├── prisma/        # Database schema and migrations
│   └── uploads/       # Temporary file storage (gitignored)
│
└── FE/                 # Frontend App (React + Vite + TailwindCSS)
    ├── src/           # React components
    └── public/        # Static assets
```

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL + Prisma ORM
- **AI Services**: Kling AI, Google Veo 3
- **File Upload**: Multer
- **Video Processing**: FFmpeg

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **Icons**: Lucide React

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Docker (optional, for PostgreSQL)

### 1. Clone the repository

```bash
git clone https://github.com/Bphuong173/VidgenAI.git
cd VidgenAI
```

### 2. Setup Backend

```bash
cd BE

# Install dependencies
npm install

# Copy environment file
cp env.example .env

# Add your API keys to .env:
# - KLING_API_KEY (get from https://klingai.com or https://aimlapi.com)
# - GOOGLE_API_KEY (get from https://aistudio.google.com/apikey)

# Start PostgreSQL (using Docker)
docker-compose up -d

# Run database migrations
npm run prisma:migrate

# Seed AI models
npm run seed

# Start development server
npm run dev
```

Backend will run at `http://localhost:4000`

### 3. Setup Frontend

```bash
cd FE

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend will run at `http://localhost:5173`

## 📖 Documentation

- **Backend**: See [BE/README.md](./BE/README.md) for detailed API documentation
- **Cloudinary Setup**: See [BE/CLOUDINARY_SETUP.md](./BE/CLOUDINARY_SETUP.md) for cloud storage configuration

## 🎥 Supported AI Models

### Kling AI
- Kling 2.6 (text-to-video, image-to-video)
- Kling Motion Control

### Google Veo 3
- Veo 3 (text-to-video, image-to-video)
- High quality output with advanced capabilities

## 🔑 Environment Variables

### Backend (.env)

```env
# Server
PORT=4000
BASE_URL=http://localhost:4000
CORS_ORIGIN=http://localhost:5173

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/createai

# AI Services
KLING_API_KEY=your_kling_api_key
KLING_API_BASE_URL=https://api.aimlapi.com
GOOGLE_API_KEY=your_google_api_key
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is private and proprietary.

## 👥 Authors

- **Bphuong173** - [GitHub Profile](https://github.com/Bphuong173)

## 🙏 Acknowledgments

- [Kling AI](https://klingai.com) for video generation API
- [Google Veo 3](https://deepmind.google/technologies/veo/) for advanced video synthesis
- [AIMLAPI](https://aimlapi.com) for API gateway services
