import { Router } from "express";
import { z } from "zod";
import prisma from "../prisma";

const router = Router();

/**
 * Webhook schema for Kling AI callbacks
 */
const klingWebhookSchema = z.object({
  generation_id: z.string(),
  status: z.enum(["completed", "failed", "processing"]),
  video_url: z.string().url().optional(),
  thumbnail_url: z.string().url().optional(),
  error: z.string().optional()
});

/**
 * Webhook endpoint for Kling AI to notify us when generation is complete
 * POST /api/v1/webhooks/kling
 */
router.post("/kling", async (req, res, next) => {
  try {
    const parsed = klingWebhookSchema.parse(req.body);

    const generation = await prisma.generation.findFirst({
      where: { providerJobId: parsed.generation_id }
    });

    if (!generation) {
      res.status(404).json({ error: "Generation not found" });
      return;
    }

    if (parsed.status === "completed" && parsed.video_url) {
      await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: "completed",
          videoUrl: parsed.video_url,
          thumbnailUrl: parsed.thumbnail_url,
          updatedAt: new Date()
        }
      });
    } else if (parsed.status === "failed") {
      await prisma.generation.update({
        where: { id: generation.id },
        data: {
          status: "failed",
          updatedAt: new Date()
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
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
