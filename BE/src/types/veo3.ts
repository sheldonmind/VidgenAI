export interface Veo3GenerationRequest {
  model: string;
  prompt: string;
  aspectRatio?: string;
  durationSeconds?: number;
  negativePrompt?: string;
  personGeneration?: "allow_all" | "allow_adult" | "dont_allow";
  numberOfVideos?: number;
}

export interface Veo3ImageToVideoRequest extends Veo3GenerationRequest {
  referenceImages?: {
    image: string; // base64 or URL
    referenceType: "asset" | "style";
  }[];
}

export interface Veo3GenerationResponse {
  name: string; // operation name for polling
  metadata?: {
    "@type": string;
    createTime: string;
    verb: string;
  };
  done?: boolean;
  response?: Veo3CompletedResponse;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export interface Veo3CompletedResponse {
  generateVideoResponse: {
    generatedSamples: Array<{
      video: {
        uri: string;
        mimeType: string;
      };
      thumbnail?: {
        uri: string;
        mimeType: string;
      };
    }>;
  };
}

export interface Veo3StatusResponse {
  name: string;
  done: boolean;
  metadata?: any;
  response?: Veo3CompletedResponse;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}
