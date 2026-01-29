import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import prisma from "../prisma";
import { upload } from "../middleware/upload";
import { parseBoolean } from "../utils/parse";
import { veo3Service } from "../services/veo3Service";
import { klingService } from "../services/klingService";
import { checkNow as checkPendingGenerations, startGenerationPoller } from "../services/generationPoller";
import { downloadAndSaveVideo, downloadAndSaveThumbnail, generateVideoThumbnail, deleteFile } from "../utils/storage";
import { uploadLocalFileToCloudinary, deleteFromCloudinary, extractPublicId } from "../services/cloudinaryService";
import axios from "axios";

const router = Router();

/**
 * Helper function to download video and upload to Cloudinary
 * Returns { videoUrl, thumbnailUrl } from Cloudinary
 */
async function processAndUploadVideo(
  videoUrl: string,
  thumbnailUrl: string | null,
  apiKey?: string
): Promise<{ videoUrl: string; thumbnailUrl: string }> {
  // Download video
  const videoFilename = await downloadAndSaveVideo(videoUrl, apiKey);
  
  // Upload video to Cloudinary
  const cloudinaryVideoUrl = await uploadLocalFileToCloudinary(videoFilename, 'video');
  
  // Handle thumbnail
  let cloudinaryThumbnailUrl = cloudinaryVideoUrl;
  if (thumbnailUrl) {
    try {
      const thumbnailFilename = await downloadAndSaveThumbnail(thumbnailUrl, apiKey);
      cloudinaryThumbnailUrl = await uploadLocalFileToCloudinary(thumbnailFilename, 'image');
    } catch (thumbError: any) {
      // Fallback: generate thumbnail from video
      try {
        const thumbnailFilename = await generateVideoThumbnail(videoFilename);
        cloudinaryThumbnailUrl = await uploadLocalFileToCloudinary(thumbnailFilename, 'image');
      } catch (genError: any) {
        // Use video URL as final fallback
      }
    }
  } else {
    // Generate thumbnail from video if not provided
    try {
      const thumbnailFilename = await generateVideoThumbnail(videoFilename);
      cloudinaryThumbnailUrl = await uploadLocalFileToCloudinary(thumbnailFilename, 'image');
    } catch (genError: any) {
      // Silent fallback
    }
  }
  
  return { videoUrl: cloudinaryVideoUrl, thumbnailUrl: cloudinaryThumbnailUrl };
}

const createGenerationSchema = z.object({
  prompt: z.string().min(1).optional(),
  modelId: z.string().optional(),
  modelName: z.string().min(1).optional(),
  duration: z.string().min(1),
  aspectRatio: z.string().min(1),
  resolution: z.string().min(1),
  audioEnabled: z.string().optional(),
  feature: z.enum(["text-to-video", "create", "edit", "motion", "text-to-image", "image-to-image"]).optional(),
  generationType: z
    .enum(["text-to-video", "image-to-video", "video-to-video", "motion-control", "text-to-image", "image-to-image"])
    .optional(),
  // For Motion Control: "image" (max 10s) or "video" (max 30s)
  characterOrientation: z.enum(["image", "video"]).optional(),
  // For image-to-image: strength (0-1) to control transformation amount
  imageStrength: z.string().optional(),
  // Number of images to generate (for text-to-image)
  numberOfImages: z.string().optional(),
  // Auto-post to TikTok after generation completes
  autoPostToTiktok: z.string().optional()
});

const updateGenerationSchema = z.object({
  status: z.enum(["in_progress", "completed", "failed"]).optional(),
  thumbnailUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  providerJobId: z.string().optional()
});

router.post(
  "/",
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "image", maxCount: 1 },
    { name: "characterImage", maxCount: 1 },
    { name: "startFrame", maxCount: 1 },
    { name: "endFrame", maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      // Log request body for debugging
      console.log('📥 Request body:', req.body);
      console.log('📥 Request body keys:', Object.keys(req.body));
      
      let parsed;
      try {
        parsed = createGenerationSchema.parse(req.body);
      } catch (validationError: any) {
        if (validationError.errors) {
          // Zod validation error
          const errorDetails = validationError.errors.map((err: any) => ({
            path: err.path.join('.'),
            message: err.message
          }));
          console.error('❌ Validation error:', errorDetails);
          return res.status(400).json({ 
            error: 'Validation failed', 
            details: errorDetails 
          });
        }
        throw validationError;
      }
      const files = req.files as
        | {
            [fieldname: string]: Express.Multer.File[];
          }
        | undefined;

      const videoFile = files?.video?.[0];
      const imageFile = files?.image?.[0];
      const characterFile = files?.characterImage?.[0];
      const startFrameFile = files?.startFrame?.[0];
      const endFrameFile = files?.endFrame?.[0];

      // Upload input files to Cloudinary (REQUIRED - no fallback to local URLs)
      let inputVideoUrl: string | undefined;
      let inputImageUrl: string | undefined;
      let characterImageUrl: string | undefined;
      let startFrameUrl: string | undefined;
      let endFrameUrl: string | undefined;

      if (videoFile) {
        inputVideoUrl = await uploadLocalFileToCloudinary(videoFile.filename, 'video');
      }

      if (imageFile) {
        inputImageUrl = await uploadLocalFileToCloudinary(imageFile.filename, 'image');
      }

      if (characterFile) {
        characterImageUrl = await uploadLocalFileToCloudinary(characterFile.filename, 'image');
      }

      if (startFrameFile) {
        startFrameUrl = await uploadLocalFileToCloudinary(startFrameFile.filename, 'image');
        // For text-to-image with start frame, use startFrameUrl as inputImageUrl
        if (!inputImageUrl) {
          inputImageUrl = startFrameUrl;
        }
      }

      if (endFrameFile) {
        endFrameUrl = await uploadLocalFileToCloudinary(endFrameFile.filename, 'image');
      }

      const audioEnabled = parseBoolean(parsed.audioEnabled);
      const feature =
        parsed.feature ||
        (characterImageUrl ? "motion" : inputImageUrl && parsed.generationType === "image-to-image" ? "image-to-image" : inputImageUrl ? "create" : parsed.generationType === "text-to-image" ? "text-to-image" : "text-to-video");
      const generationType =
        parsed.generationType ||
        (characterImageUrl
          ? "motion-control"
          : inputVideoUrl
            ? "video-to-video"
            : inputImageUrl && parsed.feature === "image-to-image"
              ? "image-to-image"
              : inputImageUrl
                ? "image-to-video"
                : parsed.feature === "text-to-image"
                  ? "text-to-image"
                  : "text-to-video");

      let modelId: string | null = parsed.modelId || null;
      let modelName = parsed.modelName;

      if (!modelName && modelId) {
        const model = await prisma.model.findUnique({ where: { id: modelId } });
        if (model) {
          modelName = model.name;
        }
      }

      if (!modelName) {
        modelName = "Unknown Model";
      }

      const autoPostToTiktok = parseBoolean(parsed.autoPostToTiktok);
      
      console.log('✅ Creating generation with:', {
        modelName,
        generationType,
        feature,
        duration: parsed.duration,
        aspectRatio: parsed.aspectRatio,
        resolution: parsed.resolution
      });
      
      const generation = await prisma.generation.create({
        data: {
          id: randomUUID(),
          prompt: parsed.prompt,
          modelId: modelId,
          modelName,
          duration: parsed.duration,
          aspectRatio: parsed.aspectRatio,
          resolution: parsed.resolution,
          audioEnabled: audioEnabled ?? true,
          feature,
          generationType,
          status: "in_progress",
          inputVideoUrl,
          inputImageUrl,
          characterImageUrl,
          autoPostToTiktok: autoPostToTiktok ?? false,
          updatedAt: new Date()
        } as any
      });
      
      console.log('✅ Generation created successfully:', generation.id);

      // Determine which service to use based on model name
      const isKlingModel = modelName?.toLowerCase().includes('kling');
      
      if (isKlingModel && klingService.isConfigured()) {
        const imageStrength = parsed.imageStrength ? parseFloat(parsed.imageStrength) : undefined;
        const numberOfImages = parsed.numberOfImages ? parseInt(parsed.numberOfImages) : undefined;
        
        console.log('🚀 Starting Kling generation process');
        processKlingGeneration(generation.id, {
          prompt: parsed.prompt,
          modelName,
          duration: parsed.duration,
          aspectRatio: parsed.aspectRatio,
          resolution: parsed.resolution,
          audioEnabled: audioEnabled ?? true,
          generationType,
          inputVideoUrl,
          inputImageUrl,
          characterImageUrl,
          characterOrientation: parsed.characterOrientation,
          imageStrength,
          numberOfImages,
          endFrameUrl
        }).catch((err) => {
          console.error('❌ Error in processKlingGeneration (caught):', err);
        });
      } else if (veo3Service.isConfigured()) {
        processVeo3Generation(generation.id, {
          prompt: parsed.prompt,
          modelName,
          duration: parsed.duration,
          aspectRatio: parsed.aspectRatio,
          resolution: parsed.resolution,
          audioEnabled: audioEnabled ?? true,
          generationType,
          inputVideoUrl,
          inputImageUrl,
          characterImageUrl,
          endFrameUrl
        }).catch(() => {});
      }

      // Restart smart polling if it was stopped (when new video generation starts)
      startGenerationPoller();

      res.status(201).json({ data: generation });
    } catch (error: any) {
      console.error('❌ Error creating generation:', error.message);
      console.error('❌ Error stack:', error.stack);
      next(error);
    }
  }
);

router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const cursor = req.query.cursor?.toString();
    const status = req.query.status?.toString();
    const feature = req.query.feature?.toString();

    const generations = await prisma.generation.findMany({
      take: limit,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor }
          }
        : {}),
      where: {
        ...(status ? { status } : {}),
        ...(feature ? { feature } : {})
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ data: generations });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const generation = await prisma.generation.findUnique({
      where: { id: req.params.id }
    });

    if (!generation) {
      res.status(404).json({ error: "Generation not found" });
      return;
    }

    res.json({ data: generation });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const parsed = updateGenerationSchema.parse(req.body);
    const generation = await prisma.generation.update({
      where: { id: req.params.id },
      data: parsed
    });
    res.json({ data: generation });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper function to delete file from both local storage and Cloudinary
 */
async function deleteFileFromAllLocations(fileUrl: string, resourceType: 'image' | 'video' = 'video'): Promise<void> {
  if (!fileUrl) return;
  
  // Delete from local storage
  deleteFile(fileUrl);
  
  // Delete from Cloudinary if it's a Cloudinary URL
  if (fileUrl.includes('cloudinary.com')) {
    const publicId = extractPublicId(fileUrl);
    if (publicId) {
      await deleteFromCloudinary(publicId, resourceType);
    }
  }
}

/**
 * Delete a generation and its associated files
 */
router.delete("/:id", async (req, res, next) => {
  try {
    const generation = await prisma.generation.findUnique({
      where: { id: req.params.id }
    });

    if (!generation) {
      res.status(404).json({ error: "Generation not found" });
      return;
    }

    // Delete associated files from both local storage and Cloudinary
    const deletePromises: Promise<void>[] = [];
    
    if (generation.videoUrl) {
      deletePromises.push(deleteFileFromAllLocations(generation.videoUrl, 'video'));
    }
    if (generation.thumbnailUrl && generation.thumbnailUrl !== generation.videoUrl) {
      deletePromises.push(deleteFileFromAllLocations(generation.thumbnailUrl, 'image'));
    }
    if (generation.inputVideoUrl) {
      deletePromises.push(deleteFileFromAllLocations(generation.inputVideoUrl, 'video'));
    }
    if (generation.inputImageUrl) {
      deletePromises.push(deleteFileFromAllLocations(generation.inputImageUrl, 'image'));
    }
    if (generation.characterImageUrl) {
      deletePromises.push(deleteFileFromAllLocations(generation.characterImageUrl, 'image'));
    }

    // Wait for all delete operations to complete (don't block on errors)
    await Promise.allSettled(deletePromises);

    // Delete from database
    await prisma.generation.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true, message: "Generation deleted successfully" });
  } catch (error) {
    next(error);
  }
});

/**
 * Manual status check endpoint for debugging
 */
router.post("/:id/check-status", async (req, res, next) => {
  try {
    const generation = await prisma.generation.findUnique({
      where: { id: req.params.id }
    });

    if (!generation) {
      res.status(404).json({ error: "Generation not found" });
      return;
    }

    if (!generation.providerJobId) {
      res.status(400).json({ error: "No provider job ID found for this generation" });
      return;
    }

    const isKlingModel = generation.modelName?.toLowerCase().includes('kling');
    
    if (isKlingModel) {
      // Determine task type from generation type
      const taskType = generation.generationType === "motion-control" 
        ? "motion-control" 
        : generation.generationType === "video-to-video"
        ? "video2video"
        : generation.generationType === "image-to-video" 
        ? "image2video"
        : generation.generationType === "text-to-image"
        ? "text2image"
        : generation.generationType === "image-to-image"
        ? "image2image"
        : "text2video";

      // Check status from KLing API
      const status = await klingService.checkGenerationStatus(generation.providerJobId, taskType, generation.modelName);

      if (status.data.task_status === "succeed") {
        const isImageTask = generation.generationType === "text-to-image" || generation.generationType === "image-to-image";
        
        if (isImageTask) {
          // Handle image generation results
          const imageUrl = status.data.task_result?.images?.[0]?.url;
          
          if (imageUrl) {
            try {
              const imageFilename = await downloadAndSaveThumbnail(imageUrl, undefined);
              const cloudinaryImageUrl = await uploadLocalFileToCloudinary(imageFilename, 'image');
              
              const updated = await prisma.generation.update({
                where: { id: generation.id },
                data: {
                  status: "completed",
                  imageUrl: cloudinaryImageUrl,
                  thumbnailUrl: cloudinaryImageUrl,
                  updatedAt: new Date()
                } as any
              });
              res.json({ data: updated, klingStatus: status });
              return;
            } catch (downloadError: any) {
              const updated = await prisma.generation.update({
                where: { id: generation.id },
                data: {
                  status: "failed",
                  errorMessage: `Failed to upload image to Cloudinary: ${downloadError.message}`,
                  updatedAt: new Date()
                }
              });
              res.json({ data: updated, klingStatus: status });
              return;
            }
          }
        } else {
          // Handle video generation results
          const videoUrl = status.data.task_result?.videos?.[0]?.url;
          const thumbnailUrl = status.data.task_result?.videos?.[0]?.cover_url; // Extract cover_url from Kling API

          if (videoUrl) {
            try {
              const { videoUrl: cloudinaryVideoUrl, thumbnailUrl: cloudinaryThumbnailUrl } = 
                await processAndUploadVideo(videoUrl, thumbnailUrl || null, undefined);
              
              const updated = await prisma.generation.update({
                where: { id: generation.id },
                data: {
                  status: "completed",
                  videoUrl: cloudinaryVideoUrl,
                  thumbnailUrl: cloudinaryThumbnailUrl,
                  updatedAt: new Date()
                }
              });
              res.json({ data: updated, klingStatus: status });
              return;
            } catch (downloadError: any) {
              const updated = await prisma.generation.update({
                where: { id: generation.id },
                data: {
                  status: "failed",
                  errorMessage: `Failed to upload to Cloudinary: ${downloadError.message}`,
                  updatedAt: new Date()
                }
              });
              res.json({ data: updated, klingStatus: status });
              return;
            }
          }
        }
      } else if (status.data.task_status === "failed") {
        await prisma.generation.update({
          where: { id: generation.id },
          data: {
            status: "failed",
            updatedAt: new Date()
          }
        });
        res.json({ 
          data: { 
            ...generation, 
            status: "failed" 
          }, 
          klingStatus: status 
        });
        return;
      }

      res.json({ data: generation, klingStatus: status });
      return;
    }

    // Check status from Veo 3 API
    const status = await veo3Service.checkGenerationStatus(generation.providerJobId);

    // If done, update the database
    if (status.done) {
      if (status.error) {
        await prisma.generation.update({
          where: { id: generation.id },
          data: {
            status: "failed",
            updatedAt: new Date()
          }
        });
        res.json({ 
          data: { 
            ...generation, 
            status: "failed" 
          }, 
          veo3Status: status 
        });
        return;
      }

      const videoUrl = veo3Service.extractVideoUrl(status);
      const thumbnailUrl = veo3Service.extractThumbnailUrl(status);

      if (videoUrl) {
        try {
          const apiKey = process.env.GOOGLE_API_KEY;
          const { videoUrl: cloudinaryVideoUrl, thumbnailUrl: cloudinaryThumbnailUrl } = 
            await processAndUploadVideo(videoUrl, thumbnailUrl || null, apiKey);
          
          const updated = await prisma.generation.update({
            where: { id: generation.id },
            data: {
              status: "completed",
              videoUrl: cloudinaryVideoUrl,
              thumbnailUrl: cloudinaryThumbnailUrl,
              updatedAt: new Date()
            }
          });
          res.json({ data: updated, veo3Status: status });
          return;
          } catch (downloadError: any) {
            const updated = await prisma.generation.update({
              where: { id: generation.id },
              data: {
                status: "completed",
                videoUrl: videoUrl,
                thumbnailUrl: thumbnailUrl || videoUrl,
                updatedAt: new Date()
              }
            });
            res.json({ data: updated, veo3Status: status });
            return;
          }
        }
      }

      res.json({ data: generation, veo3Status: status });
    } catch (error: any) {
    next(error);
  }
});

/**
 * Trigger check for all pending generations
 */
router.post("/check-all-pending", async (req, res, next) => {
  try {
    checkPendingGenerations().catch(() => {});

    res.json({ 
      success: true, 
      message: "Checking all pending generations in background" 
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * Background process to handle Veo 3 video generation
 */
async function processVeo3Generation(
  generationId: string,
  params: {
    prompt?: string;
    modelName: string;
    duration: string;
    aspectRatio: string;
    resolution: string;
    audioEnabled: boolean;
    generationType: string;
    inputVideoUrl?: string;
    inputImageUrl?: string;
    characterImageUrl?: string;
    endFrameUrl?: string;
  }
) {
  try {

    let veo3Response;

    // Veo 3 currently supports text-to-video and image-to-video
    if (params.generationType === "image-to-video" && params.inputImageUrl) {
      // Image-to-Video
      veo3Response = await veo3Service.generateImageToVideo({
        imageUrl: params.inputImageUrl,
        prompt: params.prompt,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        audioEnabled: params.audioEnabled,
        modelName: params.modelName
      });
    } else {
      // Text-to-Video (default)
      if (!params.prompt) {
        throw new Error("Prompt is required for text-to-video generation");
      }
      veo3Response = await veo3Service.generateTextToVideo({
        prompt: params.prompt,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        audioEnabled: params.audioEnabled,
        modelName: params.modelName
      });
    }

    const videoUrl = veo3Service.extractVideoUrl(veo3Response);
    
    if (videoUrl) {
      const thumbnailUrl = veo3Service.extractThumbnailUrl(veo3Response);
      
      try {
        const apiKey = process.env.GOOGLE_API_KEY;
        const { videoUrl: cloudinaryVideoUrl, thumbnailUrl: cloudinaryThumbnailUrl } = 
          await processAndUploadVideo(videoUrl, thumbnailUrl || null, apiKey);
        
        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "completed",
            videoUrl: cloudinaryVideoUrl,
            thumbnailUrl: cloudinaryThumbnailUrl,
            providerJobId: veo3Response.name || undefined,
            updatedAt: new Date()
          }
        });
          } catch (downloadError: any) {
            await prisma.generation.update({
              where: { id: generationId },
              data: {
                status: "completed",
                videoUrl: videoUrl,
                thumbnailUrl: thumbnailUrl,
                providerJobId: veo3Response.name || undefined,
                updatedAt: new Date()
              }
            });
          }
        } else if (veo3Response.name && !veo3Response.done) {
      await prisma.generation.update({
        where: { id: generationId },
        data: {
          providerJobId: veo3Response.name,
          status: "in_progress"
        }
      });

      pollVeo3Generation(generationId, veo3Response.name).catch(() => {});
    } else {
      throw new Error("Veo 3 API returned unexpected response format");
    }
  } catch (error: any) {

    // Parse error to extract code and message
    let errorCode = "UNKNOWN_ERROR";
    let errorMessage = error.message || "Unknown error occurred";

    // Check for specific error types
    if (error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
      errorCode = "QUOTA_EXCEEDED";
      errorMessage = "API quota exceeded. Please check your billing plan or try again later.";
    } else if (error.message?.includes("authentication") || error.message?.includes("unauthorized")) {
      errorCode = "AUTH_ERROR";
      errorMessage = "Authentication failed. Please check your API key.";
    } else if (error.message?.includes("timeout")) {
      errorCode = "TIMEOUT";
      errorMessage = "Request timed out. Please try again.";
    } else if (error.message?.includes("invalid") || error.message?.includes("bad request")) {
      errorCode = "INVALID_REQUEST";
      errorMessage = "Invalid request parameters.";
    }

    // Mark as failed in database with error details
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: "failed",
        errorCode,
        errorMessage,
        updatedAt: new Date()
      }
    });
  }
}

/**
 * Poll Veo 3 API for generation completion
 */
async function pollVeo3Generation(generationId: string, operationName: string) {
  const maxAttempts = 120;
  const intervalMs = 10000;

  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const status = await veo3Service.checkGenerationStatus(operationName);

      if (status.done) {
        if (status.error) {
          let errorCode = "GENERATION_FAILED";
          let errorMessage = status.error.message || "Video generation failed";
          
          await prisma.generation.update({
            where: { id: generationId },
            data: {
              status: "failed",
              errorCode,
              errorMessage,
              updatedAt: new Date()
            }
          });
          return;
        }

        const videoUrl = veo3Service.extractVideoUrl(status);
        const thumbnailUrl = veo3Service.extractThumbnailUrl(status);

        if (videoUrl) {
          try {
            const apiKey = process.env.GOOGLE_API_KEY;
            const { videoUrl: cloudinaryVideoUrl, thumbnailUrl: cloudinaryThumbnailUrl } = 
              await processAndUploadVideo(videoUrl, thumbnailUrl || null, apiKey);
            
            await prisma.generation.update({
              where: { id: generationId },
              data: {
                status: "completed",
                videoUrl: cloudinaryVideoUrl,
                thumbnailUrl: cloudinaryThumbnailUrl,
                updatedAt: new Date()
              }
            });

            return;
          } catch (downloadError: any) {
            await prisma.generation.update({
              where: { id: generationId },
              data: {
                status: "failed",
                errorMessage: `Failed to upload to Cloudinary: ${downloadError.message}`,
                updatedAt: new Date()
              }
            });
            return;
          }
        } else {
          throw new Error("Veo 3 completed but no video URL found");
        }
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      attempts++;
    } catch (error: any) {
      attempts++;

      if (attempts >= 3 && error.message?.includes("API error")) {
        let errorCode = "POLLING_ERROR";
        let errorMessage = error.message || "Failed to check generation status";
        
        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "failed",
            errorCode,
            errorMessage,
            updatedAt: new Date()
          }
        });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  const errorCode = "TIMEOUT";
  const errorMessage = "Generation timed out after maximum polling attempts";
  await prisma.generation.update({
    where: { id: generationId },
    data: {
      status: "failed",
      errorCode,
      errorMessage,
      updatedAt: new Date()
    }
  });
}

/**
 * Background process to handle KLing video generation
 */
async function processKlingGeneration(
  generationId: string,
  params: {
    prompt?: string;
    modelName: string;
    duration: string;
    aspectRatio: string;
    resolution: string;
    audioEnabled: boolean;
    generationType: string;
    inputVideoUrl?: string;
    inputImageUrl?: string;
    characterImageUrl?: string;
    characterOrientation?: "image" | "video";
    imageStrength?: number;
    numberOfImages?: number;
    endFrameUrl?: string;
  }
) {
  try {
    console.log('🔄 Processing Kling generation:', {
      generationId,
      generationType: params.generationType,
      modelName: params.modelName,
      aspectRatio: params.aspectRatio
    });

    let klingResponse;

    // KLing supports text-to-video, image-to-video, video-to-video, motion-control, text-to-image, and image-to-image
    if (params.generationType === "motion-control" && params.inputVideoUrl && params.characterImageUrl) {
      // Motion Control
      klingResponse = await klingService.generateMotionControl({
        videoUrl: params.inputVideoUrl,
        characterImageUrl: params.characterImageUrl,
        prompt: params.prompt,
        duration: params.duration,
        resolution: params.resolution,
        modelName: params.modelName,
        characterOrientation: params.characterOrientation
      });
    } else if (params.generationType === "video-to-video" && params.inputVideoUrl) {
      // Video-to-Video
      klingResponse = await klingService.generateVideoToVideo({
        videoUrl: params.inputVideoUrl,
        prompt: params.prompt,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        audioEnabled: params.audioEnabled,
        modelName: params.modelName
      });
    } else if (params.generationType === "image-to-video" && params.inputImageUrl) {
      // Image-to-Video
      klingResponse = await klingService.generateImageToVideo({
        imageUrl: params.inputImageUrl,
        prompt: params.prompt,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        audioEnabled: params.audioEnabled,
        modelName: params.modelName
      });
    } else if (params.generationType === "image-to-image" && params.inputImageUrl) {
      // Image-to-Image
      if (!params.prompt) {
        throw new Error("Prompt is required for image-to-image generation");
      }
      klingResponse = await klingService.generateImageToImage({
        imageUrl: params.inputImageUrl,
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        strength: params.imageStrength,
        modelName: params.modelName
      });
    } else if (params.generationType === "text-to-image") {
      // Text-to-Image
      console.log('🎨 Generating text-to-image with Kling');
      if (!params.prompt) {
        throw new Error("Prompt is required for text-to-image generation");
      }
      klingResponse = await klingService.generateTextToImage({
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        modelName: params.modelName
      });
      console.log('✅ Kling text-to-image response:', klingResponse);
    } else {
      // Text-to-Video (default)
      if (!params.prompt) {
        throw new Error("Prompt is required for text-to-video generation");
      }
      klingResponse = await klingService.generateTextToVideo({
        prompt: params.prompt,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        audioEnabled: params.audioEnabled,
        modelName: params.modelName
      });
    }

    if (klingResponse.data?.task_id) {
      await prisma.generation.update({
        where: { id: generationId },
        data: {
          providerJobId: klingResponse.data.task_id,
          status: "in_progress"
        }
      });

      const taskType = params.generationType === "motion-control" 
        ? "motion-control" 
        : params.generationType === "video-to-video"
        ? "video2video"
        : params.generationType === "image-to-video" 
        ? "image2video"
        : params.generationType === "text-to-image"
        ? "text2image"
        : params.generationType === "image-to-image"
        ? "image2image"
        : "text2video";

      pollKlingGeneration(generationId, klingResponse.data.task_id, taskType, params.modelName).catch(() => {});
    } else {
      throw new Error("KLing API returned unexpected response format");
    }
  } catch (error: any) {

    // Parse error to extract code and message
    let errorCode = "UNKNOWN_ERROR";
    let errorMessage = error.message || "Unknown error occurred";

    // Check for specific error types
    if (error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
      errorCode = "QUOTA_EXCEEDED";
      errorMessage = "API quota exceeded. Please check your billing plan or try again later.";
    } else if (error.message?.includes("authentication") || error.message?.includes("unauthorized")) {
      errorCode = "AUTH_ERROR";
      errorMessage = "Authentication failed. Please check your API key.";
    } else if (error.message?.includes("timeout")) {
      errorCode = "TIMEOUT";
      errorMessage = "Request timed out. Please try again.";
    } else if (error.message?.includes("invalid") || error.message?.includes("bad request")) {
      errorCode = "INVALID_REQUEST";
      errorMessage = "Invalid request parameters.";
    }

    // Mark as failed in database with error details
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: "failed",
        errorCode,
        errorMessage,
        updatedAt: new Date()
      }
    });
  }
}

/**
 * Poll KLing API for generation completion
 */
async function pollKlingGeneration(generationId: string, klingGenerationId: string, taskType: "text2video" | "image2video" | "video2video" | "motion-control" | "text2image" | "image2image" = "text2video", modelName?: string) {
  const maxAttempts = 120;
  const intervalMs = 10000;

  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const status = await klingService.checkGenerationStatus(klingGenerationId, taskType, modelName);

      if (status.data.task_status === "succeed") {
        const isImageTask = taskType === "text2image" || taskType === "image2image";
        
        if (isImageTask) {
          // Handle image generation results
          const imageUrl = status.data.task_result?.images?.[0]?.url;
          
          if (imageUrl) {
            try {
              // Download and upload image to Cloudinary
              const imageFilename = await downloadAndSaveThumbnail(imageUrl, undefined);
              const cloudinaryImageUrl = await uploadLocalFileToCloudinary(imageFilename, 'image');
              
              await prisma.generation.update({
                where: { id: generationId },
                data: {
                  status: "completed",
                  imageUrl: cloudinaryImageUrl,
                  thumbnailUrl: cloudinaryImageUrl, // Use same URL for thumbnail
                  updatedAt: new Date()
                } as any
              });

              return;
            } catch (downloadError: any) {
              await prisma.generation.update({
                where: { id: generationId },
                data: {
                  status: "failed",
                  errorMessage: `Failed to upload image to Cloudinary: ${downloadError.message}`,
                  updatedAt: new Date()
                }
              });
              return;
            }
          } else {
            throw new Error("KLing completed but no image URL found");
          }
        } else {
          // Handle video generation results
          const videoUrl = status.data.task_result?.videos?.[0]?.url;
          const thumbnailUrl = status.data.task_result?.videos?.[0]?.cover_url; // Extract cover_url from Kling API

          if (videoUrl) {
            try {
              const { videoUrl: cloudinaryVideoUrl, thumbnailUrl: cloudinaryThumbnailUrl } = 
                await processAndUploadVideo(videoUrl, thumbnailUrl || null, undefined);
              
              await prisma.generation.update({
                where: { id: generationId },
                data: {
                  status: "completed",
                  videoUrl: cloudinaryVideoUrl,
                  thumbnailUrl: cloudinaryThumbnailUrl,
                  updatedAt: new Date()
                }
              });

              return;
            } catch (downloadError: any) {
              await prisma.generation.update({
                where: { id: generationId },
                data: {
                  status: "failed",
                  errorMessage: `Failed to upload to Cloudinary: ${downloadError.message}`,
                  updatedAt: new Date()
                }
              });
              return;
            }
          } else {
            throw new Error("KLing completed but no video URL found");
          }
        }
      } else if (status.data.task_status === "failed") {
        const errorMessage = "KLing generation failed";
        const errorCode = "GENERATION_FAILED";
        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "failed",
            errorCode,
            errorMessage,
            updatedAt: new Date()
          }
        });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      attempts++;
    } catch (error: any) {
      attempts++;

      if (attempts >= 3 && error.message?.includes("API error")) {
        const errorCode = "POLLING_ERROR";
        const errorMessage = error.message || "Failed to check generation status";
        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "failed",
            errorCode,
            errorMessage,
            updatedAt: new Date()
          }
        });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  const errorCode = "TIMEOUT";
  const errorMessage = "Generation timed out after maximum polling attempts";
  await prisma.generation.update({
    where: { id: generationId },
    data: {
      status: "failed",
      errorCode,
      errorMessage,
      updatedAt: new Date()
    }
  });
}

/**
 * Proxy endpoint to serve videos from Google API with authentication
 */
router.get("/:id/video", async (req, res, next) => {
  try {
    const generation = await prisma.generation.findUnique({
      where: { id: req.params.id }
    });

    if (!generation) {
      res.status(404).json({ error: "Generation not found" });
      return;
    }

    if (!generation.videoUrl) {
      res.status(404).json({ error: "Video URL not available yet" });
      return;
    }

    if (generation.videoUrl.includes("generativelanguage.googleapis.com")) {

      // Download video from Google API with authentication
      const response = await axios.get(generation.videoUrl, {
        responseType: "stream",
        headers: {
          "x-goog-api-key": process.env.GOOGLE_API_KEY || ""
        }
      });

      // Set appropriate headers
      res.setHeader("Content-Type", response.headers["content-type"] || "video/mp4");
      if (response.headers["content-length"]) {
        res.setHeader("Content-Length", response.headers["content-length"]);
      }
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year

      // Stream the video to the client
      response.data.pipe(res);
    } else {
      // If it's already a local URL, redirect to it
      res.redirect(generation.videoUrl);
    }
  } catch (error: any) {
    next(error);
  }
});

/**
 * Proxy endpoint to serve thumbnails from Google API with authentication
 */
router.get("/:id/thumbnail", async (req, res, next) => {
  try {
    const generation = await prisma.generation.findUnique({
      where: { id: req.params.id }
    });

    if (!generation) {
      res.status(404).json({ error: "Generation not found" });
      return;
    }

    if (!generation.thumbnailUrl) {
      res.status(404).json({ error: "Thumbnail URL not available yet" });
      return;
    }

    if (generation.thumbnailUrl.includes("generativelanguage.googleapis.com")) {

      // Download thumbnail from Google API with authentication
      const response = await axios.get(generation.thumbnailUrl, {
        responseType: "stream",
        headers: {
          "x-goog-api-key": process.env.GOOGLE_API_KEY || ""
        }
      });

      // Set appropriate headers
      res.setHeader("Content-Type", response.headers["content-type"] || "image/jpeg");
      if (response.headers["content-length"]) {
        res.setHeader("Content-Length", response.headers["content-length"]);
      }
      res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year

      // Stream the image to the client
      response.data.pipe(res);
    } else {
      // If it's already a local URL, redirect to it
      res.redirect(generation.thumbnailUrl);
    }
  } catch (error: any) {
    next(error);
  }
});

export default router;
