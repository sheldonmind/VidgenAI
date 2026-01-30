import axios, { AxiosInstance } from "axios";

export interface GeminiImageRequest {
  prompt: string;
  aspectRatio?: string;
  modelName?: string;
  inputImageUrl?: string;
}

export interface GeminiImageResponse {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
  }>;
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          data: string;
          mimeType: string;
        };
      }>;
    };
  }>;
}

export class GeminiImageService {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY || "";
    this.baseUrl = "https://generativelanguage.googleapis.com/v1beta";

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "Content-Type": "application/json"
      },
      timeout: 120000 // Gemini image generation can take longer
    });
  }

  /**
   * Text-to-Image generation using Gemini (Nano Banana models)
   */
  async generateTextToImage(params: {
    prompt: string;
    aspectRatio?: string;
    modelName?: string;
  }): Promise<GeminiImageResponse> {
    const model = this.getGeminiModelIdentifier(params.modelName);

    const requestBody = {
      contents: [{
        parts: [{
          text: params.prompt
        }]
      }],
      generationConfig: {
        temperature: 1.0,
        topK: 40,
        topP: 0.95
      }
    };

    try {
      const response = await this.client.post<GeminiImageResponse>(
        `/models/${model}:generateContent?key=${this.apiKey}`,
        requestBody
      );

      return response.data;
    } catch (error: any) {
      console.error(`❌ Gemini API Error:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method
      });

      throw new Error(
        `Gemini API error: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Image-to-Image generation using Gemini
   */
  async generateImageToImage(params: {
    imageUrl: string;
    prompt: string;
    aspectRatio?: string;
    modelName?: string;
  }): Promise<GeminiImageResponse> {
    const model = this.getGeminiModelIdentifier(params.modelName);

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
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image
            }
          },
          {
            text: params.prompt
          }
        ]
      }],
      generationConfig: {
        temperature: 1.0,
        topK: 40,
        topP: 0.95
      }
    };

    try {
      const response = await this.client.post<GeminiImageResponse>(
        `/models/${model}:generateContent?key=${this.apiKey}`,
        requestBody
      );

      return response.data;
    } catch (error: any) {
      console.error(`❌ Gemini API Error:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method
      });

      throw new Error(
        `Gemini API error: ${error.response?.data?.error?.message || error.message}`
      );
    }
  }

  /**
   * Extract image URL from Gemini response
   */
  extractImageUrl(response: GeminiImageResponse): string | null {
    // Check for candidates format (new Gemini API)
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content?.parts && candidate.content.parts.length > 0) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            const mimeType = part.inlineData.mimeType || "image/png";
            return `data:${mimeType};base64,${part.inlineData.data}`;
          }
        }
      }
    }

    // Check for predictions format (legacy)
    if (response.predictions && response.predictions.length > 0) {
      const prediction = response.predictions[0];
      if (prediction.bytesBase64Encoded) {
        const mimeType = prediction.mimeType || "image/png";
        return `data:${mimeType};base64,${prediction.bytesBase64Encoded}`;
      }
    }

    return null;
  }

  /**
   * Map model names to Gemini API identifiers
   */
  private getGeminiModelIdentifier(modelName?: string): string {
    const modelMap: Record<string, string> = {
      "Nano Banana": "gemini-2.5-flash-image",
      "Nano Banana Pro": "gemini-3-pro-image-preview"
    };

    return modelMap[modelName || ""] || "gemini-2.5-flash-image";
  }

  /**
   * Check if Gemini service is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// Singleton instance
export const geminiImageService = new GeminiImageService();
