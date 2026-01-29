import axios, { AxiosInstance } from "axios";
import {
  Veo3GenerationRequest,
  Veo3GenerationResponse,
  Veo3StatusResponse,
  Veo3ImageToVideoRequest
} from "../types/veo3";

export class Veo3Service {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY || "";
    this.baseUrl = "https://generativelanguage.googleapis.com/v1beta";

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey
      },
      timeout: 60000
    });
  }

  /**
   * Text-to-Video generation using Google Veo 3
   */
  async generateTextToVideo(params: {
    prompt: string;
    duration: string;
    aspectRatio: string;
    resolution: string;
    audioEnabled: boolean;
    modelName?: string;
  }): Promise<Veo3GenerationResponse> {
    // Map duration string to seconds (e.g., "5s" -> 5)
    let durationSeconds = parseInt(params.duration.replace("s", ""));
    
    if (durationSeconds <= 4) {
      durationSeconds = 4;
    } else if (durationSeconds <= 6) {
      durationSeconds = 6;
    } else {
      durationSeconds = 8;
    }

    let aspectRatio = this.validateAspectRatio(params.aspectRatio);

    const model = this.getVeo3ModelIdentifier(params.modelName);

    const requestBody = {
      instances: [
        {
          prompt: params.prompt
        }
      ],
      parameters: {
        sampleCount: 1,
        durationSeconds: durationSeconds,
        aspectRatio: aspectRatio,
        resolution: params.resolution
      }
    };

    try {
      const response = await this.client.post<Veo3GenerationResponse>(
        `/models/${model}:predictLongRunning`,
        requestBody
      );

      return response.data;
    } catch (error: any) {
      throw new Error(
        `Veo 3 API error: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Image-to-Video generation using Google Veo 3
   */
  async generateImageToVideo(params: {
    imageUrl: string;
    prompt?: string;
    duration: string;
    aspectRatio: string;
    audioEnabled: boolean;
    modelName?: string;
  }): Promise<Veo3GenerationResponse> {
    // Map duration string to seconds and validate
    let durationSeconds = parseInt(params.duration.replace("s", ""));
    
    if (durationSeconds <= 4) {
      durationSeconds = 4;
    } else if (durationSeconds <= 6) {
      durationSeconds = 6;
    } else {
      durationSeconds = 8;
    }

    let aspectRatio = this.validateAspectRatio(params.aspectRatio);

    const model = this.getVeo3ModelIdentifier(params.modelName);

    let base64Image: string;
    let mimeType: string;
    try {
      const imageResponse = await axios.get(params.imageUrl, { responseType: "arraybuffer" });
      base64Image = Buffer.from(imageResponse.data).toString("base64");
      mimeType = imageResponse.headers["content-type"] || "image/jpeg";
    } catch (error) {
      throw new Error("Failed to fetch reference image");
    }

    const requestBody = {
      instances: [
        {
          ...(params.prompt && { prompt: params.prompt }),
          image: {
            bytesBase64Encoded: base64Image,
            mimeType: mimeType
          }
        }
      ],
      parameters: {
        sampleCount: 1,
        durationSeconds: durationSeconds,
        aspectRatio: aspectRatio
      }
    };

    try {
      const response = await this.client.post<Veo3GenerationResponse>(
        `/models/${model}:predictLongRunning`,
        requestBody
      );

      return response.data;
    } catch (error: any) {
      throw new Error(
        `Veo 3 API error: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Check the status of a video generation operation
   * For Veo 3, the initial response might contain the video directly,
   * or we need to poll an operation if it's long-running
   */
  async checkGenerationStatus(operationName: string): Promise<Veo3StatusResponse> {
    try {
      const response = await this.client.get<Veo3StatusResponse>(`/${operationName}`);
      return response.data;
    } catch (error: any) {
      throw new Error(
        `Veo 3 API error: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Poll for generation completion (with timeout)
   */
  async waitForCompletion(
    operationName: string,
    maxAttempts = 60,
    intervalMs = 10000
  ): Promise<Veo3StatusResponse> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.checkGenerationStatus(operationName);

      if (status.done) {
        if (status.error) {
          throw new Error(`Generation failed: ${status.error.message}`);
        }
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      attempts++;
    }

    throw new Error(`Generation timed out after ${maxAttempts} attempts`);
  }

  /**
   * Extract video URL from Veo 3 response
   */
  extractVideoUrl(response: Veo3GenerationResponse | Veo3StatusResponse): string | null {
    // Check if response is completed
    if (!response.response?.generateVideoResponse?.generatedSamples) {
      // Try to extract from inline response (immediate generation)
      const candidates = (response as any).candidates;
      if (candidates && candidates.length > 0) {
        const content = candidates[0].content;
        if (content?.parts && content.parts.length > 0) {
          const videoPart = content.parts.find((part: any) => part.fileData?.mimeType?.startsWith("video"));
          if (videoPart?.fileData?.fileUri) {
            return videoPart.fileData.fileUri;
          }
        }
      }
      return null;
    }

    const samples = response.response.generateVideoResponse.generatedSamples;
    if (samples && samples.length > 0 && samples[0].video?.uri) {
      return samples[0].video.uri;
    }

    return null;
  }

  /**
   * Extract thumbnail URL from Veo 3 response
   */
  extractThumbnailUrl(response: Veo3GenerationResponse | Veo3StatusResponse): string | null {
    if (!response.response?.generateVideoResponse?.generatedSamples) {
      return null;
    }

    const samples = response.response.generateVideoResponse.generatedSamples;
    if (samples && samples.length > 0 && samples[0].thumbnail?.uri) {
      return samples[0].thumbnail.uri;
    }

    return null;
  }

  /**
   * Download video from Google's temporary URI and return the content
   */
  async downloadVideo(videoUri: string): Promise<Buffer> {
    try {
      const response = await axios.get(videoUri, {
        responseType: "arraybuffer",
        headers: {
          "x-goog-api-key": this.apiKey
        }
      });

      return Buffer.from(response.data);
    } catch (error) {
      throw new Error("Failed to download generated video");
    }
  }

  /**
   * Validate and map aspect ratio to supported values
   * Veo 3 only supports 16:9 (landscape) and 9:16 (portrait)
   */
  private validateAspectRatio(aspectRatio: string): string {
    const supportedRatios = ["16:9", "9:16"];
    
    // If the aspect ratio is already supported, return it
    if (supportedRatios.includes(aspectRatio)) {
      return aspectRatio;
    }

    // Map common unsupported ratios to closest supported ratio
    const ratioMap: Record<string, string> = {
      "1:1": "16:9",    // Square -> Landscape
      "4:3": "16:9",    // Standard -> Landscape
      "3:2": "16:9",    // Photo -> Landscape
      "21:9": "16:9",   // Ultra-wide -> Landscape
      "2:3": "9:16",    // Portrait photo -> Portrait
      "9:21": "9:16"    // Ultra-tall -> Portrait
    };

    const mappedRatio = ratioMap[aspectRatio] || "16:9";

    return mappedRatio;
  }

  /**
   * Map model names to Veo 3 API identifiers
   */
  private getVeo3ModelIdentifier(modelName?: string): string {
    const modelMap: Record<string, string> = {
      "Veo 3": "veo-3.0-generate-001",
      "Veo 3.0": "veo-3.0-generate-001",
      "Veo 3.1": "veo-3.1-generate-preview",
      "Veo 3 Fast": "veo-3.0-fast-generate-001"
    };

    return modelMap[modelName || ""] || "veo-3.0-generate-001";
  }

  /**
   * Check if Veo 3 service is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// Singleton instance
export const veo3Service = new Veo3Service();
