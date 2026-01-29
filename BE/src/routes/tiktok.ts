import { Router } from "express";
import { tiktokService } from "../services/tiktokService";
import prisma from "../prisma";
import path from "path";
import axios from "axios";
import fs from "fs";
import { promisify } from "util";

const router = Router();
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

/**
 * Get TikTok authorization URL
 * Frontend calls this to get the URL to redirect user for TikTok login
 */
router.get("/auth", (req, res) => {
  if (!tiktokService.isConfigured()) {
    res.status(500).json({ error: "TikTok API not configured" });
    return;
  }

  // Generate a random state for CSRF protection
  const state = Math.random().toString(36).substring(2, 15);
  
  // Store state in session/cookie for verification (simplified for now)
  const authUrl = tiktokService.getAuthorizationUrl(state);

  res.json({ 
    authUrl,
    state 
  });
});

/**
 * TikTok OAuth callback
 * TikTok redirects here after user authorizes the app
 */
router.get("/callback", async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      res.redirect(`${process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:5173"}/settings?tiktok_error=${encodeURIComponent(error_description as string || error as string)}`);
      return;
    }

    if (!code) {
      res.status(400).json({ error: "No authorization code provided" });
      return;
    }

    // Exchange code for token
    const tokenData = await tiktokService.exchangeCodeForToken(code as string);

    // Store token in database
    await tiktokService.storeToken(tokenData);

    // Redirect back to frontend with success
    res.redirect(`${process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:5173"}/settings?tiktok_connected=true`);
  } catch (error: any) {
    res.redirect(`${process.env.CORS_ORIGIN?.split(",")[0] || "http://localhost:5173"}/settings?tiktok_error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * Get current TikTok connection status
 */
router.get("/status", async (req, res) => {
  try {
    const token = await tiktokService.getStoredToken();

    if (!token) {
      res.json({ 
        connected: false,
        message: "No TikTok account connected"
      });
      return;
    }

    // Try to get creator info to verify token is still valid
    try {
      const creatorInfo = await tiktokService.getCreatorInfo(token.accessToken);
      res.json({
        connected: true,
        username: creatorInfo.creator_username,
        nickname: creatorInfo.creator_nickname,
        avatarUrl: creatorInfo.creator_avatar_url,
        privacyOptions: creatorInfo.privacy_level_options,
        maxVideoDuration: creatorInfo.max_video_post_duration_sec
      });
    } catch (apiError) {
      // Token might be expired or invalid
      res.json({
        connected: false,
        message: "TikTok token expired, please reconnect"
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Disconnect TikTok account
 */
router.delete("/disconnect", async (req, res) => {
  try {
    await prisma.tiktokToken.deleteMany({});
    res.json({ success: true, message: "TikTok account disconnected" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manually post a video to TikTok
 */
router.post("/post/:generationId", async (req, res) => {
  try {
    const { generationId } = req.params;
    const { title, privacyLevel } = req.body;

    // Get the generation
    const generation = await prisma.generation.findUnique({
      where: { id: generationId }
    });

    if (!generation) {
      res.status(404).json({ error: "Generation not found" });
      return;
    }

    if (generation.status !== "completed" || !generation.videoUrl) {
      res.status(400).json({ error: "Video not ready for posting" });
      return;
    }

    // Check if already posted to TikTok
    if (generation.tiktokPostId) {
      res.status(400).json({ 
        error: "Video has already been posted to TikTok",
        publishId: generation.tiktokPostId,
        status: generation.tiktokPostStatus
      });
      return;
    }

    // Get TikTok token
    const token = await tiktokService.getStoredToken();
    if (!token) {
      res.status(401).json({ error: "TikTok account not connected" });
      return;
    }

    // Extract local file path from video URL or download from Cloudinary
    const videoUrl = generation.videoUrl;
    let videoPath: string;
    let needsCleanup = false;

    if (videoUrl.includes("/uploads/")) {
      // Local file
      const filename = videoUrl.split("/uploads/").pop();
      videoPath = path.join(__dirname, "../../uploads", filename!);
    } else if (videoUrl.includes("cloudinary.com")) {
      // Download from Cloudinary to temp file
      const tempFilename = `tiktok-${Date.now()}.mp4`;
      videoPath = path.join(__dirname, "../../uploads", tempFilename);
      
      try {
        const response = await axios.get(videoUrl, { responseType: "arraybuffer" });
        await writeFile(videoPath, response.data);
        needsCleanup = true;
      } catch (downloadError: any) {
        res.status(500).json({ error: "Failed to download video from Cloudinary" });
        return;
      }
    } else {
      res.status(400).json({ error: "Unsupported video URL format" });
      return;
    }

    try {
      // Post to TikTok
      const result = await tiktokService.postVideoToTikTok(token.accessToken, videoPath, {
        title: title || generation.prompt || "AI Generated Video",
        privacyLevel: privacyLevel || "SELF_ONLY"
      });

      // Update generation with TikTok post info
      await prisma.generation.update({
        where: { id: generationId },
        data: {
          tiktokPostId: result.publishId,
          tiktokPostStatus: result.status
        }
      });

      res.json({ 
        success: true, 
        publishId: result.publishId,
        status: result.status
      });
    } finally {
      // Cleanup temp file
      if (needsCleanup) {
        try {
          await unlink(videoPath);
        } catch (cleanupError) {
          // Silent cleanup failure
        }
      }
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get TikTok settings for auto-post
 */
router.get("/settings", async (req, res) => {
  try {
    const settings = await prisma.tiktokSettings.findFirst();
    res.json({
      autoPostMotionControl: settings?.autoPostMotionControl ?? false,
      defaultPrivacyLevel: settings?.defaultPrivacyLevel ?? "PUBLIC_TO_EVERYONE",
      defaultTitle: settings?.defaultTitle ?? ""
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update TikTok settings for auto-post
 */
router.put("/settings", async (req, res) => {
  try {
    const { autoPostMotionControl, defaultPrivacyLevel, defaultTitle } = req.body;

    const settings = await prisma.tiktokSettings.upsert({
      where: { id: "default" },
      update: {
        autoPostMotionControl,
        defaultPrivacyLevel,
        defaultTitle
      },
      create: {
        id: "default",
        autoPostMotionControl: autoPostMotionControl ?? false,
        defaultPrivacyLevel: defaultPrivacyLevel ?? "PUBLIC_TO_EVERYONE",
        defaultTitle: defaultTitle ?? ""
      }
    });

    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
