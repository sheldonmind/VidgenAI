import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import prisma from "../prisma";
import { upload } from "../middleware/upload";
import { parseBoolean } from "../utils/parse";
import { veo3Service } from "../services/veo3Service";
import { klingService } from "../services/klingService";
import { imagenService } from "../services/imagenService";
import { geminiImageService } from "../services/geminiImageService";
import { checkNow as checkPendingGenerations, startGenerationPoller } from "../services/generationPoller";
import { downloadAndSaveVideo, downloadAndSaveThumbnail, generateVideoThumbnail, deleteFile, mergeVideos } from "../utils/storage";
import { uploadLocalFileToCloudinary, deleteFromCloudinary, extractPublicId } from "../services/cloudinaryService";
import axios from "axios";
import { CONSTRUCTION_STAGES, BASE_PROMPT, buildStagePrompt, getAllStages, getVideoTransitionPrompt, getVideoTitle, generateVideoTransitions, getIntermediateImagePrompt } from "../config/constructionStages";

const router = Router();

/**
 * Helper function to download video and upload to Cloudinary
 * Returns { videoUrl, thumbnailUrl } from Cloudinary
 * 
 * OPTIMIZED: Uses parallel processing for downloads and uploads
 * This can save 10-30 seconds compared to sequential processing
 */
async function processAndUploadVideo(
  videoUrl: string,
  thumbnailUrl: string | null,
  apiKey?: string
): Promise<{ videoUrl: string; thumbnailUrl: string }> {
  const startTime = Date.now();
  console.log(`⚡ Starting optimized parallel video processing...`);
  
  // STEP 1: Download video and thumbnail in PARALLEL
  const videoDownloadPromise = downloadAndSaveVideo(videoUrl, apiKey);
  const thumbnailDownloadPromise = thumbnailUrl 
    ? downloadAndSaveThumbnail(thumbnailUrl, apiKey).catch(() => null)
    : Promise.resolve(null);
  
  const [videoFilename, thumbnailFilename] = await Promise.all([
    videoDownloadPromise,
    thumbnailDownloadPromise
  ]);
  
  console.log(`⚡ Downloads completed in ${Date.now() - startTime}ms`);
  
  // STEP 2: Upload video and prepare thumbnail in PARALLEL
  const uploadStartTime = Date.now();
  
  // Start video upload immediately
  const videoUploadPromise = uploadLocalFileToCloudinary(videoFilename, 'video');
  
  // Determine thumbnail and start upload
  let thumbnailUploadPromise: Promise<string>;
  
  if (thumbnailFilename) {
    // Use downloaded thumbnail
    thumbnailUploadPromise = uploadLocalFileToCloudinary(thumbnailFilename, 'image');
  } else {
    // Generate thumbnail from video (needs to wait for video download)
    try {
      const genThumbFilename = await generateVideoThumbnail(videoFilename);
      thumbnailUploadPromise = uploadLocalFileToCloudinary(genThumbFilename, 'image');
    } catch (genError: any) {
      // Fallback: use video URL as thumbnail
      thumbnailUploadPromise = videoUploadPromise;
    }
  }
  
  // Wait for both uploads to complete
  const [cloudinaryVideoUrl, cloudinaryThumbnailUrl] = await Promise.all([
    videoUploadPromise,
    thumbnailUploadPromise
  ]);
  
  console.log(`⚡ Uploads completed in ${Date.now() - uploadStartTime}ms`);
  console.log(`⚡ Total processing time: ${Date.now() - startTime}ms`);
  
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
  feature: z.enum(["text-to-video", "image-to-video", "create", "edit", "motion", "text-to-image", "image-to-image"]).optional(),
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

      let inputVideoUrl: string | undefined;
      let inputImageUrl: string | undefined;
      let characterImageUrl: string | undefined;
      let startFrameUrl: string | undefined;
      let endFrameUrl: string | undefined;

      if (videoFile) {
        inputVideoUrl = await uploadLocalFileToCloudinary(videoFile.filename, 'video');
      }

      if (imageFile) {
        try {
          inputImageUrl = await uploadLocalFileToCloudinary(imageFile.filename, 'image');
          if (!inputImageUrl || inputImageUrl.trim() === '') {
            throw new Error("Image upload returned empty URL");
          }
          console.log(`✅ Image uploaded to Cloudinary: ${inputImageUrl.substring(0, 50)}...`);
        } catch (error: any) {
          console.error(`❌ Failed to upload image:`, error.message);
          throw new Error(`Failed to upload image: ${error.message}`);
        }
      }

      if (characterFile) {
        try {
          characterImageUrl = await uploadLocalFileToCloudinary(characterFile.filename, 'image');
          if (!characterImageUrl || characterImageUrl.trim() === '') {
            throw new Error("Character image upload returned empty URL");
          }
        } catch (error: any) {
          console.error(`❌ Failed to upload character image:`, error.message);
          throw new Error(`Failed to upload character image: ${error.message}`);
        }
      }

      if (startFrameFile) {
        try {
          startFrameUrl = await uploadLocalFileToCloudinary(startFrameFile.filename, 'image');
          if (!startFrameUrl || startFrameUrl.trim() === '') {
            throw new Error("Start frame upload returned empty URL");
          }
          // If startFrame is provided, use it as the input image for video generation
          // This ensures start frame is used when both image and startFrame are provided
          inputImageUrl = startFrameUrl;
          console.log(`✅ Start frame uploaded and set as input image: ${startFrameUrl.substring(0, 50)}...`);
        } catch (error: any) {
          console.error(`❌ Failed to upload start frame:`, error.message);
          throw new Error(`Failed to upload start frame: ${error.message}`);
        }
      }

      if (endFrameFile) {
        try {
          endFrameUrl = await uploadLocalFileToCloudinary(endFrameFile.filename, 'image');
          if (!endFrameUrl || endFrameUrl.trim() === '') {
            throw new Error("End frame upload returned empty URL");
          }
          console.log(`✅ End frame uploaded: ${endFrameUrl.substring(0, 50)}...`);
        } catch (error: any) {
          console.error(`❌ Failed to upload end frame:`, error.message);
          throw new Error(`Failed to upload end frame: ${error.message}`);
        }
      }

      const audioEnabled = parseBoolean(parsed.audioEnabled);
      // FIX: Validate inputImageUrl is a valid URL before detecting image-to-video
      const hasValidImageUrl = inputImageUrl && 
        (inputImageUrl.startsWith('http://') || inputImageUrl.startsWith('https://') || inputImageUrl.startsWith('cloudinary://'));
      
      const feature =
        parsed.feature ||
        (characterImageUrl ? "motion" : hasValidImageUrl && parsed.generationType === "image-to-image" ? "image-to-image" : hasValidImageUrl ? "create" : parsed.generationType === "text-to-image" ? "text-to-image" : "text-to-video");
      
      const generationType =
        parsed.generationType ||
        (characterImageUrl
          ? "motion-control"
          : inputVideoUrl
            ? "video-to-video"
            : hasValidImageUrl && parsed.feature === "image-to-image"
              ? "image-to-image"
              : hasValidImageUrl
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
      
      // Validate that the model supports the requested generation type
      const lowerModelName = modelName?.toLowerCase() || '';
      const isKlingModel = lowerModelName.includes('kling');
      const isImagenModel = lowerModelName.includes('imagen');
      const isNanoBananaModel = lowerModelName.includes('nano banana');
      const isGeminiModel = isNanoBananaModel; // Nano Banana uses Gemini API
      const isVeoModel = !isKlingModel && !isImagenModel && !isGeminiModel;
      const isImageGeneration = generationType === "text-to-image" || generationType === "image-to-image";
      
      if (isVeoModel && isImageGeneration) {
        return res.status(400).json({ 
          error: `Model "${modelName}" does not support ${generationType}. Veo models only support video generation (text-to-video, image-to-video).`,
          supportedFeatures: ["text-to-video", "image-to-video"]
        });
      }
      
      if ((isImagenModel || isGeminiModel) && !isImageGeneration) {
        return res.status(400).json({ 
          error: `Model "${modelName}" only supports image generation (text-to-image, image-to-image). For video generation, please use Veo or Kling models.`,
          supportedFeatures: ["text-to-image", "image-to-image"]
        });
      }
      
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

      // Determine which service to use based on model name (already defined above)
      if (isGeminiModel && geminiImageService.isConfigured() && isImageGeneration) {
        // Use Gemini service for Nano Banana models
        processGeminiGeneration(generation.id, {
          prompt: parsed.prompt,
          modelName,
          aspectRatio: parsed.aspectRatio,
          generationType,
          inputImageUrl
        }).catch(() => {});
      } else if (isImagenModel && imagenService.isConfigured() && isImageGeneration) {
        const imageStrength = parsed.imageStrength ? parseFloat(parsed.imageStrength) : undefined;
        
        processImagenGeneration(generation.id, {
          prompt: parsed.prompt,
          modelName,
          aspectRatio: parsed.aspectRatio,
          generationType,
          inputImageUrl,
          imageStrength
        }).catch(() => {});
      } else if (isKlingModel && klingService.isConfigured()) {
        const imageStrength = parsed.imageStrength ? parseFloat(parsed.imageStrength) : undefined;
        const numberOfImages = parsed.numberOfImages ? parseInt(parsed.numberOfImages) : undefined;
        
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
        }).catch(() => {});
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

      startGenerationPoller();

      res.status(201).json({ data: generation });
    } catch (error: any) {
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

async function deleteFileFromAllLocations(fileUrl: string, resourceType: 'image' | 'video' = 'video'): Promise<void> {
  if (!fileUrl) return;
  
  deleteFile(fileUrl);
  
  if (fileUrl.includes('cloudinary.com')) {
    const publicId = extractPublicId(fileUrl);
    if (publicId) {
      await deleteFromCloudinary(publicId, resourceType);
    }
  }
}

// Bulk delete multiple generations
router.post("/bulk-delete", async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "Invalid request: 'ids' must be a non-empty array" });
      return;
    }

    // Fetch all generations to be deleted
    const generations = await prisma.generation.findMany({
      where: { id: { in: ids } }
    });

    if (generations.length === 0) {
      res.status(404).json({ error: "No generations found with the provided IDs" });
      return;
    }

    // Delete all associated files
    const fileDeletePromises: Promise<void>[] = [];
    
    for (const generation of generations) {
      if (generation.videoUrl) {
        fileDeletePromises.push(deleteFileFromAllLocations(generation.videoUrl, 'video'));
      }
      if (generation.thumbnailUrl && generation.thumbnailUrl !== generation.videoUrl) {
        fileDeletePromises.push(deleteFileFromAllLocations(generation.thumbnailUrl, 'image'));
      }
      if (generation.inputVideoUrl) {
        fileDeletePromises.push(deleteFileFromAllLocations(generation.inputVideoUrl, 'video'));
      }
      if (generation.inputImageUrl) {
        fileDeletePromises.push(deleteFileFromAllLocations(generation.inputImageUrl, 'image'));
      }
      if (generation.characterImageUrl) {
        fileDeletePromises.push(deleteFileFromAllLocations(generation.characterImageUrl, 'image'));
      }
    }

    // Delete files (don't wait for all to complete, use allSettled)
    await Promise.allSettled(fileDeletePromises);

    // Delete generations from database
    await prisma.generation.deleteMany({
      where: { id: { in: ids } }
    });

    res.json({ 
      success: true, 
      message: `Successfully deleted ${generations.length} generation(s)`,
      deletedCount: generations.length
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const generation = await prisma.generation.findUnique({
      where: { id: req.params.id }
    });

    if (!generation) {
      res.status(404).json({ error: "Generation not found" });
      return;
    }

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

    await Promise.allSettled(deletePromises);

    await prisma.generation.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true, message: "Generation deleted successfully" });
  } catch (error) {
    next(error);
  }
});

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
      console.warn(`⚠️ Check-status called for generation ${req.params.id} but providerJobId is missing. Status: ${generation.status}`);
      // Return the current generation status instead of error, so frontend can display it
      res.json({ 
        data: generation,
        warning: "Video generation is still being submitted. Please wait a moment and try again.",
        hasProviderJobId: false
      });
      return;
    }

    const isKlingModel = generation.modelName?.toLowerCase().includes('kling');
    const isImagenModel = generation.modelName?.toLowerCase().includes('imagen');
    
    if (isImagenModel) {
      const status = await imagenService.checkGenerationStatus(generation.providerJobId);

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
            imagenStatus: status 
          });
          return;
        }

        const imageUrl = imagenService.extractImageUrl(status);

        if (imageUrl) {
          try {
            let cloudinaryImageUrl: string;
            
            if (imageUrl.startsWith('data:')) {
              const base64Data = imageUrl.split(',')[1];
              const buffer = Buffer.from(base64Data, 'base64');
              const filename = `imagen-${Date.now()}.png`;
              const fs = await import('fs/promises');
              const path = await import('path');
              const uploadsDir = path.join(process.cwd(), 'uploads');
              await fs.mkdir(uploadsDir, { recursive: true });
              const filepath = path.join(uploadsDir, filename);
              await fs.writeFile(filepath, buffer);
              
              cloudinaryImageUrl = await uploadLocalFileToCloudinary(filename, 'image');
            } else {
              const imageFilename = await downloadAndSaveThumbnail(imageUrl, process.env.GOOGLE_API_KEY);
              cloudinaryImageUrl = await uploadLocalFileToCloudinary(imageFilename, 'image');
            }
            
            const updated = await prisma.generation.update({
              where: { id: generation.id },
              data: {
                status: "completed",
                imageUrl: cloudinaryImageUrl,
                thumbnailUrl: cloudinaryImageUrl,
                updatedAt: new Date()
              } as any
            });
            res.json({ data: updated, imagenStatus: status });
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
            res.json({ data: updated, imagenStatus: status });
            return;
          }
        }
      }

      res.json({ data: generation, imagenStatus: status });
      return;
    }
    
    if (isKlingModel) {
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

      const status = await klingService.checkGenerationStatus(generation.providerJobId, taskType, generation.modelName);

      if (status.data.task_status === "succeed") {
        const isImageTask = generation.generationType === "text-to-image" || generation.generationType === "image-to-image";
        
        if (isImageTask) {
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
          const videoUrl = status.data.task_result?.videos?.[0]?.url;
          const thumbnailUrl = status.data.task_result?.videos?.[0]?.cover_url;

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
      } else if (status.data.task_status === "submitted" || status.data.task_status === "processing") {
        // Sync database status with actual provider status
        // This fixes the issue where DB shows "failed" but video is still generating
        if (generation.status === "failed" || generation.status !== "in_progress") {
          const updated = await prisma.generation.update({
            where: { id: generation.id },
            data: {
              status: "in_progress",
              errorMessage: null, // Clear any previous error messages
              updatedAt: new Date()
            }
          });
          res.json({ data: updated, klingStatus: status });
          return;
        }
      }

      res.json({ data: generation, klingStatus: status });
      return;
    }

    const status = await veo3Service.checkGenerationStatus(generation.providerJobId);

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

    if (params.generationType === "image-to-video" && params.inputImageUrl) {
      veo3Response = await veo3Service.generateImageToVideo({
        imageUrl: params.inputImageUrl,
        prompt: params.prompt,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        audioEnabled: params.audioEnabled,
        modelName: params.modelName
      });
    } else {
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

async function pollVeo3Generation(generationId: string, operationName: string) {
  // OPTIMIZED: Adaptive polling - starts fast, then slows down
  const maxAttempts = 180;
  const fastIntervalMs = 5000;
  const slowIntervalMs = 10000;
  const fastPhaseDuration = 30000;
  const startTime = Date.now();

  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      // Check if generation is already completed or failed before polling
      const currentGen = await prisma.generation.findUnique({
        where: { id: generationId },
        select: { status: true }
      });
      
      if (currentGen?.status !== "in_progress") {
        // Generation already completed or failed, stop polling
        console.log(`⏹️ Generation ${generationId} already ${currentGen?.status}, stopping poll`);
        return;
      }
      
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

      // OPTIMIZED: Adaptive polling interval
      const elapsed = Date.now() - startTime;
      const currentInterval = elapsed < fastPhaseDuration ? fastIntervalMs : slowIntervalMs;
      await new Promise((resolve) => setTimeout(resolve, currentInterval));
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

      const elapsed = Date.now() - startTime;
      const currentInterval = elapsed < fastPhaseDuration ? fastIntervalMs : slowIntervalMs;
      await new Promise((resolve) => setTimeout(resolve, currentInterval));
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
    let klingResponse;

    if (params.generationType === "motion-control" && params.inputVideoUrl && params.characterImageUrl) {
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
      klingResponse = await klingService.generateVideoToVideo({
        videoUrl: params.inputVideoUrl,
        prompt: params.prompt,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        audioEnabled: params.audioEnabled,
        modelName: params.modelName
      });
    } else if (params.generationType === "image-to-video") {
      // FIX: Validate that inputImageUrl exists and is not empty
      if (!params.inputImageUrl || params.inputImageUrl === null || params.inputImageUrl === undefined || (typeof params.inputImageUrl === 'string' && params.inputImageUrl.trim() === '')) {
        console.error(`❌ Invalid inputImageUrl for image-to-video:`, { 
          inputImageUrl: params.inputImageUrl, 
          type: typeof params.inputImageUrl 
        });
        throw new Error("Image URL is required for image-to-video generation. Please upload an image or use text-to-video instead.");
      }
      console.log(`✅ Processing image-to-video with imageUrl: ${params.inputImageUrl.substring(0, 50)}...`);
      klingResponse = await klingService.generateImageToVideo({
        imageUrl: params.inputImageUrl,
        endImageUrl: params.endFrameUrl,  // Pass end frame for video transitions
        prompt: params.prompt,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        audioEnabled: params.audioEnabled,
        modelName: params.modelName
      });
    } else if (params.generationType === "image-to-image" && params.inputImageUrl) {
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
      if (!params.prompt) {
        throw new Error("Prompt is required for text-to-image generation");
      }
      klingResponse = await klingService.generateTextToImage({
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        modelName: params.modelName
      });
    } else {
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

async function pollKlingGeneration(
  generationId: string, 
  klingGenerationId: string, 
  taskType: "text2video" | "image2video" | "video2video" | "motion-control" | "text2image" | "image2image" = "text2video", 
  modelName?: string,
  onComplete?: (taskId: string) => void
) {
  // OPTIMIZED: Adaptive polling - starts fast, then slows down
  // - First 30s: poll every 5s (fast response for quick generations)
  // - After 30s: poll every 10s (save API calls for longer generations)
  // This balances speed and cost-efficiency
  const maxAttempts = 180; // ~20 minutes max wait time
  const fastIntervalMs = 5000; // 5 seconds for first 30 seconds
  const slowIntervalMs = 10000; // 10 seconds after that
  const fastPhaseDuration = 30000; // First 30 seconds use fast polling
  const startTime = Date.now();

  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      // Check if generation is already completed or failed before polling
      const currentGen = await prisma.generation.findUnique({
        where: { id: generationId },
        select: { status: true }
      });
      
      if (currentGen?.status !== "in_progress") {
        // Generation already completed or failed, stop polling
        console.log(`⏹️ Generation ${generationId} already ${currentGen?.status}, stopping poll`);
        
        // Call onComplete callback if provided (for rate limiting)
        if (onComplete) {
          onComplete(klingGenerationId);
        }
        return;
      }
      
      const status = await klingService.checkGenerationStatus(klingGenerationId, taskType, modelName);

      if (status.data.task_status === "succeed") {
        const isImageTask = taskType === "text2image" || taskType === "image2image";
        
        if (isImageTask) {
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

              // Call onComplete callback if provided (for rate limiting)
              if (onComplete) {
                onComplete(klingGenerationId);
              }
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
              
              // Call onComplete callback if provided (for rate limiting)
              if (onComplete) {
                onComplete(klingGenerationId);
              }
              return;
            }
          } else {
            throw new Error("KLing completed but no image URL found");
          }
        } else {
          const videoUrl = status.data.task_result?.videos?.[0]?.url;
          const thumbnailUrl = status.data.task_result?.videos?.[0]?.cover_url;

          if (videoUrl) {
            try {
              // OPTIMIZED: Use parallel processing for faster upload
              console.log(`⚡ Processing video result with parallel upload...`);
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

              // Call onComplete callback if provided (for rate limiting)
              if (onComplete) {
                onComplete(klingGenerationId);
              }
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
              
              // Call onComplete callback if provided (for rate limiting)
              if (onComplete) {
                onComplete(klingGenerationId);
              }
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
        
        // Call onComplete callback if provided (for rate limiting)
        if (onComplete) {
          onComplete(klingGenerationId);
        }
        return;
      }
      // Note: If status is "submitted" or "processing", continue polling
      // The DB status is already "in_progress" (checked at line 1250)

      // OPTIMIZED: Adaptive polling interval - fast at start, slower later
      const elapsed = Date.now() - startTime;
      const currentInterval = elapsed < fastPhaseDuration ? fastIntervalMs : slowIntervalMs;
      await new Promise((resolve) => setTimeout(resolve, currentInterval));
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
        
        // Call onComplete callback if provided (for rate limiting)
        if (onComplete) {
          onComplete(klingGenerationId);
        }
        return;
      }

      const elapsed = Date.now() - startTime;
      const currentInterval = elapsed < fastPhaseDuration ? fastIntervalMs : slowIntervalMs;
      await new Promise((resolve) => setTimeout(resolve, currentInterval));
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
  
  // Call onComplete callback if provided (for rate limiting)
  if (onComplete) {
    onComplete(klingGenerationId);
  }
}

async function processImagenGeneration(
  generationId: string,
  params: {
    prompt?: string;
    modelName: string;
    aspectRatio: string;
    generationType: string;
    inputImageUrl?: string;
    imageStrength?: number;
  }
) {
  try {
    let imagenResponse;

    if (params.generationType === "image-to-image" && params.inputImageUrl) {
      if (!params.prompt) {
        throw new Error("Prompt is required for image-to-image generation");
      }
      imagenResponse = await imagenService.generateImageToImage({
        imageUrl: params.inputImageUrl,
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        strength: params.imageStrength,
        modelName: params.modelName
      });
    } else if (params.generationType === "text-to-image") {
      if (!params.prompt) {
        throw new Error("Prompt is required for text-to-image generation");
      }
      imagenResponse = await imagenService.generateTextToImage({
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        modelName: params.modelName
      });
    } else {
      throw new Error("Unsupported generation type for Imagen");
    }

    // Check if response contains immediate result (predictions)
    const imageUrl = imagenService.extractImageUrl(imagenResponse);
    
    if (imageUrl) {
      // Immediate result - save directly
      if (imageUrl.startsWith('data:')) {
        // Convert base64 data URI to file and upload to Cloudinary
        const base64Data = imageUrl.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `imagen-${Date.now()}.png`;
        const fs = await import('fs/promises');
        const path = await import('path');
        const uploadsDir = path.join(process.cwd(), 'uploads');
        await fs.mkdir(uploadsDir, { recursive: true });
        const filepath = path.join(uploadsDir, filename);
        await fs.writeFile(filepath, buffer);
        
        const cloudinaryImageUrl = await uploadLocalFileToCloudinary(filename, 'image');
        
        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "completed",
            imageUrl: cloudinaryImageUrl,
            thumbnailUrl: cloudinaryImageUrl,
            providerJobId: imagenResponse.name || undefined,
            updatedAt: new Date()
          } as any
        });
      } else {
        // URL result
        const imageFilename = await downloadAndSaveThumbnail(imageUrl, process.env.GOOGLE_API_KEY);
        const cloudinaryImageUrl = await uploadLocalFileToCloudinary(imageFilename, 'image');
        
        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "completed",
            imageUrl: cloudinaryImageUrl,
            thumbnailUrl: cloudinaryImageUrl,
            providerJobId: imagenResponse.name || undefined,
            updatedAt: new Date()
          } as any
        });
      }
    } else if (imagenResponse.name && !imagenResponse.done) {
      // Long-running operation - needs polling
      await prisma.generation.update({
        where: { id: generationId },
        data: {
          providerJobId: imagenResponse.name,
          status: "in_progress"
        }
      });

      pollImagenGeneration(generationId, imagenResponse.name).catch(() => {});
    } else {
      throw new Error("Imagen API returned unexpected response format");
    }
  } catch (error: any) {
    let errorCode = "UNKNOWN_ERROR";
    let errorMessage = error.message || "Unknown error occurred";

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

async function processGeminiGeneration(
  generationId: string,
  params: {
    prompt?: string;
    modelName: string;
    aspectRatio: string;
    generationType: string;
    inputImageUrl?: string;
  }
) {
  try {
    let geminiResponse;

    if (params.generationType === "image-to-image" && params.inputImageUrl) {
      if (!params.prompt) {
        throw new Error("Prompt is required for image-to-image generation");
      }
      geminiResponse = await geminiImageService.generateImageToImage({
        imageUrl: params.inputImageUrl,
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        modelName: params.modelName
      });
    } else if (params.generationType === "text-to-image") {
      if (!params.prompt) {
        throw new Error("Prompt is required for text-to-image generation");
      }
      geminiResponse = await geminiImageService.generateTextToImage({
        prompt: params.prompt,
        aspectRatio: params.aspectRatio,
        modelName: params.modelName
      });
    } else {
      throw new Error("Unsupported generation type for Gemini");
    }

    // Extract image URL from response
    const imageUrl = geminiImageService.extractImageUrl(geminiResponse);
    
    if (imageUrl) {
      // Convert base64 data URI to file and upload to Cloudinary
      if (imageUrl.startsWith('data:')) {
        const base64Data = imageUrl.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `gemini-${Date.now()}.png`;
        const fs = await import('fs/promises');
        const path = await import('path');
        const uploadsDir = path.join(process.cwd(), 'uploads');
        await fs.mkdir(uploadsDir, { recursive: true });
        const filepath = path.join(uploadsDir, filename);
        await fs.writeFile(filepath, buffer);
        
        const cloudinaryImageUrl = await uploadLocalFileToCloudinary(filename, 'image');
        
        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "completed",
            imageUrl: cloudinaryImageUrl,
            thumbnailUrl: cloudinaryImageUrl,
            updatedAt: new Date()
          } as any
        });
      } else {
        // URL result (unlikely for Gemini)
        const imageFilename = await downloadAndSaveThumbnail(imageUrl, process.env.GOOGLE_API_KEY);
        const cloudinaryImageUrl = await uploadLocalFileToCloudinary(imageFilename, 'image');
        
        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "completed",
            imageUrl: cloudinaryImageUrl,
            thumbnailUrl: cloudinaryImageUrl,
            updatedAt: new Date()
          } as any
        });
      }
    } else {
      throw new Error("Gemini API returned no image data");
    }
  } catch (error: any) {
    let errorCode = "UNKNOWN_ERROR";
    let errorMessage = error.message || "Unknown error occurred";

    if (error.message?.includes("API key not valid")) {
      errorCode = "INVALID_API_KEY";
      errorMessage = "Google API key is invalid or expired";
    } else if (error.message?.includes("quota")) {
      errorCode = "QUOTA_EXCEEDED";
      errorMessage = "API quota exceeded";
    } else if (error.message?.includes("timeout")) {
      errorCode = "TIMEOUT";
      errorMessage = "Request timed out";
    }

    console.error(`❌ Gemini generation failed for ${generationId}:`, errorMessage);

    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: "failed",
        errorCode,
        errorMessage,
        updatedAt: new Date()
      } as any
    });
  }
}

async function pollImagenGeneration(generationId: string, operationName: string) {
  const maxAttempts = 60;
  const intervalMs = 5000;

  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      // Check if generation is already completed or failed before polling
      const currentGen = await prisma.generation.findUnique({
        where: { id: generationId },
        select: { status: true }
      });
      
      if (currentGen?.status !== "in_progress") {
        // Generation already completed or failed, stop polling
        console.log(`⏹️ Generation ${generationId} already ${currentGen?.status}, stopping poll`);
        return;
      }
      
      const status = await imagenService.checkGenerationStatus(operationName);

      if (status.done) {
        if (status.error) {
          let errorCode = "GENERATION_FAILED";
          let errorMessage = status.error.message || "Image generation failed";
          
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

        const imageUrl = imagenService.extractImageUrl(status);

        if (imageUrl) {
          try {
            let cloudinaryImageUrl: string;
            
            if (imageUrl.startsWith('data:')) {
              // Convert base64 data URI to file and upload
              const base64Data = imageUrl.split(',')[1];
              const buffer = Buffer.from(base64Data, 'base64');
              const filename = `imagen-${Date.now()}.png`;
              const fs = await import('fs/promises');
              const path = await import('path');
              const uploadsDir = path.join(process.cwd(), 'uploads');
              await fs.mkdir(uploadsDir, { recursive: true });
              const filepath = path.join(uploadsDir, filename);
              await fs.writeFile(filepath, buffer);
              
              cloudinaryImageUrl = await uploadLocalFileToCloudinary(filename, 'image');
            } else {
              // Download from URL
              const imageFilename = await downloadAndSaveThumbnail(imageUrl, process.env.GOOGLE_API_KEY);
              cloudinaryImageUrl = await uploadLocalFileToCloudinary(imageFilename, 'image');
            }
            
            await prisma.generation.update({
              where: { id: generationId },
              data: {
                status: "completed",
                imageUrl: cloudinaryImageUrl,
                thumbnailUrl: cloudinaryImageUrl,
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
          throw new Error("Imagen completed but no image URL found");
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
      const response = await axios.get(generation.videoUrl, {
        responseType: "stream",
        headers: {
          "x-goog-api-key": process.env.GOOGLE_API_KEY || ""
        }
      });

      res.setHeader("Content-Type", response.headers["content-type"] || "video/mp4");
      if (response.headers["content-length"]) {
        res.setHeader("Content-Length", response.headers["content-length"]);
      }
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=31536000");
      response.data.pipe(res);
    } else {
      res.redirect(generation.videoUrl);
    }
  } catch (error: any) {
    next(error);
  }
});

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
      const response = await axios.get(generation.thumbnailUrl, {
        responseType: "stream",
        headers: {
          "x-goog-api-key": process.env.GOOGLE_API_KEY || ""
        }
      });

      res.setHeader("Content-Type", response.headers["content-type"] || "image/jpeg");
      if (response.headers["content-length"]) {
        res.setHeader("Content-Length", response.headers["content-length"]);
      }
      res.setHeader("Cache-Control", "public, max-age=31536000");
      response.data.pipe(res);
    } else {
      res.redirect(generation.thumbnailUrl);
    }
  } catch (error: any) {
    next(error);
  }
});

const constructionStagesSchema = z.object({
  inputImageUrl: z.string().url().optional(),
  modelName: z.string().optional().default("Nano Banana"),
  videoModelName: z.string().optional().default("Kling O1"),
  aspectRatio: z.string().optional().default("16:9"),
  basePrompt: z.string().optional()
});

async function waitForImageGeneration(
  generationId: string,
  klingGenerationId: string,
  modelName?: string,
  maxAttempts: number = 120,
  intervalMs: number = 10000
): Promise<{ imageUrl: string; success: boolean; error?: string }> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      // Check if generation is already completed or failed before polling
      const currentGen = await prisma.generation.findUnique({
        where: { id: generationId },
        select: { status: true }
      });
      
      if (currentGen?.status !== "in_progress") {
        // Generation already completed or failed, stop polling
        console.log(`⏹️ Generation ${generationId} already ${currentGen?.status}, stopping poll`);
        return { imageUrl: "", success: false, error: `Generation already ${currentGen?.status}` };
      }
      
      const status = await klingService.checkGenerationStatus(klingGenerationId, "image2image", modelName);

      if (status.data.task_status === "succeed") {
        const imageUrl = status.data.task_result?.images?.[0]?.url;

        if (imageUrl) {
          try {
            const imageFilename = await downloadAndSaveThumbnail(imageUrl, undefined);
            const cloudinaryImageUrl = await uploadLocalFileToCloudinary(imageFilename, 'image');

            await prisma.generation.update({
              where: { id: generationId },
              data: {
                status: "completed",
                imageUrl: cloudinaryImageUrl,
                thumbnailUrl: cloudinaryImageUrl,
                updatedAt: new Date()
              } as any
            });

            return { imageUrl: cloudinaryImageUrl, success: true };
          } catch (downloadError: any) {
            await prisma.generation.update({
              where: { id: generationId },
              data: {
                status: "failed",
                errorMessage: `Failed to upload image to Cloudinary: ${downloadError.message}`,
                updatedAt: new Date()
              }
            });
            return { imageUrl: "", success: false, error: downloadError.message };
          }
        } else {
          throw new Error("Kling completed but no image URL found");
        }
      } else if (status.data.task_status === "failed") {
        const errorMessage = status.data.task_status_msg || "Kling generation failed";
        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "failed",
            errorCode: "GENERATION_FAILED",
            errorMessage,
            updatedAt: new Date()
          }
        });
        return { imageUrl: "", success: false, error: errorMessage };
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      attempts++;
    } catch (error: any) {
      attempts++;

      if (attempts >= 3 && error.message?.includes("API error")) {
        const errorMessage = error.message || "Failed to check generation status";
        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "failed",
            errorCode: "POLLING_ERROR",
            errorMessage,
            updatedAt: new Date()
          }
        });
        return { imageUrl: "", success: false, error: errorMessage };
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  const errorMessage = "Generation timed out after maximum polling attempts";
  await prisma.generation.update({
    where: { id: generationId },
    data: {
      status: "failed",
      errorCode: "TIMEOUT",
      errorMessage,
      updatedAt: new Date()
    }
  });
  return { imageUrl: "", success: false, error: errorMessage };
}

router.post("/construction-stages", upload.fields([{ name: "image", maxCount: 1 }]), async (req, res, next) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const imageFile = files?.image?.[0];
    
    let parsed;
    try {
      parsed = constructionStagesSchema.parse(req.body);
    } catch (validationError: any) {
      if (!imageFile) {
        if (validationError.errors) {
          return res.status(400).json({
            success: false,
            error: "Validation failed",
            details: validationError.errors.map((err: any) => ({
              path: err.path.join('.'),
              message: err.message
            }))
          });
        }
        throw validationError;
      }
      parsed = { modelName: "Nano Banana", videoModelName: "Kling O1", aspectRatio: "16:9" };
    }
    
    const { inputImageUrl: providedImageUrl, modelName, videoModelName, aspectRatio, basePrompt } = parsed;

    let inputImageUrl: string;
    
    if (providedImageUrl) {
      inputImageUrl = providedImageUrl;
    } else if (imageFile) {
      inputImageUrl = await uploadLocalFileToCloudinary(imageFile.filename, 'image');
    } else {
      return res.status(400).json({
        success: false,
        error: "Either inputImageUrl or image file is required"
      });
    }

    // Check which service to use based on model name
    const lowerModelName = modelName?.toLowerCase() || '';
    const isNanoBananaModel = lowerModelName.includes('nano banana');
    const isKlingModel = lowerModelName.includes('kling');
    
    if (isNanoBananaModel && !geminiImageService.isConfigured()) {
      return res.status(500).json({
        success: false,
        error: "Gemini Image service is not configured. Please check your Google API key."
      });
    }
    
    if (isKlingModel && !klingService.isConfigured()) {
      return res.status(500).json({
        success: false,
        error: "Kling AI service is not configured. Please check your API credentials."
      });
    }

    const allStages = getAllStages();
    
    // Test mode: Generate 3 images (stages 1, 2, 3) → 2 videos (10s total) for cost savings
    const MAX_STAGES_TO_GENERATE = 3; // Generate only 3 stages (stage 1 is pass-through, stages 2-3 are generated)
    const MAX_VIDEOS_TO_CREATE = 2; // 2 videos × 5s = 10s total
    const MAX_INTERMEDIATE_IMAGES = 0; // No intermediate images needed for 3 images → 2 videos
    
    const stages = allStages.slice(0, MAX_STAGES_TO_GENERATE);
    console.log(`🚀 Test mode: Generating ${MAX_STAGES_TO_GENERATE} stages, ${MAX_INTERMEDIATE_IMAGES} intermediate images, ${MAX_VIDEOS_TO_CREATE} videos (${MAX_VIDEOS_TO_CREATE * 5}s total)`);
    
    const results: Array<{
      stageKey: string;
      stageOrder: number;
      prompt: string;
      imageUrl: string;
      generationId: string;
      success: boolean;
      error?: string;
    }> = [];

    let currentImageUrl = inputImageUrl;
    let parentGenerationId: string | undefined = undefined;

    for (const stage of stages) {
      try {
        const fullPrompt = buildStagePrompt(stage, basePrompt);

        if (stage.stageOrder === 1) {
          const generationId = randomUUID();
          await prisma.generation.create({
            data: {
              id: generationId,
              prompt: fullPrompt,
              modelName: modelName || "Nano Banana",
              duration: "0s",
              aspectRatio: aspectRatio || "16:9",
              resolution: "720p",
              audioEnabled: false,
              feature: "image-to-image",
              generationType: "image-to-image",
              status: "completed",
              inputImageUrl: currentImageUrl,
              imageUrl: currentImageUrl,
              updatedAt: new Date()
            } as any
          });
          
          const stageResult = {
            stageKey: stage.stageKey,
            stageOrder: stage.stageOrder,
            prompt: fullPrompt,
            imageUrl: currentImageUrl,
            generationId: generationId,
            success: true
          };

          results.push(stageResult);
          continue;
        }

        const generationId = randomUUID();
        const generation = await prisma.generation.create({
          data: {
            id: generationId,
            prompt: fullPrompt,
            modelName: modelName || "Nano Banana",
            duration: "0s",
            aspectRatio: aspectRatio || "16:9",
            resolution: "720p",
            audioEnabled: false,
            feature: "image-to-image",
            generationType: "image-to-image",
            status: "in_progress",
            inputImageUrl: currentImageUrl,
            updatedAt: new Date()
          } as any
        });

        let result: { imageUrl: string; success: boolean; error?: string };

        if (isNanoBananaModel) {
          // Use Gemini service for Nano Banana model
          try {
            const geminiResponse = await geminiImageService.generateImageToImage({
              imageUrl: currentImageUrl,
              prompt: fullPrompt,
              aspectRatio: aspectRatio || "16:9",
              modelName: modelName || "Nano Banana"
            });

            const imageUrl = geminiImageService.extractImageUrl(geminiResponse);
            
            if (imageUrl && imageUrl.startsWith('data:')) {
              // Convert base64 data URI to file and upload
              const base64Data = imageUrl.split(',')[1];
              const buffer = Buffer.from(base64Data, 'base64');
              const filename = `gemini-${Date.now()}.png`;
              const fs = await import('fs/promises');
              const path = await import('path');
              const uploadsDir = path.join(process.cwd(), 'uploads');
              await fs.mkdir(uploadsDir, { recursive: true });
              const filepath = path.join(uploadsDir, filename);
              await fs.writeFile(filepath, buffer);
              
              const cloudinaryImageUrl = await uploadLocalFileToCloudinary(filename, 'image');
              
              await prisma.generation.update({
                where: { id: generationId },
                data: {
                  status: "completed",
                  imageUrl: cloudinaryImageUrl,
                  thumbnailUrl: cloudinaryImageUrl,
                  updatedAt: new Date()
                } as any
              });

              result = { imageUrl: cloudinaryImageUrl, success: true };
            } else {
              throw new Error("Gemini API did not return image data");
            }
          } catch (geminiError: any) {
            await prisma.generation.update({
              where: { id: generationId },
              data: {
                status: "failed",
                errorMessage: geminiError.message,
                updatedAt: new Date()
              }
            });
            result = { imageUrl: "", success: false, error: geminiError.message };
          }
        } else {
          // Use Kling service for Kling models
          const klingResponse = await klingService.generateImageToImage({
            imageUrl: currentImageUrl,
            prompt: fullPrompt,
            aspectRatio: aspectRatio || "16:9",
            strength: stage.strength,
            modelName: modelName || "Nano Banana"
          });

          if (!klingResponse.data?.task_id) {
            throw new Error("Kling API returned unexpected response format");
          }

          // Update generation with provider job ID
          await prisma.generation.update({
            where: { id: generationId },
            data: {
              providerJobId: klingResponse.data.task_id,
              status: "in_progress"
            }
          });

          result = await waitForImageGeneration(
            generationId,
            klingResponse.data.task_id,
            modelName || "Nano Banana"
          );
        }

        if (result.success && result.imageUrl) {
          currentImageUrl = result.imageUrl;
          parentGenerationId = generationId;

          results.push({
            stageKey: stage.stageKey,
            stageOrder: stage.stageOrder,
            prompt: fullPrompt,
            imageUrl: result.imageUrl,
            generationId: generationId,
            success: true
          });
        } else {
          results.push({
            stageKey: stage.stageKey,
            stageOrder: stage.stageOrder,
            prompt: fullPrompt,
            imageUrl: "",
            generationId: generationId,
            success: false,
            error: result.error || "Unknown error"
          });

          return res.status(207).json({
            success: false,
            message: `Generation stopped at stage ${stage.stageOrder}. Some stages completed successfully.`,
            stages: results,
            failedAtStage: stage.stageOrder
          });
        }
      } catch (error: any) {
        return res.status(207).json({
          success: false,
          message: `Error at stage ${stage.stageOrder}: ${error.message}`,
          stages: results,
          failedAtStage: stage.stageOrder,
          error: error.message
        });
      }
    }

    // After all 8 images are generated successfully, generate intermediate images
    // Then create 12 videos (5s each = 60s total) with start and end frames
    console.log("🎬 Generating intermediate images for smoother transitions...");
    
    const allImages: Array<{
      stageKey: string;
      stageOrder: number;
      imageUrl: string;
      success: boolean;
      isIntermediate: boolean;
    }> = [];

    // Add original stages
    results.forEach(stage => {
      if (stage.success) {
        allImages.push({
          stageKey: stage.stageKey,
          stageOrder: stage.stageOrder,
          imageUrl: stage.imageUrl,
          success: true,
          isIntermediate: false
        });
      }
    });

    // Generate intermediate images between major transitions
    // We'll create intermediate images between stages 8-7, 7-6, 6-5, 5-4, 4-3, 3-2, 2-1
    // This will give us more frames to create 12 videos
    const intermediateResults: Array<{
      stageKey: string;
      stageOrder: number;
      imageUrl: string;
      generationId: string;
      success: boolean;
    }> = [];

    const sortedResults = [...results].filter(s => s.success).sort((a, b) => b.stageOrder - a.stageOrder);
    
    // Generate intermediate images if needed (for test mode with 3 images, no intermediate images are needed)
    // This will create videos between consecutive images
    const numIntermediateNeeded = Math.min(
      MAX_INTERMEDIATE_IMAGES,
      sortedResults.length - 1  // Can't have more intermediate than gaps between stages
    );
    
    // Select which intermediate images to create (prioritize early stages for smoother transitions)
    // We'll create intermediate images for: 8→7, 7→6, 6→5, 5→4, 4→3
    const intermediateTransitions = Array.from({ length: numIntermediateNeeded }, (_, i) => i);
    console.log(`🖼️ Generating ${numIntermediateNeeded} intermediate images (total: ${sortedResults.length} stages + ${numIntermediateNeeded} intermediate = ${sortedResults.length + numIntermediateNeeded} images → ${sortedResults.length + numIntermediateNeeded - 1} videos)`);
    
    for (let idx = 0; idx < intermediateTransitions.length && idx < sortedResults.length - 1; idx++) {
      const i = intermediateTransitions[idx];
      const fromStage = sortedResults[i];
      const toStage = sortedResults[i + 1];
      
      try {
        // Create intermediate image between two stages
        const intermediateOrder = fromStage.stageOrder - 0.5; // e.g., 7.5 between 8 and 7
        const intermediateKey = `intermediate-${fromStage.stageOrder}-${toStage.stageOrder}`;
        
        console.log(`🖼️ Generating intermediate image: ${fromStage.stageKey} → ${toStage.stageKey}`);
        
        const intermediateId = randomUUID();
        // Get detailed prompt for intermediate image
        const intermediatePrompt = getIntermediateImagePrompt(fromStage.stageOrder, toStage.stageOrder);
        
        // Create generation record
        await prisma.generation.create({
          data: {
            id: intermediateId,
            prompt: intermediatePrompt,
            modelName: modelName || "Kling O1",
            duration: "0s",
            aspectRatio: aspectRatio || "16:9",
            resolution: "720p",
            audioEnabled: false,
            feature: "image-to-image",
            generationType: "image-to-image",
            status: "in_progress",
            inputImageUrl: fromStage.imageUrl,
            updatedAt: new Date()
          } as any
        });

        // Generate intermediate image using image-to-image
        // Check model type again to ensure we use the correct service
        const lowerModelNameForIntermediate = (modelName || "").toLowerCase();
        const isKlingModelForIntermediate = lowerModelNameForIntermediate.includes('kling');
        const isNanoBananaModelForIntermediate = lowerModelNameForIntermediate.includes('nano banana');
        
        let intermediateResult: { imageUrl: string; success: boolean; error?: string };
        
        if (isKlingModelForIntermediate) {
          const klingResponse = await klingService.generateImageToImage({
            imageUrl: fromStage.imageUrl,
            prompt: intermediatePrompt,
            aspectRatio: aspectRatio || "16:9",
            strength: 0.5, // Medium strength for intermediate state
            modelName: modelName || "Kling O1"
          });

          if (!klingResponse.data?.task_id) {
            throw new Error("Kling API returned unexpected response format");
          }

          await prisma.generation.update({
            where: { id: intermediateId },
            data: {
              providerJobId: klingResponse.data.task_id,
              status: "in_progress"
            }
          });

          intermediateResult = await waitForImageGeneration(
            intermediateId,
            klingResponse.data.task_id,
            modelName || "Kling O1"
          );
        } else if (isNanoBananaModelForIntermediate) {
          // Use Gemini service for Nano Banana model
          try {
            const geminiResponse = await geminiImageService.generateImageToImage({
              imageUrl: fromStage.imageUrl,
              prompt: intermediatePrompt,
              aspectRatio: aspectRatio || "16:9",
              modelName: modelName || "Nano Banana"
            });

            const imageUrl = geminiImageService.extractImageUrl(geminiResponse);
            
            if (imageUrl && imageUrl.startsWith('data:')) {
              // Convert base64 data URI to file and upload
              const base64Data = imageUrl.split(',')[1];
              const buffer = Buffer.from(base64Data, 'base64');
              const filename = `gemini-intermediate-${Date.now()}.png`;
              const fs = await import('fs/promises');
              const path = await import('path');
              const uploadsDir = path.join(process.cwd(), 'uploads');
              await fs.mkdir(uploadsDir, { recursive: true });
              const filepath = path.join(uploadsDir, filename);
              await fs.writeFile(filepath, buffer);
              
              const cloudinaryImageUrl = await uploadLocalFileToCloudinary(filename, 'image');
              
              await prisma.generation.update({
                where: { id: intermediateId },
                data: {
                  status: "completed",
                  imageUrl: cloudinaryImageUrl,
                  thumbnailUrl: cloudinaryImageUrl,
                  updatedAt: new Date()
                } as any
              });

              intermediateResult = { imageUrl: cloudinaryImageUrl, success: true };
            } else {
              throw new Error("Gemini API did not return image data");
            }
          } catch (geminiError: any) {
            await prisma.generation.update({
              where: { id: intermediateId },
              data: {
                status: "failed",
                errorMessage: geminiError.message,
                updatedAt: new Date()
              }
            });
            intermediateResult = { imageUrl: "", success: false, error: geminiError.message };
          }
        } else {
          throw new Error(`Intermediate images not supported for model "${modelName}". Please use Kling O1 or Nano Banana model.`);
        }

        if (intermediateResult.success && intermediateResult.imageUrl) {
          intermediateResults.push({
            stageKey: intermediateKey,
            stageOrder: intermediateOrder,
            imageUrl: intermediateResult.imageUrl,
            generationId: intermediateId,
            success: true
          });
          
          allImages.push({
            stageKey: intermediateKey,
            stageOrder: intermediateOrder,
            imageUrl: intermediateResult.imageUrl,
            success: true,
            isIntermediate: true
          });
          
          console.log(`✅ Intermediate image created: ${intermediateKey}`);
          
          // Add delay between intermediate image generation to avoid rate limiting
          // Wait 1 second before creating next intermediate image (except for the last one)
          if (idx < intermediateTransitions.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else {
          // Intermediate image failed - stop the entire process
          console.error(`❌ Failed to create intermediate image between ${fromStage.stageKey} and ${toStage.stageKey}`);
          console.error(`   Error: ${intermediateResult.error || 'Unknown error'}`);
          
          return res.status(207).json({
            success: false,
            message: `Generation stopped: Intermediate image failed between ${fromStage.stageKey} and ${toStage.stageKey}. ${intermediateResult.error || 'Unknown error'}`,
            stages: results,
            intermediateImages: intermediateResults,
            videos: [],
            failedAtStage: `intermediate-${fromStage.stageOrder}-${toStage.stageOrder}`,
            error: intermediateResult.error || 'Unknown error'
          });
        }
      } catch (error: any) {
        console.error(`❌ Failed to create intermediate image between ${fromStage.stageKey} and ${toStage.stageKey}:`, error.message);
        
        // Stop the entire process if intermediate image generation fails
        return res.status(207).json({
          success: false,
          message: `Generation stopped: Error creating intermediate image between ${fromStage.stageKey} and ${toStage.stageKey}. ${error.message}`,
          stages: results,
          intermediateImages: intermediateResults,
          videos: [],
          failedAtStage: `intermediate-${fromStage.stageOrder}-${toStage.stageOrder}`,
          error: error.message
        });
      }
    }

    // Sort all images by stage order (descending: 8 → 1)
    allImages.sort((a, b) => b.stageOrder - a.stageOrder);

    // Generate videos (5s each) between consecutive images
    // Use selected video model (defaults to Kling O1 if not specified)
    const selectedVideoModel = videoModelName || "Kling O1";
    console.log(`🎬 Creating up to ${MAX_VIDEOS_TO_CREATE} videos (5s each) with start and end frames using ${selectedVideoModel}...`);
    
    const videoResults: Array<{
      videoNumber: number;
      fromStage: string;
      toStage: string;
      fromStageOrder: number;
      toStageOrder: number;
      generationId: string;
      status: string;
      taskId?: string;
      error?: string;
      modelName?: string;  // Include model name in response
    }> = [];

    // Create exactly 12 videos (5s each = 60s total) between consecutive images
    // We need 13 images to create 12 videos
    // Sort all images by stage order (descending: 8 → 1)
    const sortedAllImages = [...allImages].sort((a, b) => b.stageOrder - a.stageOrder);
    
    console.log(`📊 Total images created: ${sortedAllImages.length} (${results.length} stages + ${intermediateResults.length} intermediate = exactly ${sortedAllImages.length} images)`);
    
    // Use all images to create videos (should be exactly 13 images → 12 videos)
    // With 8 stages + 5 intermediate = 13 images exactly, we use all of them
    const videoPairs = sortedAllImages;
    
    if (videoPairs.length !== 13) {
      console.warn(`⚠️ Expected 13 images but got ${videoPairs.length}. Will create ${videoPairs.length - 1} videos instead of 12`);
    } else {
      console.log(`✅ Using ${videoPairs.length} images to create up to ${MAX_VIDEOS_TO_CREATE} videos`);
    }
    
    console.log(`🎬 Creating ${Math.min(MAX_VIDEOS_TO_CREATE, videoPairs.length - 1)} videos (5s each) from ${videoPairs.length} images`);
    
    // Kling API rate limit: max concurrent video tasks
    // Default to 2 to avoid "parallel task over resource pack limit" errors
    // Can be overridden via KLING_MAX_CONCURRENT_VIDEOS env var
    // The error "parallel task over resource pack limit" suggests the actual limit is 2 or lower for some plans
    const MAX_CONCURRENT_VIDEOS = parseInt(process.env.KLING_MAX_CONCURRENT_VIDEOS || "2", 10);
    console.log(`⚙️ Using max concurrent videos: ${MAX_CONCURRENT_VIDEOS} (set KLING_MAX_CONCURRENT_VIDEOS env var to override)`);
    const RETRY_DELAY_BASE = 30000; // 30 seconds base delay for retry
    const MAX_RETRIES = 5; // Increased retries to handle rate limits better
    const SUBMISSION_DELAY = 5000; // 5 seconds delay between submissions to avoid overwhelming API
    
    // Track active video tasks
    const activeTaskIds: string[] = [];
    
    // Helper function to check and clean up completed tasks
    const cleanupCompletedTasks = async (): Promise<number> => {
      const completedTaskIndices: number[] = [];
      for (let idx = 0; idx < activeTaskIds.length; idx++) {
        try {
          const status = await klingService.checkGenerationStatus(activeTaskIds[idx], "image2video", selectedVideoModel);
          const taskStatus = status.data?.task_status;
          
          if (taskStatus === "succeed" || taskStatus === "failed") {
            completedTaskIndices.push(idx);
            console.log(`✅ Task ${activeTaskIds[idx]} completed with status: ${taskStatus}`);
          }
        } catch (error: any) {
          // If we can't check status, assume task is still active (don't remove it)
          console.error(`⚠️ Error checking task status for ${activeTaskIds[idx]}: ${error.message}`);
        }
      }
      
      // Remove completed tasks from active list (reverse order to preserve indices)
      completedTaskIndices.reverse().forEach(idx => {
        activeTaskIds.splice(idx, 1);
      });
      
      return completedTaskIndices.length;
    };
    
    // Helper function to wait for a task to complete or start processing
    const waitForTaskSlot = async () => {
      // First, clean up any completed tasks
      await cleanupCompletedTasks();
      
      if (activeTaskIds.length < MAX_CONCURRENT_VIDEOS) {
        return; // We have a slot available
      }
      
      console.log(`⏳ Rate limit reached (${activeTaskIds.length}/${MAX_CONCURRENT_VIDEOS} active). Waiting for a task to complete...`);
      
      // Poll until at least one task completes
      let pollCount = 0;
      while (activeTaskIds.length >= MAX_CONCURRENT_VIDEOS) {
        pollCount++;
        const checkInterval = pollCount === 1 ? 10000 : 15000; // Check after 10s first, then every 15s
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        
        // Check status of all active tasks
        const completedCount = await cleanupCompletedTasks();
        
        if (completedCount > 0) {
          console.log(`📊 ${activeTaskIds.length}/${MAX_CONCURRENT_VIDEOS} tasks still active after cleanup`);
        }
        
        // Safety limit: don't wait forever
        if (pollCount > 60) { // Max 15 minutes of waiting
          console.warn(`⚠️ Waited too long for task slot. Proceeding anyway (may hit rate limit)`);
          break;
        }
      }
    };
    
    // Helper function to submit video with retry logic
    const submitVideoWithRetry = async (
      startImage: typeof videoPairs[0],
      endImage: typeof videoPairs[0],
      videoNumber: number,
      videoPrompt: string,
      videoTitle: string
    ): Promise<{ success: boolean; result: typeof videoResults[0] | null }> => {
      
      let videoGenerationId: string | null = null;
      
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          videoGenerationId = randomUUID();
          
          // Create generation record for video (5s with image_tail)
          // Use selected video model for video generation
          await prisma.generation.create({
            data: {
              id: videoGenerationId,
              prompt: videoPrompt,
              modelName: selectedVideoModel,  // Use selected video model
              duration: "5s",  // Must be 5s when using image_tail
              aspectRatio: aspectRatio || "16:9",
              resolution: "720p",
              audioEnabled: false,
              feature: "image-to-video",
              generationType: "image-to-video",
              status: "in_progress",
              inputImageUrl: startImage.imageUrl,
              updatedAt: new Date()
            } as any
          });

          // Call Kling API with BOTH start and end frames (image_tail)
          const klingResponse = await klingService.generateImageToVideo({
            imageUrl: startImage.imageUrl,
            endImageUrl: endImage.imageUrl,  // Using image_tail for precise end frame
            prompt: videoPrompt,
            duration: "5s",  // Must be 5s when using image_tail
            aspectRatio: aspectRatio || "16:9",
            audioEnabled: false,
            modelName: selectedVideoModel  // Use selected video model
          });

          if (!klingResponse.data?.task_id) {
            console.error(`❌ Kling API returned unexpected response format for video ${videoNumber}:`, klingResponse);
            // Update generation to failed status
            await prisma.generation.update({
              where: { id: videoGenerationId },
              data: {
                status: "failed",
                errorMessage: "Kling API returned unexpected response format",
                updatedAt: new Date()
              }
            });
            throw new Error("Kling API returned unexpected response format");
          }

          // Update generation with provider job ID
          try {
            await prisma.generation.update({
              where: { id: videoGenerationId },
              data: {
                providerJobId: klingResponse.data.task_id,
                status: "in_progress",
                updatedAt: new Date()
              }
            });
            console.log(`✅ Updated generation ${videoGenerationId} with providerJobId: ${klingResponse.data.task_id}`);
          } catch (updateError: any) {
            console.error(`❌ Failed to update generation ${videoGenerationId} with providerJobId:`, updateError);
            // Update generation to failed status since we can't track it
            await prisma.generation.update({
              where: { id: videoGenerationId },
              data: {
                status: "failed",
                errorMessage: `Failed to update generation with providerJobId: ${updateError.message}`,
                updatedAt: new Date()
              }
            });
            throw new Error(`Failed to update generation with providerJobId: ${updateError.message}`);
          }

          // Track this task as active
          activeTaskIds.push(klingResponse.data.task_id);

          // Start polling for this video generation
          // Pass callback to remove task from activeTaskIds when complete
          const taskType = "image2video";
          const onVideoComplete = (taskId: string) => {
            const index = activeTaskIds.indexOf(taskId);
            if (index > -1) {
              activeTaskIds.splice(index, 1);
              console.log(`✅ Removed completed task ${taskId} from active list. ${activeTaskIds.length}/${MAX_CONCURRENT_VIDEOS} tasks remaining`);
            }
          };
          
          pollKlingGeneration(videoGenerationId, klingResponse.data.task_id, taskType, selectedVideoModel, onVideoComplete).catch((error: any) => {
            console.error(`❌ Failed to start polling for video ${videoNumber} (${videoGenerationId}):`, error.message);
            // Remove task from active list if polling fails to start
            const index = activeTaskIds.indexOf(klingResponse.data.task_id);
            if (index > -1) {
              activeTaskIds.splice(index, 1);
            }
          });

          return {
            success: true,
            result: {
              videoNumber,
              fromStage: startImage.stageKey,
              toStage: endImage.stageKey,
              fromStageOrder: startImage.stageOrder,
              toStageOrder: endImage.stageOrder,
              generationId: videoGenerationId,
              status: "in_progress",
              taskId: klingResponse.data.task_id,
              modelName: selectedVideoModel  // Include model name in response
            }
          };
          
        } catch (error: any) {
          const errorCode = error.response?.data?.code;
          const errorMessage = error.response?.data?.message || error.message;
          const statusCode = error.response?.status;
          
          console.error(`❌ Error submitting video ${videoNumber} (attempt ${attempt}/${MAX_RETRIES}):`, errorMessage);
          console.error(`   Error details:`, {
            message: errorMessage,
            status: statusCode,
            code: errorCode,
            statusText: error.response?.statusText,
            activeTasks: `${activeTaskIds.length}/${MAX_CONCURRENT_VIDEOS}`,
            data: error.response?.data
          });
          
          // If generation was created, update it to failed status
          if (videoGenerationId) {
            try {
              await prisma.generation.update({
                where: { id: videoGenerationId },
                data: {
                  status: "failed",
                  errorMessage: error.message || "Unknown error",
                  errorCode: error.response?.status ? `HTTP_${error.response.status}` : "GENERATION_FAILED",
                  updatedAt: new Date()
                }
              });
              console.log(`✅ Updated generation ${videoGenerationId} to failed status`);
            } catch (updateError: any) {
              console.error(`❌ Failed to update generation ${videoGenerationId} to failed status:`, updateError);
            }
          }
          
          const is429Error = error.message?.includes("429") || 
                            error.message?.includes("rate") || 
                            error.message?.includes("parallel task") ||
                            error.response?.status === 429 ||
                            error.response?.data?.code === 1303;
          
          if (is429Error && attempt < MAX_RETRIES) {
            // Clean up completed tasks first
            await cleanupCompletedTasks();
            
            // Exponential backoff for rate limit errors with jitter
            const baseDelay = RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
            const jitter = Math.random() * 10000; // Add 0-10s random jitter to avoid thundering herd
            const retryDelay = baseDelay + jitter;
            
            console.log(`⚠️ Rate limit hit for video ${videoNumber} (attempt ${attempt}/${MAX_RETRIES}).`);
            console.log(`   Active tasks: ${activeTaskIds.length}/${MAX_CONCURRENT_VIDEOS}`);
            console.log(`   Waiting ${Math.round(retryDelay / 1000)}s before retry...`);
            
            // Wait for a slot to become available (this will poll until a slot opens)
            await waitForTaskSlot();
            
            // Additional delay after slot becomes available to ensure API is ready
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            
            // Reset generationId for retry (will create new one)
            videoGenerationId = null;
            continue;
          }
          
          // Non-retryable error or max retries reached
          console.error(`❌ Final failure for video ${videoNumber} after ${attempt} attempts: ${error.message}`);
          return {
            success: false,
            result: {
              videoNumber,
              fromStage: startImage.stageKey,
              toStage: endImage.stageKey,
              fromStageOrder: startImage.stageOrder,
              toStageOrder: endImage.stageOrder,
              generationId: videoGenerationId || "",
              status: "failed",
              error: error.message || "Unknown error",
              modelName: selectedVideoModel  // Include model name even when failed
            }
          };
        }
      }
      
      // Should not reach here, but just in case
      return { success: false, result: null };
    };
    
    // Validate we have enough images
    if (videoPairs.length < MAX_VIDEOS_TO_CREATE + 1) {
      console.error(`❌ Not enough images! Need ${MAX_VIDEOS_TO_CREATE + 1} images for ${MAX_VIDEOS_TO_CREATE} videos, but only have ${videoPairs.length} images`);
      console.log(`📋 Available images:`, videoPairs.map(img => ({ key: img.stageKey, order: img.stageOrder, success: img.success })));
    }
    
    for (let i = 0; i < Math.min(MAX_VIDEOS_TO_CREATE, videoPairs.length - 1); i++) {
      const startImage = videoPairs[i];
      const endImage = videoPairs[i + 1];
      
      if (!startImage.success || !endImage.success) {
        console.error(`⏭️ Skipping video ${i + 1}: Missing images`);
        console.error(`   Start image: ${startImage.stageKey} - success: ${startImage.success}, url: ${startImage.imageUrl ? 'exists' : 'missing'}`);
        console.error(`   End image: ${endImage.stageKey} - success: ${endImage.success}, url: ${endImage.imageUrl ? 'exists' : 'missing'}`);
        continue;
      }

      const videoNumber = i + 1;
      // Get prompt for this transition using exact stage orders (supports intermediate stages like 7.5, 6.5, etc.)
      const fromOrder = startImage.stageOrder;
      const toOrder = endImage.stageOrder;
      const videoPrompt = getVideoTransitionPrompt(fromOrder, toOrder);
      
      // Get title - try exact match first, then fallback to rounded values
      let videoTitle = getVideoTitle(Math.ceil(fromOrder), Math.ceil(toOrder));
      if (videoTitle.includes("Stage")) {
        // If title is generic, create a more descriptive one
        videoTitle = `${startImage.stageKey} → ${endImage.stageKey}`;
      }
      
      console.log(`🎬 Creating Video ${videoNumber}/${MAX_VIDEOS_TO_CREATE}: ${videoTitle}`);
      console.log(`   From: ${startImage.stageKey} (Order ${startImage.stageOrder}) - URL: ${startImage.imageUrl ? 'exists' : 'MISSING'}`);
      console.log(`   To: ${endImage.stageKey} (Order ${endImage.stageOrder}) - URL: ${endImage.imageUrl ? 'exists' : 'MISSING'}`);

      // Validate image URLs before submitting
      if (!startImage.imageUrl || !endImage.imageUrl) {
        console.error(`❌ Missing image URLs for video ${videoNumber}`);
        console.error(`🛑 Stopping video generation process due to missing image URLs`);
        
        videoResults.push({
          videoNumber,
          fromStage: startImage.stageKey,
          toStage: endImage.stageKey,
          fromStageOrder: startImage.stageOrder,
          toStageOrder: endImage.stageOrder,
          generationId: "",
          status: "failed",
          error: `Missing image URLs: start=${!!startImage.imageUrl}, end=${!!endImage.imageUrl}`,
          modelName: selectedVideoModel  // Include model name even when failed
        });
        
        return res.status(207).json({
          success: false,
          message: `Generation stopped: Missing image URLs for video ${videoNumber} (${startImage.stageKey} → ${endImage.stageKey})`,
          stages: results,
          intermediateImages: intermediateResults,
          videos: videoResults,
          failedAtVideo: videoNumber,
          error: `Missing image URLs: start=${!!startImage.imageUrl}, end=${!!endImage.imageUrl}`
        });
      }

      // Wait for a slot if we're at the rate limit
      await waitForTaskSlot();
      
      // Add a small delay before submitting to avoid overwhelming the API
      // This helps prevent hitting rate limits even when we have slots available
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, SUBMISSION_DELAY));
      }
      
      // Submit video with retry logic
      const { success, result } = await submitVideoWithRetry(
        startImage,
        endImage,
        videoNumber,
        videoPrompt,
        videoTitle
      );
      
      if (result) {
        videoResults.push(result);
        
        if (success) {
          console.log(`✅ Video ${videoNumber}/${MAX_VIDEOS_TO_CREATE} submitted successfully (Task ID: ${result.taskId})`);
          console.log(`📊 Active tasks: ${activeTaskIds.length}/${MAX_CONCURRENT_VIDEOS}`);
        } else {
          // Video failed - stop the entire process
          console.error(`❌ Failed to create video ${videoNumber}: ${result.error}`);
          console.error(`🛑 Stopping video generation process due to failure`);
          
          return res.status(207).json({
            success: false,
            message: `Generation stopped: Video ${videoNumber} failed. ${result.error || 'Unknown error'}`,
            stages: results,
            intermediateImages: intermediateResults,
            videos: videoResults,
            failedAtVideo: videoNumber,
            error: result.error || 'Unknown error'
          });
        }
      } else {
        // No result returned - this shouldn't happen, but handle it
        console.error(`❌ No result returned for video ${videoNumber} - stopping process`);
        
        return res.status(207).json({
          success: false,
          message: `Generation stopped: Video ${videoNumber} submission returned no result`,
          stages: results,
          intermediateImages: intermediateResults,
          videos: videoResults,
          failedAtVideo: videoNumber,
          error: 'No result returned from video submission'
        });
      }
    }

    console.log(`🎬 Video generation complete: ${videoResults.filter(v => v.status === 'in_progress').length} videos submitted, ${videoResults.filter(v => v.status === 'failed').length} failed`);
    console.log(`📊 Total: ${results.length} main stages + ${intermediateResults.length} intermediate images = ${allImages.length} total images`);
    console.log(`🎥 Created ${videoResults.length} videos (${videoResults.length * 5}s total = ${videoResults.length * 5 / 60} minutes)`);

    // Start generation poller to check status of submitted videos
    startGenerationPoller();

    res.status(200).json({
      success: true,
      message: `All construction stages generated successfully. ${intermediateResults.length} intermediate images and ${videoResults.length} transition videos (5s each) are being generated. Total video duration: ${videoResults.length * 5}s.`,
      stages: results,
      intermediateImages: intermediateResults,
      videos: videoResults,
      videosSubmitted: videoResults.filter(v => v.status === 'in_progress').length,
      videosFailed: videoResults.filter(v => v.status === 'failed').length,
      totalVideoDuration: videoResults.length * 5
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      });
    }

    next(error);
  }
});

/**
 * Merge construction stage videos into one video
 * POST /generations/construction-stages/merge
 * Body: { videoIds: string[] } - Array of generation IDs for videos to merge (in order)
 */
router.post("/construction-stages/merge", async (req, res, next) => {
  try {
    const { videoIds } = req.body;

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "videoIds is required and must be a non-empty array"
      });
    }

    console.log(`🎬 Starting merge process for ${videoIds.length} videos...`);

    // Fetch all video generations
    const generations = await prisma.generation.findMany({
      where: {
        id: { in: videoIds },
        status: "completed",
        videoUrl: { not: null }
      },
      orderBy: {
        createdAt: "asc" // Order by creation time to maintain sequence
      }
    });

    if (generations.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No completed videos found with the provided IDs"
      });
    }

    if (generations.length !== videoIds.length) {
      console.warn(`⚠️ Only found ${generations.length} completed videos out of ${videoIds.length} requested`);
    }

    // Download all videos
    console.log(`📥 Downloading ${generations.length} videos...`);
    const videoFilenames: string[] = [];
    
    for (const generation of generations) {
      if (!generation.videoUrl) {
        console.warn(`⚠️ Skipping generation ${generation.id}: no videoUrl`);
        continue;
      }

      try {
        const filename = await downloadAndSaveVideo(generation.videoUrl);
        videoFilenames.push(filename);
        console.log(`✅ Downloaded: ${generation.id} -> ${filename}`);
      } catch (error: any) {
        console.error(`❌ Failed to download video ${generation.id}:`, error.message);
        // Continue with other videos even if one fails
      }
    }

    if (videoFilenames.length === 0) {
      return res.status(500).json({
        success: false,
        error: "Failed to download any videos"
      });
    }

    if (videoFilenames.length === 1) {
      console.log(`ℹ️ Only one video, skipping merge`);
      // Still upload the single video as merged result
      const mergedVideoUrl = await uploadLocalFileToCloudinary(videoFilenames[0], 'video');
      const thumbnailUrl = generations[0].thumbnailUrl || await generateVideoThumbnail(videoFilenames[0]).then(f => uploadLocalFileToCloudinary(f, 'image')).catch(() => null);

      const mergedGenerationId = randomUUID();
      const mergedGeneration = await prisma.generation.create({
        data: {
          id: mergedGenerationId,
          prompt: `Merged construction stages video (${generations.length} videos)`,
          modelName: "Kling O1",
          duration: generations[0].duration || "5s",
          aspectRatio: generations[0].aspectRatio || "16:9",
          resolution: generations[0].resolution || "720p",
          audioEnabled: false,
          feature: "image-to-video",
          generationType: "image-to-video",
          status: "completed",
          videoUrl: mergedVideoUrl,
          thumbnailUrl: thumbnailUrl,
          updatedAt: new Date()
        } as any
      });

      return res.status(200).json({
        success: true,
        message: `Merged ${videoFilenames.length} video(s)`,
        generationId: mergedGenerationId,
        videoUrl: mergedVideoUrl,
        thumbnailUrl: thumbnailUrl,
        duration: generations[0].duration || "5s"
      });
    }

    // Merge videos
    console.log(`🔗 Merging ${videoFilenames.length} videos...`);
    const mergedFilename = await mergeVideos(videoFilenames);

    // Generate thumbnail from merged video
    console.log(`🖼️ Generating thumbnail from merged video...`);
    let thumbnailUrl: string | null = null;
    try {
      const thumbnailFilename = await generateVideoThumbnail(mergedFilename);
      thumbnailUrl = await uploadLocalFileToCloudinary(thumbnailFilename, 'image');
    } catch (error: any) {
      console.warn(`⚠️ Failed to generate thumbnail: ${error.message}`);
      // Use first video's thumbnail as fallback
      thumbnailUrl = generations[0].thumbnailUrl || null;
    }

    // Upload merged video to Cloudinary
    console.log(`☁️ Uploading merged video to Cloudinary...`);
    const mergedVideoUrl = await uploadLocalFileToCloudinary(mergedFilename, 'video');

    // Calculate total duration
    const totalDurationSeconds = generations.length * 5; // Each video is 5s
    const durationMinutes = Math.floor(totalDurationSeconds / 60);
    const durationSeconds = totalDurationSeconds % 60;
    const duration = durationMinutes > 0 ? `${durationMinutes}m ${durationSeconds}s` : `${durationSeconds}s`;

    // Create a new generation record for the merged video
    const mergedGenerationId = randomUUID();
    const mergedGeneration = await prisma.generation.create({
      data: {
        id: mergedGenerationId,
        prompt: `Merged construction stages video (${generations.length} videos, ${duration})`,
        modelName: "Kling O1",
        duration: duration,
        aspectRatio: generations[0].aspectRatio || "16:9",
        resolution: generations[0].resolution || "720p",
        audioEnabled: false,
        feature: "image-to-video",
        generationType: "image-to-video",
        status: "completed",
        videoUrl: mergedVideoUrl,
        thumbnailUrl: thumbnailUrl,
        updatedAt: new Date()
      } as any
    });

    // Clean up downloaded video files
    console.log(`🧹 Cleaning up temporary files...`);
    for (const filename of videoFilenames) {
      try {
        deleteFile(filename);
      } catch (error: any) {
        console.warn(`⚠️ Failed to delete ${filename}:`, error.message);
      }
    }
    try {
      deleteFile(mergedFilename);
    } catch (error: any) {
      console.warn(`⚠️ Failed to delete merged file ${mergedFilename}:`, error.message);
    }

    console.log(`✅ Successfully merged ${generations.length} videos into one (${duration})`);

    res.status(200).json({
      success: true,
      message: `Successfully merged ${generations.length} videos`,
      generationId: mergedGenerationId,
      videoUrl: mergedVideoUrl,
      thumbnailUrl: thumbnailUrl,
      duration: duration,
      totalDurationSeconds: totalDurationSeconds
    });
  } catch (error: any) {
    console.error("❌ Error merging videos:", error);
    next(error);
  }
});

export default router;
