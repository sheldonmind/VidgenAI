export interface ImagenTextToImageRequest {
  prompt: string;
  aspectRatio?: string;
  negativePrompt?: string;
  numberOfImages?: number;
  model?: string;
}

export interface ImagenImageToImageRequest {
  prompt: string;
  imageUrl: string;
  aspectRatio?: string;
  strength?: number; // 0-1, how much to transform the image
  negativePrompt?: string;
  model?: string;
}

export interface ImagenGenerationResponse {
  name: string; // operation name for polling
  metadata?: {
    "@type": string;
    createTime: string;
    verb: string;
  };
  done?: boolean;
  response?: ImagenCompletedResponse;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export interface ImagenCompletedResponse {
  generateImageResponse?: {
    generatedSamples: Array<{
      image: {
        uri: string;
        mimeType: string;
      };
    }>;
  };
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
  }>;
}

export interface ImagenStatusResponse {
  name: string;
  done: boolean;
  metadata?: any;
  response?: ImagenCompletedResponse;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}
