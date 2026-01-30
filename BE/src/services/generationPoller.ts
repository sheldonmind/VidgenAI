import prisma from "../prisma";
import { veo3Service } from "./veo3Service";
import { klingService } from "./klingService";
import { imagenService } from "./imagenService";
import { tiktokService } from "./tiktokService";
import { downloadAndSaveVideo, downloadAndSaveThumbnail, generateVideoThumbnail } from "../utils/storage";
import { uploadLocalFileToCloudinary } from "./cloudinaryService";
import path from "path";

/**
 * Service to poll for pending video generations
 * This ensures that generations continue to be polled even after server restarts
 */

let pollingInterval: NodeJS.Timeout | null = null;
const POLLING_INTERVAL_MS = 60000; // Check every 60 seconds (reduced API costs by 50%)
const activePolls = new Set<string>(); // Track which generations are currently being polled

/**
 * Determine if a generation is using Kling based on model name
 */
function isKlingModel(modelName: string | null): boolean {
  return modelName?.toLowerCase().includes('kling') ?? false;
}

/**
 * Determine if a generation is using Imagen based on model name
 */
function isImagenModel(modelName: string | null): boolean {
  if (!modelName) return false;
  const lowerName = modelName.toLowerCase();
  return lowerName.includes('imagen');
}

/**
 * Determine Kling task type from generation type
 */
function getKlingTaskType(generationType: string): "text2video" | "image2video" | "video2video" | "motion-control" | "text2image" | "image2image" {
  switch (generationType) {
    case "motion-control":
      return "motion-control";
    case "video-to-video":
      return "video2video";
    case "image-to-video":
      return "image2video";
    case "text-to-image":
      return "text2image";
    case "image-to-image":
      return "image2image";
    default:
      return "text2video";
  }
}

/**
 * Auto-post to TikTok after motion control generation completes
 */
async function autoPostToTikTok(generationId: string, localVideoUrl: string, prompt?: string | null) {
  try {
    // Check TikTok settings
    const settings = await prisma.tiktokSettings.findFirst();
    if (!settings?.autoPostMotionControl) {
      return;
    }

    // Check if TikTok is configured
    if (!tiktokService.isConfigured()) {
      return;
    }

    // Get TikTok token
    const token = await tiktokService.getStoredToken();
    if (!token) {
      return;
    }

    // Extract local file path from video URL
    let videoPath: string;
    if (localVideoUrl.includes("/uploads/")) {
      const filename = localVideoUrl.split("/uploads/").pop();
      videoPath = path.join(__dirname, "../../uploads", filename!);
    } else {
      return;
    }

    // Post to TikTok
    const result = await tiktokService.postVideoToTikTok(token.accessToken, videoPath, {
      title: settings.defaultTitle || prompt || "AI Generated Motion Control Video #AI #MotionControl",
      privacyLevel: (settings.defaultPrivacyLevel as any) || "PUBLIC_TO_EVERYONE"
    });

    // Update generation with TikTok post info
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        tiktokPostId: result.publishId,
        tiktokPostStatus: result.status
      }
    });
  } catch (error: any) {
    
    // Update generation with error status
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        tiktokPostStatus: `failed: ${error.message}`
      }
    });
  }
}

/**
 * Poll a single Kling generation
 */
async function pollKlingGeneration(generationId: string, taskId: string, generationType: string) {
  const taskType = getKlingTaskType(generationType);
  
  // Get modelName from database
  const generation = await prisma.generation.findUnique({
    where: { id: generationId },
    select: { modelName: true }
  });
  
  try {
    const status = await klingService.checkGenerationStatus(taskId, taskType, generation?.modelName || undefined);

    if (status.data.task_status === "succeed") {
      const isImageTask = generationType === "text-to-image" || generationType === "image-to-image";
      
      if (isImageTask) {
        // Handle image generation results
        const imageUrl = status.data.task_result?.images?.[0]?.url;
        
        if (imageUrl) {
          try {
            // Download image from Kling
            const imageFilename = await downloadAndSaveThumbnail(imageUrl, undefined);
            
            // Upload image to Cloudinary
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
          await prisma.generation.update({
            where: { id: generationId },
            data: {
              status: "failed",
              updatedAt: new Date()
            }
          });
        }
      } else {
        // Handle video generation results
        const videoUrl = status.data.task_result?.videos?.[0]?.url;
        const thumbnailUrl = status.data.task_result?.videos?.[0]?.cover_url; // Extract cover_url from Kling API

        if (videoUrl) {
          let finalLocalVideoUrl: string | null = null;
          let prompt: string | null = null;
          
          // Get generation prompt for TikTok title
          const generation = await prisma.generation.findUnique({
            where: { id: generationId },
            select: { prompt: true }
          });
          prompt = generation?.prompt || null;
          
          try {
            // Download video from Kling
            const videoFilename = await downloadAndSaveVideo(videoUrl, undefined);
            
            // Upload video to Cloudinary (REQUIRED - no fallback)
            const cloudinaryVideoUrl = await uploadLocalFileToCloudinary(videoFilename, 'video');
            finalLocalVideoUrl = cloudinaryVideoUrl;

            // Download or generate thumbnail
            let cloudinaryThumbnailUrl: string;
            if (thumbnailUrl) {
              // If Kling provides cover_url, download it
              try {
                const thumbnailFilename = await downloadAndSaveThumbnail(thumbnailUrl, undefined);
                cloudinaryThumbnailUrl = await uploadLocalFileToCloudinary(thumbnailFilename, 'image');
              } catch (thumbError: any) {
                // Fallback: generate thumbnail from video
                const thumbnailFilename = await generateVideoThumbnail(videoFilename);
                cloudinaryThumbnailUrl = await uploadLocalFileToCloudinary(thumbnailFilename, 'image');
              }
            } else {
              // If no cover_url from Kling, generate thumbnail from video
              const thumbnailFilename = await generateVideoThumbnail(videoFilename);
              cloudinaryThumbnailUrl = await uploadLocalFileToCloudinary(thumbnailFilename, 'image');
            }

            await prisma.generation.update({
              where: { id: generationId },
              data: {
                status: "completed",
                videoUrl: cloudinaryVideoUrl,
                thumbnailUrl: cloudinaryThumbnailUrl,
                updatedAt: new Date()
              }
            });
          } catch (downloadError: any) {
            await prisma.generation.update({
              where: { id: generationId },
              data: {
                status: "failed",
                errorMessage: `Failed to upload to Cloudinary: ${downloadError.message}`,
                updatedAt: new Date()
              }
            });
            return; // Don't try to auto-post if failed
          }
          
          // Auto-post to TikTok if this is a Motion Control generation
          if (generationType === "motion-control" && finalLocalVideoUrl) {
            autoPostToTikTok(generationId, finalLocalVideoUrl, prompt).catch(() => {});
          }
        } else {
          await prisma.generation.update({
            where: { id: generationId },
            data: {
              status: "failed",
              updatedAt: new Date()
            }
          });
        }
      }
    } else if (status.data.task_status === "failed") {
      await prisma.generation.update({
        where: { id: generationId },
        data: {
          status: "failed",
          updatedAt: new Date()
        }
      });
    }
  } catch (error: any) {
    throw error;
  }
}

/**
 * Poll a single Veo 3 generation
 */
async function pollVeo3Generation(generationId: string, operationName: string) {
  try {
    const status = await veo3Service.checkGenerationStatus(operationName);

    if (status.done) {
      if (status.error) {
        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "failed",
            updatedAt: new Date()
          }
        });
      } else {
        const videoUrl = veo3Service.extractVideoUrl(status);
        const thumbnailUrl = veo3Service.extractThumbnailUrl(status);

        if (videoUrl) {
          try {
            const apiKey = process.env.GOOGLE_API_KEY;
            // Download video from Google API
            const videoFilename = await downloadAndSaveVideo(videoUrl, apiKey);
            
            // Upload video to Cloudinary (REQUIRED - no fallback)
            const cloudinaryVideoUrl = await uploadLocalFileToCloudinary(videoFilename, 'video');
            
            // Handle thumbnail
            let cloudinaryThumbnailUrl = cloudinaryVideoUrl; // Use video as thumbnail by default
            if (thumbnailUrl) {
              try {
                const thumbnailFilename = await downloadAndSaveThumbnail(thumbnailUrl, apiKey);
                cloudinaryThumbnailUrl = await uploadLocalFileToCloudinary(thumbnailFilename, 'image');
              } catch (thumbError: any) {
                // Use video URL as thumbnail fallback
              }
            }

            await prisma.generation.update({
              where: { id: generationId },
              data: {
                status: "completed",
                videoUrl: cloudinaryVideoUrl,
                thumbnailUrl: cloudinaryThumbnailUrl,
                updatedAt: new Date()
              }
            });
          } catch (downloadError: any) {
            await prisma.generation.update({
              where: { id: generationId },
              data: {
                status: "failed",
                errorMessage: `Failed to upload to Cloudinary: ${downloadError.message}`,
                updatedAt: new Date()
              }
            });
          }
        } else {
          await prisma.generation.update({
            where: { id: generationId },
            data: {
              status: "failed",
              errorMessage: "No video URL returned from provider",
              updatedAt: new Date()
            }
          });
        }
      }
    }
  } catch (error: any) {
    throw error;
  }
}

/**
 * Poll a single Imagen generation
 */
async function pollImagenGeneration(generationId: string, operationName: string) {
  try {
    const status = await imagenService.checkGenerationStatus(operationName);

    if (status.done) {
      if (status.error) {
        await prisma.generation.update({
          where: { id: generationId },
          data: {
            status: "failed",
            updatedAt: new Date()
          }
        });
      } else {
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
          } catch (downloadError: any) {
            await prisma.generation.update({
              where: { id: generationId },
              data: {
                status: "failed",
                errorMessage: `Failed to upload image to Cloudinary: ${downloadError.message}`,
                updatedAt: new Date()
              }
            });
          }
        } else {
          await prisma.generation.update({
            where: { id: generationId },
            data: {
              status: "failed",
              errorMessage: "No image URL returned from provider",
              updatedAt: new Date()
            }
          });
        }
      }
    }
  } catch (error: any) {
    throw error;
  }
}

/**
 * Poll a single generation (routes to appropriate provider)
 */
async function pollGeneration(generationId: string, operationName: string, modelName: string | null, generationType: string) {
  if (activePolls.has(generationId)) {
    return;
  }

  activePolls.add(generationId);

  try {
    if (isImagenModel(modelName)) {
      await pollImagenGeneration(generationId, operationName);
    } else if (isKlingModel(modelName)) {
      await pollKlingGeneration(generationId, operationName, generationType);
    } else {
      await pollVeo3Generation(generationId, operationName);
    }
  } catch (error: any) {
    // Silent error handling
  } finally {
    activePolls.delete(generationId);
  }
}

/**
 * Check all pending generations and poll them
 * Returns the number of pending generations found
 */
async function checkPendingGenerations(): Promise<number> {
  try {
    const pendingGenerations = await prisma.generation.findMany({
      where: {
        status: "in_progress",
        providerJobId: { not: null }
      },
      select: {
        id: true,
        providerJobId: true,
        modelName: true,
        generationType: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    });

    if (pendingGenerations.length > 0) {
      for (const gen of pendingGenerations) {
        if (gen.providerJobId) {
          const ageMinutes = (Date.now() - gen.createdAt.getTime()) / (1000 * 60);
          if (ageMinutes > 30) {
            await prisma.generation.update({
              where: { id: gen.id },
              data: {
                status: "failed",
                updatedAt: new Date()
              }
            });
            continue;
          }

          await pollGeneration(gen.id, gen.providerJobId, gen.modelName, gen.generationType);
        }
      }
    }

    return pendingGenerations.length;
  } catch (error) {
    // Silent error handling
    return 0;
  }
}

/**
 * Start the polling service
 * Automatically stops when there are no pending generations (smart polling)
 */
export function startGenerationPoller() {
  if (pollingInterval) {
    return;
  }

  // Check immediately
  checkPendingGenerations().then(count => {
    if (count === 0) {
      stopGenerationPoller();
    }
  }).catch(() => {});

  // Set up recurring check
  pollingInterval = setInterval(async () => {
    try {
      const pendingCount = await checkPendingGenerations();
      
      // Auto-stop if no pending generations (save money!)
      if (pendingCount === 0) {
        stopGenerationPoller();
      }
    } catch (error) {
      // Silent error handling
    }
  }, POLLING_INTERVAL_MS);
}

/**
 * Stop the polling service
 */
export function stopGenerationPoller() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/**
 * Force check pending generations now
 */
export async function checkNow() {
  await checkPendingGenerations();
}
