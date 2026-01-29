export interface KlingGenerationRequest {
  model_name: string;
  prompt: string;
  aspect_ratio?: string;
  duration?: string;
  negative_prompt?: string;
  cfg_scale?: number;
  sound?: "on" | "off";
  mode?: "std" | "pro";
}

export interface KlingGenerationResponse {
  code: number;
  message: string;
  request_id: string;
  data: {
    task_id: string;
    task_status: "submitted" | "processing" | "succeed" | "failed";
    task_info?: {
      external_task_id?: string;
    };
    created_at: number;
    updated_at: number;
  };
}

export interface KlingStatusResponse {
  code: number;
  message: string;
  request_id: string;
  data: {
    task_id: string;
    task_status: "submitted" | "processing" | "succeed" | "failed";
    task_status_msg?: string;
    task_info?: {
      external_task_id?: string;
    };
    created_at: number;
    updated_at: number;
    task_result?: {
      videos?: Array<{
        id: string;
        url: string;
        duration: string;
        cover_url?: string;  // Thumbnail/preview image URL
      }>;
      images?: Array<{
        id: string;
        url: string;
      }>;
    };
  };
}

export interface KlingImageToVideoRequest {
  model_name: string;
  prompt?: string;
  image_url: string;
  duration?: string;
  aspect_ratio?: string;
  negative_prompt?: string;
  cfg_scale?: number;
  sound?: "on" | "off";
  mode?: "std" | "pro";
}

export interface KlingMotionControlRequest {
  model_name: string;
  video_url: string;
  character_image_url: string;
  prompt?: string;
  duration?: string;
  quality?: string;
}

export interface KlingVideoToVideoRequest {
  model_name: string;
  video_url?: string;
  video?: string; // base64 video data
  prompt?: string;
  duration?: string;
  aspect_ratio?: string;
  negative_prompt?: string;
  cfg_scale?: number;
  sound?: "on" | "off";
  mode?: "std" | "pro";
}

export interface KlingTextToImageRequest {
  model: string;
  prompt: string;
  aspect_ratio?: string;
  negative_prompt?: string;
  cfg_scale?: number;
}

export interface KlingImageToImageRequest {
  model: string;
  image: string; // base64 image data
  prompt?: string;
  aspect_ratio?: string;
  negative_prompt?: string;
  cfg_scale?: number;
  strength?: number; // Control how much the original image is preserved (0-1)
}
