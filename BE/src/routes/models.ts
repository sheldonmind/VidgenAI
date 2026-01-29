import { Router } from "express";
import prisma from "../prisma";
import { getModelCapabilities } from "../config/modelCapabilities";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const models = await prisma.model.findMany({
      orderBy: { createdAt: "asc" }
    });

    res.json({
      data: models.map((model) => {
        const capabilities = getModelCapabilities(model.name);
        return {
          id: model.id,
          name: model.name,
          category: model.category,
          capabilities: capabilities || {
            durations: ["6s"],
            aspectRatios: ["16:9"],
            resolutions: ["720p"],
            supportsAudio: true,
            defaultDuration: "6s",
            defaultAspectRatio: "16:9",
            defaultResolution: "720p",
            supportedFeatures: []
          }
        };
      })
    });
  } catch (error) {
    next(error);
  }
});

export default router;
