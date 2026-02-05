import axios, { AxiosInstance } from "axios";
import {
  ImagenTextToImageRequest,
  ImagenImageToImageRequest,
  ImagenGenerationResponse,
  ImagenStatusResponse
} from "../types/imagen";

export class ImagenService {
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
   * Text-to-Image generation using Google Imagen 4 models
   */
  async generateTextToImage(params: {
    prompt: string;
    aspectRatio: string;
    modelName?: string;
  }): Promise<ImagenGenerationResponse> {
    const model = this.getImagenModelIdentifier(params.modelName);

    const requestBody = {
      instances: [
        {
          prompt: params.prompt
        }
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: params.aspectRatio
      }
    };

    try {
      const response = await this.client.post<ImagenGenerationResponse>(
        `/models/${model}:predict`,
        requestBody
      );

      return response.data;
    } catch (error: any) {
      console.error(`❌ Imagen API Error:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method
      });

      throw new Error(
        `Imagen API error: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Image-to-Image generation using Google Imagen
   */
  async generateImageToImage(params: {
    imageUrl: string;
    prompt: string;
    aspectRatio: string;
    strength?: number;
    modelName?: string;
  }): Promise<ImagenGenerationResponse> {
    const model = this.getImagenModelIdentifier(params.modelName);

    // Fetch and convert image to base64
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
          prompt: params.prompt,
          image: {
            bytesBase64Encoded: base64Image,
            mimeType: mimeType
          }
        }
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: params.aspectRatio,
        editMode: "inpainting-insert",
        strength: params.strength ?? 0.7
      }
    };

    try {
      const response = await this.client.post<ImagenGenerationResponse>(
        `/models/${model}:predict`,
        requestBody
      );

      return response.data;
    } catch (error: any) {
      console.error(`❌ Imagen API Error:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method
      });

      throw new Error(
        `Imagen API error: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Check the status of an image generation operation
   */
  async checkGenerationStatus(operationName: string): Promise<ImagenStatusResponse> {
    try {
      const response = await this.client.get<ImagenStatusResponse>(`/${operationName}`);
      return response.data;
    } catch (error: any) {
      throw new Error(
        `Imagen API error: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Poll for generation completion (with timeout)
   */
  async waitForCompletion(
    operationName: string,
    maxAttempts = 30,
    intervalMs = 5000
  ): Promise<ImagenStatusResponse> {
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
   * Extract image URL from Imagen response
   */
  extractImageUrl(response: ImagenGenerationResponse | ImagenStatusResponse): string | null {
    // Check for direct predictions response (immediate generation)
    if ((response as any).predictions && (response as any).predictions.length > 0) {
      const prediction = (response as any).predictions[0];
      if (prediction.bytesBase64Encoded) {
        // Return as data URI
        const mimeType = prediction.mimeType || "image/png";
        return `data:${mimeType};base64,${prediction.bytesBase64Encoded}`;
      }
    }

    // Check for long-running operation response
    if (response.response?.generateImageResponse?.generatedSamples) {
      const samples = response.response.generateImageResponse.generatedSamples;
      if (samples && samples.length > 0 && samples[0].image?.uri) {
        return samples[0].image.uri;
      }
    }

    return null;
  }

  /**
   * Map model names to Imagen API identifiers
   */
  private getImagenModelIdentifier(modelName?: string): string {
    const modelMap: Record<string, string> = {
      "Imagen 4": "imagen-4.0-generate-001",
      "Imagen 4 Fast": "imagen-4.0-fast-generate-001",
      "Imagen 4 Ultra": "imagen-4.0-ultra-generate-001",
      "Imagen Nano": "imagen-4.0-fast-generate-001", // Use fast model for Nano
      // Legacy support
      "Imagen 3": "imagen-4.0-generate-001",
      "Imagen 3 Fast": "imagen-4.0-fast-generate-001"
    };

    return modelMap[modelName || ""] || "imagen-4.0-generate-001";
  }

  /**
   * Check if Imagen service is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// Singleton instance
export const imagenService = new ImagenService();
