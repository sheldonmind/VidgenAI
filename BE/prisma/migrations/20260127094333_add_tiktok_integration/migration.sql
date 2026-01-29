-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "autoPostToTiktok" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tiktokPostId" TEXT,
ADD COLUMN     "tiktokPostStatus" TEXT;

-- CreateTable
CREATE TABLE "TiktokToken" (
    "id" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TiktokToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TiktokSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "autoPostMotionControl" BOOLEAN NOT NULL DEFAULT false,
    "defaultPrivacyLevel" TEXT NOT NULL DEFAULT 'PUBLIC_TO_EVERYONE',
    "defaultTitle" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TiktokSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TiktokToken_openId_key" ON "TiktokToken"("openId");
