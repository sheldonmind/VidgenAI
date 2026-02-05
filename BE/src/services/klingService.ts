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
  private callbackUrl: string | undefined;

  constructor() {
    this.accessKey = process.env.KLING_ACCESS_KEY || "";
    this.secretKey = process.env.KLING_SECRET_KEY || "";
    this.apiKey = process.env.KLING_API_KEY || "";
    
    const rawBaseUrl =
      process.env.KLING_API_BASE_URL ||
      process.env.KLING_BASE_URL ||
      "https://api.klingai.com";
    this.baseUrl = this.normalizeBaseUrl(rawBaseUrl);
    
    // OPTIMIZED: Support webhook callback for instant notifications
    // Set KLING_CALLBACK_URL env var to enable webhook instead of polling
    // Example: https://your-domain.com/api/v1/webhooks/kling
    this.callbackUrl = process.env.KLING_CALLBACK_URL;
    if (this.callbackUrl) {
      console.log(`✅ Kling webhook enabled: ${this.callbackUrl}`);
    }

    this.useJWT = !!(this.accessKey && this.secretKey);

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Content-Type": "application/json"
      },
      timeout: 120000 // Increased to 120s for large requests with base64 images
    });
  }
  
  /**
   * Get the configured callback URL for webhooks
   */
  getCallbackUrl(): string | undefined {
    return this.callbackUrl;
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

    // OPTIMIZED: Add callback URL for webhook notifications (instant results)
    if (this.callbackUrl) {
      request.callback_url = this.callbackUrl;
    }

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
   * Supports optional end frame (tail frame) for video transitions
   * 
   * OPTIMIZED: Uses image_url directly when available (public URLs)
   * instead of converting to base64, saving significant time
   */
  async generateImageToVideo(params: {
    imageUrl: string;
    endImageUrl?: string;  // Optional tail frame for transitions
    prompt?: string;
    duration: string;
    aspectRatio: string;
    audioEnabled: boolean;
    modelName?: string;
  }): Promise<KlingGenerationResponse> {
    // FIX: Validate imageUrl is provided and not empty
    if (!params.imageUrl || params.imageUrl === null || params.imageUrl === undefined || (typeof params.imageUrl === 'string' && params.imageUrl.trim() === '')) {
      console.error(`❌ Invalid imageUrl provided:`, { 
        imageUrl: params.imageUrl, 
        type: typeof params.imageUrl,
        isNull: params.imageUrl === null,
        isUndefined: params.imageUrl === undefined
      });
      throw new Error("Image URL is required for image-to-video generation. Please provide a valid image URL.");
    }
    
    // Trim and validate imageUrl
    const trimmedImageUrl = params.imageUrl.trim();
    if (trimmedImageUrl === '') {
      throw new Error("Image URL cannot be empty. Please provide a valid image URL.");
    }
    
    const modelName = this.getKlingModelIdentifier(params.modelName);
    const isKlingO1 = modelName === "kling-video-o1";

    // OPTIMIZED: Check if URL is publicly accessible (http/https)
    // If so, use image_url field directly (much faster than base64 conversion)
    const isPublicUrl = trimmedImageUrl.startsWith('http://') || trimmedImageUrl.startsWith('https://');
    
    let imageData: string | undefined;
    let imageUrl: string | undefined;
    let tailImageData: string | undefined;
    let tailImageUrl: string | undefined;
    
    // OPTIMIZED: Try to use URLs for both images when possible to avoid large base64 payloads
    // This significantly reduces request size and prevents 503 errors
    const isTailPublicUrl = params.endImageUrl && (params.endImageUrl.startsWith('http://') || params.endImageUrl.startsWith('https://'));
    
    // FIX: Kling O1 requires base64 image data (image field) instead of image_url
    // This is different from other models which can use image_url for public URLs
    // Kling O1 must always use base64, regardless of whether URL is public or not
    if (isKlingO1) {
      // Kling O1 requires base64 even for public URLs
      console.log(`📦 Converting image to base64 (Kling O1 requirement): ${trimmedImageUrl.substring(0, 50)}...`);
      try {
        const base64DataUri = await imageUrlToBase64(trimmedImageUrl);
        imageData = base64DataUri.replace(/^data:image\/[a-z]+;base64,/, '');
        if (!imageData || imageData.length === 0) {
          throw new Error("Base64 conversion returned empty data");
        }
        console.log(`✅ Image converted to base64 for Kling O1 (${imageData.length} chars)`);
      } catch (error: any) {
        console.error(`❌ Failed to convert image to base64 for Kling O1:`, error.message);
        throw new Error(`Failed to convert image to base64 for Kling O1: ${error.message}`);
      }
      
      // Handle tail image for Kling O1 - always convert to base64
      if (params.endImageUrl) {
        console.log(`📦 Converting tail image to base64 (Kling O1 requirement): ${params.endImageUrl.substring(0, 50)}...`);
        try {
          const base64DataUri = await imageUrlToBase64(params.endImageUrl);
          tailImageData = base64DataUri.replace(/^data:image\/[a-z]+;base64,/, '');
          if (!tailImageData || tailImageData.length === 0) {
            throw new Error("Base64 conversion returned empty data");
          }
          console.log(`✅ Tail image converted to base64 for Kling O1 (${tailImageData.length} chars)`);
        } catch (error: any) {
          console.error(`❌ Failed to convert tail image to base64 for Kling O1:`, error.message);
          throw new Error(`Failed to convert tail image to base64 for Kling O1: ${error.message}`);
        }
      }
    } else if (params.endImageUrl && isPublicUrl) {
      // FIX: When image_tail_url is provided, Kling API requires main image as base64 (image field)
      // instead of image_url. This is a requirement when using image_tail_url.
      // When tail image is provided, convert main image to base64 (API requirement)
      console.log(`📦 Converting main image to base64 (required when using image_tail_url): ${trimmedImageUrl.substring(0, 50)}...`);
      try {
        const base64DataUri = await imageUrlToBase64(trimmedImageUrl);
        imageData = base64DataUri.replace(/^data:image\/[a-z]+;base64,/, '');
        if (!imageData || imageData.length === 0) {
          throw new Error("Base64 conversion returned empty data");
        }
        console.log(`✅ Main image converted to base64 (${imageData.length} chars)`);
      } catch (error: any) {
        console.error(`❌ Failed to convert main image to base64:`, error.message);
        throw new Error(`Failed to convert main image to base64: ${error.message}`);
      }
      
      // Use URL for tail image when it's a public URL
      if (isTailPublicUrl) {
        tailImageUrl = params.endImageUrl.trim();
        console.log(`✅ Using direct URL for tail image: ${tailImageUrl.substring(0, 50)}...`);
      } else {
        // Tail image is not a public URL, convert to base64
        console.log(`📦 Converting tail image to base64: ${params.endImageUrl.substring(0, 50)}...`);
        try {
          const base64DataUri = await imageUrlToBase64(params.endImageUrl);
          tailImageData = base64DataUri.replace(/^data:image\/[a-z]+;base64,/, '');
          if (!tailImageData || tailImageData.length === 0) {
            throw new Error("Base64 conversion returned empty data");
          }
          console.log(`✅ Tail image converted to base64 (${tailImageData.length} chars)`);
        } catch (error: any) {
          console.error(`❌ Failed to convert tail image to base64:`, error.message);
          throw new Error(`Failed to convert tail image to base64: ${error.message}`);
        }
      }
    } else if (isPublicUrl && !params.endImageUrl) {
      // OPTIMIZED: Use URLs when no tail image is provided (much smaller request size)
      // This prevents 503 errors from oversized requests
      imageUrl = trimmedImageUrl;
      console.log(`✅ Using direct URL for main image: ${imageUrl.substring(0, 50)}...`);
    } else {
      // Fallback: Convert to base64 for local files or when main image is not public
      // This is slower but necessary when URLs are not available
      console.log(`📦 Converting main image to base64 (slower method): ${trimmedImageUrl.substring(0, 50)}...`);
      try {
        const base64DataUri = await imageUrlToBase64(trimmedImageUrl);
        imageData = base64DataUri.replace(/^data:image\/[a-z]+;base64,/, '');
        if (!imageData || imageData.length === 0) {
          throw new Error("Base64 conversion returned empty data");
        }
        console.log(`✅ Main image converted to base64 (${imageData.length} chars) - this may take longer`);
      } catch (error: any) {
        console.error(`❌ Failed to convert image to base64:`, error.message);
        throw new Error(`Failed to convert image to base64: ${error.message}`);
      }
      
      if (params.endImageUrl) {
        if (isTailPublicUrl) {
          // Tail image is public URL, use it directly (even if main image is base64)
          tailImageUrl = params.endImageUrl.trim();
          console.log(`✅ Using direct URL for tail image: ${tailImageUrl.substring(0, 50)}...`);
        } else {
          // Convert tail image to base64
          console.log(`📦 Converting tail image to base64 (slower method): ${params.endImageUrl.substring(0, 50)}...`);
          try {
            const base64DataUri = await imageUrlToBase64(params.endImageUrl);
            tailImageData = base64DataUri.replace(/^data:image\/[a-z]+;base64,/, '');
            if (!tailImageData || tailImageData.length === 0) {
              throw new Error("Base64 conversion returned empty data");
            }
            console.log(`✅ Tail image converted to base64 (${tailImageData.length} chars) - this may take longer`);
          } catch (error: any) {
            console.error(`❌ Failed to convert tail image to base64:`, error.message);
            throw new Error(`Failed to convert tail image to base64: ${error.message}`);
          }
        }
      }
    }

    // Map duration string to number
    // IMPORTANT: When image_tail is provided, duration MUST be 5 (Kling API requirement)
    let durationSeconds = parseInt(params.duration.replace("s", ""));
    
    if (tailImageData) {
      // When using tail frame, duration must be 5 seconds
      durationSeconds = 5;
    } else {
      // When no tail frame, use normal duration mapping
      if (durationSeconds < 7.5) {
        durationSeconds = 5;
      } else {
        durationSeconds = 10;
      }
    }

    const request: any = {
      model: modelName,
      prompt: params.prompt,
      duration: durationSeconds,  // Send as number, not string
      aspect_ratio: params.aspectRatio,
      negative_prompt: "blurry, low quality, distorted",
    };

    // OPTIMIZED: Add callback URL for webhook notifications (instant results)
    if (this.callbackUrl) {
      request.callback_url = this.callbackUrl;
    }

    // FIX: Kling O1 requires base64 image data (image field), not image_url
    // For other models, use URL when available (faster), fallback to base64
    if (isKlingO1) {
      // Kling O1 must use base64 image field
      if (imageData && imageData.length > 0) {
        request.image = imageData;
        console.log(`📤 Sending base64 image data to Kling O1 API (${imageData.length} chars)`);
      } else {
        console.error(`❌ Kling O1 requires base64 image data, but conversion failed: imageData length=${imageData?.length || 0}`);
        throw new Error("Kling O1 requires base64 image data. Failed to convert image to base64.");
      }
    } else if (imageUrl && imageUrl.trim() !== '') {
      // Other models can use image_url for public URLs (faster)
      request.image_url = imageUrl.trim();
      console.log(`📤 Sending image_url to Kling API: ${imageUrl.substring(0, 50)}...`);
    } else if (imageData && imageData.length > 0) {
      // Fallback to base64 for other models
      request.image = imageData;
      console.log(`📤 Sending base64 image data to Kling API (${imageData.length} chars)`);
    } else {
      // CRITICAL: Ensure image is always provided
      console.error(`❌ Image processing failed: imageUrl="${imageUrl}", imageData length=${imageData?.length || 0}`);
      throw new Error("Failed to process image: neither image_url nor image data could be generated. Please check that the image URL is valid and accessible.");
    }

    // Add tail frame if provided (URL or base64)
    // FIX: Kling O1 requires base64 for tail image as well
    if (isKlingO1 && tailImageData && tailImageData.length > 0) {
      request.image_tail = tailImageData;  // Kling O1 uses base64
      console.log(`📤 Sending base64 image_tail data to Kling O1 API (${tailImageData.length} chars)`);
    } else if (tailImageUrl && tailImageUrl.trim() !== '') {
      request.image_tail_url = tailImageUrl.trim();  // Use URL for tail frame (other models)
      console.log(`📤 Sending image_tail_url to Kling API: ${tailImageUrl.substring(0, 50)}...`);
    } else if (tailImageData && tailImageData.length > 0) {
      request.image_tail = tailImageData;  // Use base64 for tail frame (other models)
      console.log(`📤 Sending base64 image_tail data to Kling API (${tailImageData.length} chars)`);
    }

    // Only add cfg_scale for v1.x models (v2.x doesn't support it)
    if (modelName.includes("v1")) {
      request.cfg_scale = 0.5;
    }

    // Only add sound for v2.6+ models
    if ((modelName === "kling-v2.6-pro" || modelName === "kling-v2.6-std") && params.audioEnabled) {
      request.sound = "on";
    }

    // Debug: Log request structure (without sensitive data)
    const requestDebug = { ...request };
    if (requestDebug.image) {
      requestDebug.image = `[base64 data: ${requestDebug.image.length} chars]`;
    }
    if (requestDebug.image_tail) {
      requestDebug.image_tail = `[base64 data: ${requestDebug.image_tail.length} chars]`;
    }
    if (requestDebug.image_tail_url) {
      requestDebug.image_tail_url = `[URL: ${requestDebug.image_tail_url.substring(0, 50)}...]`;
    }
    console.log(`🚀 Sending image2video request to Kling API:`, JSON.stringify(requestDebug, null, 2));

    // Retry logic for 503 errors (Service Unavailable) - often caused by oversized requests
    const MAX_RETRIES = 3;
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.post<KlingGenerationResponse>(
          "/v1/videos/image2video",
          request,
          { 
            headers: this.getAuthHeaders(),
            timeout: 120000 // 120s timeout for large requests
          }
        );

        return response.data;
      } catch (error: any) {
        lastError = error;
        
        // Log detailed error information
        console.error(`❌ Kling API Error (attempt ${attempt}/${MAX_RETRIES}):`, {
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
        
        // Retry on 503 errors (Service Unavailable) - often temporary
        if (error.response?.status === 503 && attempt < MAX_RETRIES) {
          const waitTime = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
          console.log(`⏳ Retrying after ${waitTime}ms due to 503 error...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // Don't retry on other errors or if max retries reached
        break;
      }
    }
    
    // If we get here, all retries failed
    const errorMessage = lastError?.response?.data?.message || 
                        lastError?.response?.data?.error || 
                        lastError?.message || 
                        "Unknown error";
    const errorCode = lastError?.response?.data?.code || 
                     lastError?.response?.data?.error_code || 
                     "UNKNOWN_ERROR";
    
    throw new Error(
      `Kling API error (${lastError?.response?.status || 'N/A'}): ${errorCode} - ${errorMessage}`
    );
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

    // OPTIMIZED: Add callback URL for webhook notifications (instant results)
    if (this.callbackUrl) {
      request.callback_url = this.callbackUrl;
    }

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

    if (!params.videoUrl) {
      throw new Error("Motion Control requires a video URL");
    }
    if (!params.characterImageUrl) {
      throw new Error("Motion Control requires a character image URL");
    }

    const characterOrientation = params.characterOrientation || "video";

    const request: any = {
      model_name: modelName,
      video_url: params.videoUrl,
      image_url: params.characterImageUrl,
      character_orientation: characterOrientation,
      prompt: params.prompt,
      mode: params.resolution === "1080p" ? "pro" : "std"
    };

    // OPTIMIZED: Add callback URL for webhook notifications (instant results)
    if (this.callbackUrl) {
      request.callback_url = this.callbackUrl;
    }

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

    if (isKlingO1) {
      const request: any = {
        model_name: modelName,
        prompt: params.prompt,
        aspect_ratio: params.aspectRatio === "auto" ? "auto" : params.aspectRatio,
        resolution: "1k",
        n: 1
      };

      // OPTIMIZED: Add callback URL for webhook notifications (instant results)
      if (this.callbackUrl) {
        request.callback_url = this.callbackUrl;
      }

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

    // All text-to-image models should use omni-image endpoint
    const request: any = {
      model_name: modelName,
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio === "auto" ? "auto" : params.aspectRatio,
      resolution: "1k",
      n: 1,
      negative_prompt: "blurry, low quality, distorted, ugly, bad anatomy"
    };

    // OPTIMIZED: Add callback URL for webhook notifications (instant results)
    if (this.callbackUrl) {
      request.callback_url = this.callbackUrl;
    }

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

  /**
   * Image-to-Image generation using Kling AI
   * 
   * OPTIMIZED: Uses image_url directly when available (public URLs)
   * instead of converting to base64, saving significant time
   */
  async generateImageToImage(params: {
    imageUrl: string;
    prompt?: string;
    aspectRatio: string;
    strength?: number;
    modelName?: string;
  }): Promise<KlingGenerationResponse> {
    const modelName = this.getKlingModelIdentifier(params.modelName, "image-to-image");
    const isKlingO1 = modelName === "kling-image-o1";

    // OPTIMIZED: Check if URL is publicly accessible
    const isPublicUrl = params.imageUrl.startsWith('http://') || params.imageUrl.startsWith('https://');
    
    let imageData: string | undefined;
    let imageUrl: string | undefined;
    
    if (isPublicUrl) {
      // Use URL directly - this is MUCH faster than base64 conversion
      imageUrl = params.imageUrl;
      console.log(`✅ Using direct URL for image-to-image (faster)`);
    } else {
      // Fallback to base64 for local files
      try {
        const base64DataUri = await imageUrlToBase64(params.imageUrl);
        imageData = base64DataUri.replace(/^data:image\/[a-z]+;base64,/, '');
      } catch (error: any) {
        console.error(`❌ Failed to convert image to base64:`, error.message);
        throw new Error(`Failed to convert image to base64: ${error.message}`);
      }
    }

    const request: any = {
      model_name: modelName,
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio === "auto" ? "auto" : params.aspectRatio,
      resolution: "1k",
      n: 1,
      strength: params.strength ?? 0.7
    };

    // OPTIMIZED: Add callback URL for webhook notifications (instant results)
    if (this.callbackUrl) {
      request.callback_url = this.callbackUrl;
    }

    // OPTIMIZED: Use URL directly when available
    if (imageUrl) {
      request.image_url = imageUrl;
    } else if (imageData) {
      request.image = imageData;
    }

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

  async checkGenerationStatus(
    generationId: string,
    taskType: "text2video" | "image2video" | "video2video" | "motion-control" | "text2image" | "image2image" = "text2video",
    modelName?: string
  ): Promise<KlingStatusResponse> {
    try {
      const isImageTask = taskType === "text2image" || taskType === "image2image";
      const isKlingO1Image = isImageTask && modelName === "Kling O1";
      
      let endpoint: string;
      if (isKlingO1Image) {
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

  private getKlingModelIdentifier(
    modelName?: string,
    type: "text-to-video" | "motion" | "video-to-video" | "text-to-image" | "image-to-image" = "text-to-video"
  ): string {
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

    if (type === "text-to-image" || type === "image-to-image") {
      if (modelName === "Kling O1") {
        return "kling-image-o1";
      }
      return modelMap[modelName || ""] || "kling-v2.6-pro";
    }

    if (type === "video-to-video" && modelName === "Kling O1") {
      return "kling-video-o1";
    }

    return modelMap[modelName] || "kling-v2.6-pro";
  }

  isConfigured(): boolean {
    return this.useJWT ? (!!this.accessKey && !!this.secretKey) : !!this.apiKey;
  }

  private normalizeBaseUrl(url: string): string {
    const trimmed = url.trim().replace(/\/+$/, "");
    if (trimmed.endsWith("/v1") || trimmed.endsWith("/v2")) {
      return trimmed.slice(0, -3);
    }
    return trimmed;
  }
}

export const klingService = new KlingService();
