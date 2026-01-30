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
import { downloadAndSaveVideo, downloadAndSaveThumbnail, generateVideoThumbnail, deleteFile } from "../utils/storage";
import { uploadLocalFileToCloudinary, deleteFromCloudinary, extractPublicId } from "../services/cloudinaryService";
import axios from "axios";
import { CONSTRUCTION_STAGES, BASE_PROMPT, buildStagePrompt, getAllStages } from "../config/constructionStages";

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
        inputImageUrl = await uploadLocalFileToCloudinary(imageFile.filename, 'image');
      }

      if (characterFile) {
        characterImageUrl = await uploadLocalFileToCloudinary(characterFile.filename, 'image');
      }

      if (startFrameFile) {
        startFrameUrl = await uploadLocalFileToCloudinary(startFrameFile.filename, 'image');
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
      res.status(400).json({ error: "No provider job ID found for this generation" });
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
    } else if (params.generationType === "image-to-video" && params.inputImageUrl) {
      klingResponse = await klingService.generateImageToVideo({
        imageUrl: params.inputImageUrl,
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
          const videoUrl = status.data.task_result?.videos?.[0]?.url;
          const thumbnailUrl = status.data.task_result?.videos?.[0]?.cover_url;

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
      parsed = { modelName: "Nano Banana", aspectRatio: "16:9" };
    }
    
    const { inputImageUrl: providedImageUrl, modelName, aspectRatio, basePrompt } = parsed;

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

    const stages = getAllStages();
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

    res.status(200).json({
      success: true,
      message: "All construction stages generated successfully",
      stages: results
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

export default router;
