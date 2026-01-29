import axios, { AxiosInstance } from "axios";
import jwt from "jsonwebtoken";
import {
  KlingGenerationRequest,
  KlingGenerationResponse,
  KlingStatusResponse,
  KlingImageToVideoRequest,
  KlingMotionControlRequest,
  KlingVideoToVideoRequest,
  KlingTextToImageRequest,
  KlingImageToImageRequest
} from "../types/kling";
import { imageUrlToBase64, videoUrlToBase64 } from "../utils/storage";

export class KlingService {
  private client: AxiosInstance;
  private accessKey: string;
  private secretKey: string;
  private apiKey: string;
  private baseUrl: string;
  private useJWT: boolean;

  constructor() {
    this.accessKey = process.env.KLING_ACCESS_KEY || "";
    this.secretKey = process.env.KLING_SECRET_KEY || "";
    this.apiKey = process.env.KLING_API_KEY || "";
    
    const rawBaseUrl =
      process.env.KLING_API_BASE_URL ||
      process.env.KLING_BASE_URL ||
      "https://api.klingai.com";
    this.baseUrl = this.normalizeBaseUrl(rawBaseUrl);

    this.useJWT = !!(this.accessKey && this.secretKey);

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Content-Type": "application/json"
      },
      timeout: 30000
    });
  }

  /**
   * Generate JWT token for Kling API authentication
   */
  private generateJWTToken(): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.accessKey,  // Access Key as issuer
      exp: now + 1800,      // Token expires in 30 minutes
      nbf: now - 5          // Token is valid 5 seconds from now
    };
    
    const token = jwt.sign(payload, this.secretKey, {
      algorithm: "HS256",
      header: {
        alg: "HS256",
        typ: "JWT"
      }
    });
    
    return token;
  }

  /**
   * Get authorization headers (JWT or simple API key)
   */
  private getAuthHeaders(): Record<string, string> {
    if (this.useJWT) {
      return {
        Authorization: `Bearer ${this.generateJWTToken()}`
      };
    } else {
      return {
        Authorization: `Bearer ${this.apiKey}`
      };
    }
  }

  /**
   * Text-to-Video generation using Kling AI
   */
  async generateTextToVideo(params: {
    prompt: string;
    duration: string;
    aspectRatio: string;
    resolution: string;
    audioEnabled: boolean;
    modelName?: string;
  }): Promise<KlingGenerationResponse> {
    // Map duration string to number (e.g., "5s" -> "5")
    let durationStr = params.duration.replace("s", "");
    
    let durationSeconds = parseInt(durationStr);
    if (durationSeconds < 7.5) {
      durationSeconds = 5;
    } else {
      durationSeconds = 10;
    }

    const aspectRatio = params.aspectRatio;

    // Determine model based on modelName or use default
    const modelName = this.getKlingModelIdentifier(params.modelName);

    const request: any = {
      model: modelName,
      prompt: params.prompt,
      aspect_ratio: aspectRatio,
      duration: durationSeconds,  // Send as number, not string
      negative_prompt: "blurry, low quality, distorted, ugly, bad anatomy",
    };

    // Only add cfg_scale for v1.x models (v2.x doesn't support it)
    if (modelName.includes("v1")) {
      request.cfg_scale = 0.5;
    }

    // Only add sound for v2.6+ models
    if ((modelName === "kling-v2.6-pro" || modelName === "kling-v2.6-std") && params.audioEnabled) {
      request.sound = "on";
    }

    try {
      const response = await this.client.post<KlingGenerationResponse>(
        "/v1/videos/text2video",
        request,
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error: any) {
      // Log detailed error information
      console.error(`❌ Kling API Error:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method
      });

      if (error.response?.status === 401) {
        throw new Error(
          `Kling API authentication failed: ${error.response?.data?.message || "Invalid credentials"}. ` +
          `Please verify your KLING_ACCESS_KEY and KLING_SECRET_KEY are correct.`
        );
      }
      
      // Include response data in error message if available
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          "Unknown error";
      const errorCode = error.response?.data?.code || 
                       error.response?.data?.error_code || 
                       "UNKNOWN_ERROR";
      
      throw new Error(
        `Kling API error (${error.response?.status || 'N/A'}): ${errorCode} - ${errorMessage}`
      );
    }
  }

  /**
   * Image-to-Video generation using Kling AI
   */
  async generateImageToVideo(params: {
    imageUrl: string;
    prompt?: string;
    duration: string;
    aspectRatio: string;
    audioEnabled: boolean;
    modelName?: string;
  }): Promise<KlingGenerationResponse> {
    // Map duration string to number
    let durationSeconds = parseInt(params.duration.replace("s", ""));
    
    if (durationSeconds < 7.5) {
      durationSeconds = 5;
    } else {
      durationSeconds = 10;
    }
    
    const modelName = this.getKlingModelIdentifier(params.modelName);

    // Convert image URL (local or remote) to base64
    let imageData: string;
    try {
      const base64DataUri = await imageUrlToBase64(params.imageUrl);
      // Kling API requires raw base64 without data URI prefix
      imageData = base64DataUri.replace(/^data:image\/[a-z]+;base64,/, '');
    } catch (error: any) {
      console.error(`❌ Failed to convert image to base64:`, error.message);
      throw new Error(`Failed to convert image to base64: ${error.message}`);
    }

    const request: any = {
      model: modelName,
      image: imageData,  // Use "image" field for base64 data (not "image_url")
      prompt: params.prompt,
      duration: durationSeconds,  // Send as number, not string
      aspect_ratio: params.aspectRatio,
      negative_prompt: "blurry, low quality, distorted",
    };

    // Only add cfg_scale for v1.x models (v2.x doesn't support it)
    if (modelName.includes("v1")) {
      request.cfg_scale = 0.5;
    }

    // Only add sound for v2.6+ models
    if ((modelName === "kling-v2.6-pro" || modelName === "kling-v2.6-std") && params.audioEnabled) {
      request.sound = "on";
    }

    try {
      const response = await this.client.post<KlingGenerationResponse>(
        "/v1/videos/image2video",
        request,
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error: any) {
      // Log detailed error information
      console.error(`❌ Kling API Error:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method
      });

      if (error.response?.status === 401) {
        throw new Error(
          `Kling API authentication failed: ${error.response?.data?.message || "Invalid credentials"}. ` +
          `Please verify your KLING_ACCESS_KEY and KLING_SECRET_KEY are correct.`
        );
      }
      
      // Include response data in error message if available
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          "Unknown error";
      const errorCode = error.response?.data?.code || 
                       error.response?.data?.error_code || 
                       "UNKNOWN_ERROR";
      
      throw new Error(
        `Kling API error (${error.response?.status || 'N/A'}): ${errorCode} - ${errorMessage}`
      );
    }
  }

  /**
   * Video-to-Video generation using Kling AI
   * Transforms an existing video based on a prompt
   * 
   * NOTE: Kling O1 requires publicly accessible URLs, NOT base64 data.
   * Other models (v2.6, v2.5) may support base64, but URLs are preferred for consistency.
   */
  async generateVideoToVideo(params: {
    videoUrl: string;
    prompt?: string;
    duration: string;
    aspectRatio: string;
    audioEnabled: boolean;
    modelName?: string;
  }): Promise<KlingGenerationResponse> {
    // Map duration string to number
    let durationSeconds = parseInt(params.duration.replace("s", ""));
    
    if (durationSeconds < 7.5) {
      durationSeconds = 5;
    } else {
      durationSeconds = 10;
    }
    
    const modelName = this.getKlingModelIdentifier(params.modelName, "video-to-video");
    const isKlingO1 = modelName === "kling-video-o1";

    // Kling O1 requires publicly accessible URLs (like motion control)
    // For other models, we'll try URL first, then fallback to base64 if needed
    const request: any = {
      model: modelName,
      prompt: params.prompt,
      duration: durationSeconds,  // Send as number, not string
      aspect_ratio: params.aspectRatio,
      negative_prompt: "blurry, low quality, distorted",
    };

    // Kling O1 uses video_url field (must be publicly accessible URL)
    if (isKlingO1) {
      if (!params.videoUrl || (!params.videoUrl.startsWith("http://") && !params.videoUrl.startsWith("https://"))) {
        throw new Error("Kling O1 requires a publicly accessible video URL (http:// or https://). Please ensure your video is uploaded to Cloudinary or another public hosting service.");
      }
      request.video_url = params.videoUrl;
      
      // Kling O1 specific parameters
      request.aspect_ratio = params.aspectRatio;
      if (params.audioEnabled) {
        request.keep_audio = true;
      }
    } else {
      // For v2.6 and v2.5 models, try URL first, then base64
      if (params.videoUrl.startsWith("http://") || params.videoUrl.startsWith("https://")) {
        // Use URL if it's already a remote URL
        request.video_url = params.videoUrl;
      } else {
        // Convert local video to base64 for v2.x models
        let videoData: string;
        try {
          const base64DataUri = videoUrlToBase64(params.videoUrl);
          // Kling API requires raw base64 without data URI prefix
          videoData = base64DataUri.replace(/^data:video\/[a-z]+;base64,/, '');
          request.video = videoData;  // Use "video" field for base64 data
        } catch (error: any) {
          console.error(`❌ Failed to convert video to base64:`, error.message);
          throw new Error(`Failed to convert video to base64: ${error.message}`);
        }
      }
    }

    // Only add cfg_scale for v1.x models (v2.x doesn't support it)
    if (modelName.includes("v1") && !isKlingO1) {
      request.cfg_scale = 0.5;
    }

    // Only add sound for v2.6+ models (not O1)
    if ((modelName === "kling-v2.6-pro" || modelName === "kling-v2.6-std") && params.audioEnabled) {
      request.sound = "on";
    }

    try {
      // Try different endpoints based on model
      // Note: Official Kling API might not have video2video endpoint for v2.6
      // Kling O1 might need special endpoint, but for now we'll try the standard one
      let endpoint = "/v1/videos/video2video";
      
      // If using Kling O1 and base URL suggests v2 API, use v2 endpoint
      if (isKlingO1 && this.baseUrl.includes("/v2")) {
        endpoint = "/v2/video/generations";
      }
      
      const response = await this.client.post<KlingGenerationResponse>(
        endpoint,
        request,
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error: any) {
      // Log detailed error information
      console.error(`❌ Kling API Error:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method,
        requestData: {
          model: request.model,
          hasVideoUrl: !!request.video_url,
          hasVideo: !!request.video,
          duration: request.duration
        }
      });

      if (error.response?.status === 401) {
        throw new Error(
          `Kling API authentication failed: ${error.response?.data?.message || "Invalid credentials"}. ` +
          `Please verify your KLING_ACCESS_KEY and KLING_SECRET_KEY are correct.`
        );
      }
      
      // Include response data in error message if available
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          "Unknown error";
      const errorCode = error.response?.data?.code || 
                       error.response?.data?.error_code || 
                       "UNKNOWN_ERROR";
      
      throw new Error(
        `Kling API error (${error.response?.status || 'N/A'}): ${errorCode} - ${errorMessage}`
      );
    }
  }

  /**
   * Motion Control generation (character animation)
   * 
   * NOTE: Kling Motion Control API requires publicly accessible URLs, NOT base64 data.
   * The videoUrl and characterImageUrl must be full URLs that Kling servers can access.
   * 
   * character_orientation options:
   * - "image" (max 10 seconds): Character orientation matches the reference image
   * - "video" (max 30 seconds): Character orientation matches the reference video
   */
  async generateMotionControl(params: {
    videoUrl: string;
    characterImageUrl: string;
    prompt?: string;
    duration: string;
    resolution: string;
    modelName?: string;
    characterOrientation?: "image" | "video";
  }): Promise<KlingGenerationResponse> {
    const modelName = this.getKlingModelIdentifier(params.modelName, "motion");

    // Validate that URLs are provided (Motion Control requires URLs, not base64)
    if (!params.videoUrl) {
      throw new Error("Motion Control requires a video URL");
    }
    if (!params.characterImageUrl) {
      throw new Error("Motion Control requires a character image URL");
    }

    // Character orientation is REQUIRED by Kling API
    // - "image": orientation follows the reference image (max 10 seconds)
    // - "video": orientation follows the reference video (max 30 seconds)
    const characterOrientation = params.characterOrientation || "video";

    // Kling Motion Control API expects URL fields in snake_case (image_url, video_url)
    // NOT base64 data. The URLs must be publicly accessible.
    const request: any = {
      model_name: modelName,
      video_url: params.videoUrl,
      image_url: params.characterImageUrl,
      character_orientation: characterOrientation,
      prompt: params.prompt,
      mode: params.resolution === "1080p" ? "pro" : "std"
    };

    try {
      const response = await this.client.post<KlingGenerationResponse>(
        "/v1/videos/motion-control",
        request,
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error: any) {
      console.error(`❌ Kling API Error:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method
      });
      
      if (error.response?.status === 401) {
        throw new Error(
          `Kling API authentication failed: ${error.response?.data?.message || "Invalid credentials"}. ` +
          `Please verify your KLING_ACCESS_KEY and KLING_SECRET_KEY are correct.`
        );
      }
      
      // Include response data in error message if available
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          "Unknown error";
      const errorCode = error.response?.data?.code || 
                       error.response?.data?.error_code || 
                       "UNKNOWN_ERROR";
      
      throw new Error(
        `Kling API error (${error.response?.status || 'N/A'}): ${errorCode} - ${errorMessage}`
      );
    }
  }

  /**
   * Text-to-Image generation using Kling AI
   */
  async generateTextToImage(params: {
    prompt: string;
    aspectRatio: string;
    modelName?: string;
  }): Promise<KlingGenerationResponse> {
    const modelName = this.getKlingModelIdentifier(params.modelName, "text-to-image");
    const isKlingO1 = modelName === "kling-image-o1";

    // Kling O1 uses a different endpoint and request format
    if (isKlingO1) {
      const request: any = {
        model_name: modelName,
        prompt: params.prompt,
        aspect_ratio: params.aspectRatio === "auto" ? "auto" : params.aspectRatio,
        resolution: "1k", // Default to 1k, can be "1k" or "2k"
        n: 1 // Number of images to generate
      };

      try {
        const response = await this.client.post<KlingGenerationResponse>(
          "/v1/images/omni-image",
          request,
          { headers: this.getAuthHeaders() }
        );

        return response.data;
      } catch (error: any) {
        console.error(`❌ Kling API Error:`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
          url: error.config?.url,
          method: error.config?.method
        });

        if (error.response?.status === 401) {
          throw new Error(
            `Kling API authentication failed: ${error.response?.data?.message || "Invalid credentials"}. ` +
            `Please verify your KLING_ACCESS_KEY and KLING_SECRET_KEY are correct.`
          );
        }
        
        const errorMessage = error.response?.data?.message || 
                            error.response?.data?.error || 
                            error.message || 
                            "Unknown error";
        const errorCode = error.response?.data?.code || 
                         error.response?.data?.error_code || 
                         "UNKNOWN_ERROR";
        
        throw new Error(
          `Kling API error (${error.response?.status || 'N/A'}): ${errorCode} - ${errorMessage}`
        );
      }
    }

    // For other models, use the standard text2image endpoint
    const request: KlingTextToImageRequest = {
      model: modelName,
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio,
      negative_prompt: "blurry, low quality, distorted, ugly, bad anatomy",
      cfg_scale: 7.0
    };

    try {
      const response = await this.client.post<KlingGenerationResponse>(
        "/v1/images/text2image",
        request,
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error: any) {
      console.error(`❌ Kling API Error:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method
      });

      if (error.response?.status === 401) {
        throw new Error(
          `Kling API authentication failed: ${error.response?.data?.message || "Invalid credentials"}. ` +
          `Please verify your KLING_ACCESS_KEY and KLING_SECRET_KEY are correct.`
        );
      }
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          "Unknown error";
      const errorCode = error.response?.data?.code || 
                       error.response?.data?.error_code || 
                       "UNKNOWN_ERROR";
      
      throw new Error(
        `Kling API error (${error.response?.status || 'N/A'}): ${errorCode} - ${errorMessage}`
      );
    }
  }

  /**
   * Image-to-Image generation using Kling AI
   */
  async generateImageToImage(params: {
    imageUrl: string;
    prompt?: string;
    aspectRatio: string;
    strength?: number;
    modelName?: string;
  }): Promise<KlingGenerationResponse> {
    const modelName = this.getKlingModelIdentifier(params.modelName, "image-to-image");

    // Convert image URL (local or remote) to base64
    let imageData: string;
    try {
      const base64DataUri = await imageUrlToBase64(params.imageUrl);
      // Kling API requires raw base64 without data URI prefix
      imageData = base64DataUri.replace(/^data:image\/[a-z]+;base64,/, '');
    } catch (error: any) {
      console.error(`❌ Failed to convert image to base64:`, error.message);
      throw new Error(`Failed to convert image to base64: ${error.message}`);
    }

    const request: KlingImageToImageRequest = {
      model: modelName,
      image: imageData,
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio,
      negative_prompt: "blurry, low quality, distorted",
      cfg_scale: 7.0,
      strength: params.strength ?? 0.7  // Default strength of 0.7
    };

    try {
      const response = await this.client.post<KlingGenerationResponse>(
        "/v1/images/image2image",
        request,
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error: any) {
      console.error(`❌ Kling API Error:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method
      });

      if (error.response?.status === 401) {
        throw new Error(
          `Kling API authentication failed: ${error.response?.data?.message || "Invalid credentials"}. ` +
          `Please verify your KLING_ACCESS_KEY and KLING_SECRET_KEY are correct.`
        );
      }
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          "Unknown error";
      const errorCode = error.response?.data?.code || 
                       error.response?.data?.error_code || 
                       "UNKNOWN_ERROR";
      
      throw new Error(
        `Kling API error (${error.response?.status || 'N/A'}): ${errorCode} - ${errorMessage}`
      );
    }
  }

  /**
   * Check the status of a video or image generation job
   */
  async checkGenerationStatus(
    generationId: string,
    taskType: "text2video" | "image2video" | "video2video" | "motion-control" | "text2image" | "image2image" = "text2video",
    modelName?: string
  ): Promise<KlingStatusResponse> {
    try {
      // Determine the correct endpoint based on task type
      const isImageTask = taskType === "text2image" || taskType === "image2image";
      
      // Kling O1 uses different endpoints for image generation
      const isKlingO1Image = isImageTask && modelName === "Kling O1";
      
      let endpoint: string;
      if (isKlingO1Image) {
        // Omni-Image O1 uses /v1/images/omni-image/{id}
        endpoint = `/v1/images/omni-image/${generationId}`;
      } else if (isImageTask) {
        endpoint = `/v1/images/${taskType}/${generationId}`;
      } else {
        endpoint = `/v1/videos/${taskType}/${generationId}`;
      }
      
      const response = await this.client.get<KlingStatusResponse>(
        endpoint,
        { headers: this.getAuthHeaders() }
      );

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new Error(
          `Kling API authentication failed: ${error.response?.data?.message || "Invalid credentials"}. ` +
          `Please verify your KLING_ACCESS_KEY and KLING_SECRET_KEY are correct.`
        );
      }
      
      throw new Error(
        `Kling API error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Poll for generation completion (with timeout)
   */
  async waitForCompletion(
    generationId: string,
    taskType: "text2video" | "image2video" | "video2video" | "motion-control" | "text2image" | "image2image" = "text2video",
    maxAttempts = 60,
    intervalMs = 10000
  ): Promise<KlingStatusResponse> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.checkGenerationStatus(generationId, taskType);

      if (status.data.task_status === "succeed") {
        return status;
      }

      if (status.data.task_status === "failed") {
        throw new Error(`Generation failed: ${status.data.task_status_msg || "Unknown error"}`);
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      attempts++;
    }

    throw new Error(`Generation timed out after ${maxAttempts} attempts`);
  }

  /**
   * Map model names to Kling API identifiers
   */
  private getKlingModelIdentifier(
    modelName?: string,
    type: "text-to-video" | "motion" | "video-to-video" | "text-to-image" | "image-to-image" = "text-to-video"
  ): string {
    // Always use kling-motion-control for motion type
    if (type === "motion") {
      return "kling-motion-control";
    }

    if (!modelName) {
      return "kling-v2-6";
    }

    const modelMap: Record<string, string> = {
      "Kling 2.6": "kling-v2.6-pro",
      "Kling 2.6 Standard": "kling-v2.6-std",
      "Kling Motion Control": "kling-motion-control",
      "Kling 2.5 Turbo": "kling-v2.5-turbo",
      "Kling O1": "kling-video-o1"
    };

    // For image generation, use image-specific models if available
    // Kling O1 has separate models for video (kling-video-o1) and image (kling-image-o1)
    if (type === "text-to-image" || type === "image-to-image") {
      if (modelName === "Kling O1") {
        return "kling-image-o1";
      }
      // Default to v2.6-pro for other models
      return modelMap[modelName || ""] || "kling-v2.6-pro";
    }

    // For video-to-video, prefer Kling O1 if available, otherwise use the model's default
    if (type === "video-to-video" && modelName === "Kling O1") {
      return "kling-video-o1";
    }

    return modelMap[modelName] || "kling-v2.6-pro";
  }

  /**
   * Check if Kling service is properly configured
   */
  isConfigured(): boolean {
    return this.useJWT ? (!!this.accessKey && !!this.secretKey) : !!this.apiKey;
  }

  /**
   * Normalize base URL to avoid double version segments.
   */
  private normalizeBaseUrl(url: string): string {
    const trimmed = url.trim().replace(/\/+$/, "");
    if (trimmed.endsWith("/v1") || trimmed.endsWith("/v2")) {
      return trimmed.slice(0, -3);
    }
    return trimmed;
  }
}

// Singleton instance
export const klingService = new KlingService();
