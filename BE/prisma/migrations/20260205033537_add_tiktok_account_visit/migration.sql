-- CreateTable
CREATE TABLE "TikTokAccountVisit" (
    "id" TEXT NOT NULL,
    "accountUrl" TEXT NOT NULL,
    "username" TEXT,
    "videos" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TikTokAccountVisit_pkey" PRIMARY KEY ("id")
);
