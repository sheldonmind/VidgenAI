import prisma from "../src/prisma";
import { uploadLocalFileToCloudinary } from "../src/services/cloudinaryService";
import fs from "fs";
import path from "path";

/**
 * Script to re-upload old videos from local storage to Cloudinary
 * This fixes videos that were using ngrok/cloudflare URLs
 */

async function reuploadOldVideos() {
  console.log("🔍 Finding videos with old URLs...\n");

  // Find all completed generations with non-Cloudinary URLs
  const oldVideos = await prisma.generation.findMany({
    where: {
      status: "completed",
      videoUrl: {
        not: null,
        not: {
          contains: "cloudinary.com"
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  console.log(`📊 Found ${oldVideos.length} videos with old URLs\n`);

  if (oldVideos.length === 0) {
    console.log("✅ All videos are already on Cloudinary!");
    return;
  }

  const uploadsDir = path.join(__dirname, "../uploads");
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < oldVideos.length; i++) {
    const video = oldVideos[i];
    console.log(`\n[${i + 1}/${oldVideos.length}] Processing: ${video.id}`);
    console.log(`   Created: ${video.createdAt.toLocaleString()}`);
    console.log(`   Old URL: ${video.videoUrl?.substring(0, 60)}...`);

    // Extract filename from URL
    const videoFilename = video.videoUrl?.split("/uploads/").pop()?.split("?")[0];
    const thumbnailFilename = video.thumbnailUrl?.split("/uploads/").pop()?.split("?")[0];

    if (!videoFilename) {
      console.log(`   ⚠️  Cannot extract filename from URL, skipping`);
      skippedCount++;
      continue;
    }

    const videoPath = path.join(uploadsDir, videoFilename);

    // Check if local file exists
    if (!fs.existsSync(videoPath)) {
      console.log(`   ❌ Local file not found: ${videoFilename}`);
      failCount++;
      continue;
    }

    try {
      // Upload video to Cloudinary
      console.log(`   📤 Uploading video to Cloudinary...`);
      const cloudinaryVideoUrl = await uploadLocalFileToCloudinary(videoFilename, 'video');
      console.log(`   ☁️  Video URL: ${cloudinaryVideoUrl}`);

      // Upload thumbnail if exists
      let cloudinaryThumbnailUrl = cloudinaryVideoUrl;
      if (thumbnailFilename && fs.existsSync(path.join(uploadsDir, thumbnailFilename))) {
        try {
          console.log(`   📤 Uploading thumbnail to Cloudinary...`);
          cloudinaryThumbnailUrl = await uploadLocalFileToCloudinary(thumbnailFilename, 'image');
          console.log(`   ☁️  Thumbnail URL: ${cloudinaryThumbnailUrl}`);
        } catch (thumbError: any) {
          console.log(`   ⚠️  Thumbnail upload failed, using video URL: ${thumbError.message}`);
        }
      } else {
        console.log(`   ℹ️  No local thumbnail found, using video URL`);
      }

      // Update database
      await prisma.generation.update({
        where: { id: video.id },
        data: {
          videoUrl: cloudinaryVideoUrl,
          thumbnailUrl: cloudinaryThumbnailUrl,
          updatedAt: new Date()
        }
      });

      console.log(`   ✅ Successfully re-uploaded and updated database`);
      successCount++;

    } catch (error: any) {
      console.error(`   ❌ Failed to upload: ${error.message}`);
      failCount++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 Re-upload Summary:");
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   ⚠️  Skipped: ${skippedCount}`);
  console.log(`   📦 Total: ${oldVideos.length}`);
  console.log("=".repeat(60) + "\n");

  await prisma.$disconnect();
}

// Run the script
reuploadOldVideos().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
