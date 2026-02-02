import { Router } from "express";
import { z } from "zod";
import prisma from "../prisma";
import { downloadAndSaveVideo, downloadAndSaveThumbnail, generateVideoThumbnail } from "../utils/storage";
import { uploadLocalFileToCloudinary } from "../services/cloudinaryService";

const router = Router();

/**
 * Webhook schema for Kling AI callbacks
 * 
 * Kling API can send webhooks with the following structure:
 * - task_id: The generation ID
 * - task_status: "submitted" | "processing" | "succeed" | "failed"
 * - task_result: Contains videos or images array with url and cover_url
 */
const klingWebhookSchema = z.object({
  // Support both Kling's native format and simplified format
  task_id: z.string().optional(),
  generation_id: z.string().optional(),
  task_status: z.enum(["submitted", "processing", "succeed", "failed"]).optional(),
  status: z.enum(["completed", "failed", "processing"]).optional(),
  task_result: z.object({
    videos: z.array(z.object({
      url: z.string().url(),
      cover_url: z.string().url().optional()
    })).optional(),
    images: z.array(z.object({
      url: z.string().url()
    })).optional()
  }).optional(),
  video_url: z.string().url().optional(),
  thumbnail_url: z.string().url().optional(),
  error: z.string().optional()
});

/**
 * Process video webhook with parallel download and upload
 * OPTIMIZED: Same parallel processing as polling for consistent performance
 */
async function processVideoWebhook(
  generationId: string,
  videoUrl: string,
  thumbnailUrl?: string
): Promise<{ videoUrl: string; thumbnailUrl: string }> {
  const startTime = Date.now();
  console.log(`⚡ [Webhook] Starting optimized parallel video processing...`);
  
  // STEP 1: Download video and thumbnail in PARALLEL
  const videoDownloadPromise = downloadAndSaveVideo(videoUrl, undefined);
  const thumbnailDownloadPromise = thumbnailUrl 
    ? downloadAndSaveThumbnail(thumbnailUrl, undefined).catch(() => null)
    : Promise.resolve(null);
  
  const [videoFilename, thumbnailFilename] = await Promise.all([
    videoDownloadPromise,
    thumbnailDownloadPromise
  ]);
  
  console.log(`⚡ [Webhook] Downloads completed in ${Date.now() - startTime}ms`);
  
  // STEP 2: Upload video and thumbnail in PARALLEL
  const uploadStartTime = Date.now();
  
  const videoUploadPromise = uploadLocalFileToCloudinary(videoFilename, 'video');
  
  let thumbnailUploadPromise: Promise<string>;
  if (thumbnailFilename) {
    thumbnailUploadPromise = uploadLocalFileToCloudinary(thumbnailFilename, 'image');
  } else {
    const genThumbFilename = await generateVideoThumbnail(videoFilename);
    thumbnailUploadPromise = uploadLocalFileToCloudinary(genThumbFilename, 'image');
  }
  
  const [cloudinaryVideoUrl, cloudinaryThumbnailUrl] = await Promise.all([
    videoUploadPromise,
    thumbnailUploadPromise
  ]);
  
  console.log(`⚡ [Webhook] Uploads completed in ${Date.now() - uploadStartTime}ms`);
  console.log(`⚡ [Webhook] Total processing time: ${Date.now() - startTime}ms`);
  
  return { videoUrl: cloudinaryVideoUrl, thumbnailUrl: cloudinaryThumbnailUrl };
}

/**
 * Webhook endpoint for Kling AI to notify us when generation is complete
 * POST /api/v1/webhooks/kling
 * 
 * OPTIMIZED: Uses parallel processing for video download and upload
 * This endpoint handles webhooks MUCH faster than polling
 */
router.post("/kling", async (req, res, next) => {
  try {
    console.log(`📥 [Webhook] Received Kling webhook:`, JSON.stringify(req.body, null, 2));
    
    const parsed = klingWebhookSchema.parse(req.body);
    
    // Support both Kling's native format and simplified format
    const taskId = parsed.task_id || parsed.generation_id;
    const status = parsed.task_status || parsed.status;
    
    if (!taskId) {
      res.status(400).json({ error: "Missing task_id or generation_id" });
      return;
    }

    const generation = await prisma.generation.findFirst({
      where: { providerJobId: taskId }
    });

    if (!generation) {
      console.log(`⚠️ [Webhook] Generation not found for task_id: ${taskId}`);
      res.status(404).json({ error: "Generation not found" });
      return;
    }

    // Handle success status
    if (status === "succeed" || status === "completed") {
      // Extract URLs from Kling's native format or simplified format
      const videoUrl = parsed.task_result?.videos?.[0]?.url || parsed.video_url;
      const thumbnailUrl = parsed.task_result?.videos?.[0]?.cover_url || parsed.thumbnail_url;
      const imageUrl = parsed.task_result?.images?.[0]?.url;
      
      if (videoUrl) {
        // OPTIMIZED: Process video with parallel download/upload
        try {
          const { videoUrl: cloudinaryVideoUrl, thumbnailUrl: cloudinaryThumbnailUrl } = 
            await processVideoWebhook(generation.id, videoUrl, thumbnailUrl);
          
          await prisma.generation.update({
            where: { id: generation.id },
            data: {
              status: "completed",
              videoUrl: cloudinaryVideoUrl,
              thumbnailUrl: cloudinaryThumbnailUrl,
              updatedAt: new Date()
            }
          });
          
          console.log(`✅ [Webhook] Video generation completed: ${generation.id}`);
        } catch (processError: any) {
          console.error(`❌ [Webhook] Failed to process video:`, processError.message);
          await prisma.generation.update({
            where: { id: generation.id },
            data: {
              status: "failed",
              errorMessage: `Webhook processing failed: ${processError.message}`,
              updatedAt: new Date()
            }
          });
        }
      } else if (imageUrl) {
        // Handle image generation
        try {
          const imageFilename = await downloadAndSaveThumbnail(imageUrl, undefined);
          const cloudinaryImageUrl = await uploadLocalFileToCloudinary(imageFilename, 'image');
          
          await prisma.generation.update({
            where: { id: generation.id },
            data: {
              status: "completed",
              imageUrl: cloudinaryImageUrl,
              thumbnailUrl: cloudinaryImageUrl,
              updatedAt: new Date()
            } as any
          });
          
          console.log(`✅ [Webhook] Image generation completed: ${generation.id}`);
        } catch (processError: any) {
          console.error(`❌ [Webhook] Failed to process image:`, processError.message);
          await prisma.generation.update({
            where: { id: generation.id },
            data: {
              status: "failed",
              errorMessage: `Webhook processing failed: ${processError.message}`,
              updatedAt: new Date()
            }
          });
        }
      }
    } else if (status === "failed") {
      await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: "failed",
          errorMessage: parsed.error || "Generation failed",
          updatedAt: new Date()
        }
      });
      console.log(`❌ [Webhook] Generation failed: ${generation.id}`);
    }

    res.json({ success: true, received: true });
  } catch (error) {
    console.error(`❌ [Webhook] Error processing webhook:`, error);
    next(error);
  }
});

/**
 * Manual webhook trigger for testing
 * POST /api/v1/webhooks/kling/test
 */
router.post("/kling/test", async (req, res) => {
  const testWebhook = {
    generation_id: req.body.generation_id || "test-job-id",
    status: "completed",
    video_url: "https://example.com/test-video.mp4",
    thumbnail_url: "https://example.com/test-thumbnail.jpg"
  };

  res.json({
    message: "Test webhook data",
    webhook: testWebhook,
    note: "Use POST /api/v1/webhooks/kling with this structure"
  });
});

export default router;
