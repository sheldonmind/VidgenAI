/**
 * Model capabilities configuration
 * Defines supported options for each video generation model
 */

export interface ModelCapability {
  name: string;
  provider: 'google' | 'kling';
  durations: string[];
  aspectRatios: string[];
  resolutions: string[];
  supportsAudio: boolean;
  defaultDuration: string;
  defaultAspectRatio: string;
  defaultResolution: string;
  supportedFeatures?: string[]; // e.g., ['text-to-video', 'image-to-video', 'video-to-video', 'motion-control']
}

export const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  // Google Veo 3 Models
  "Veo 3": {
    name: "Veo 3",
    provider: "google",
    durations: ["4s", "6s", "8s"],
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["480p", "720p", "1080p"],
    supportsAudio: true,
    defaultDuration: "6s",
    defaultAspectRatio: "16:9",
    defaultResolution: "720p"
  },
  "Veo 3.1": {
    name: "Veo 3.1",
    provider: "google",
    durations: ["4s", "6s", "8s"],
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["480p", "720p", "1080p"],
    supportsAudio: true,
    defaultDuration: "6s",
    defaultAspectRatio: "16:9",
    defaultResolution: "720p"
  },
  "Veo 3 Fast": {
    name: "Veo 3 Fast",
    provider: "google",
    durations: ["4s", "6s", "8s"],
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["480p", "720p"],
    supportsAudio: true,
    defaultDuration: "4s",
    defaultAspectRatio: "16:9",
    defaultResolution: "720p"
  },
  
  // Kling AI Models
  "Kling 2.6": {
    name: "Kling 2.6",
    provider: "kling",
    durations: ["5s", "10s"],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    resolutions: ["480p", "720p", "1080p"],
    supportsAudio: true,
    defaultDuration: "5s",
    defaultAspectRatio: "16:9",
    defaultResolution: "720p",
    supportedFeatures: ["text-to-video", "image-to-video", "video-to-video", "text-to-image", "image-to-image"]
  },
  "Kling 2.5 Turbo": {
    name: "Kling 2.5 Turbo",
    provider: "kling",
    durations: ["5s", "10s"],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    resolutions: ["480p", "720p"],
    supportsAudio: false,
    defaultDuration: "5s",
    defaultAspectRatio: "16:9",
    defaultResolution: "720p",
    supportedFeatures: ["text-to-video", "image-to-video", "video-to-video", "text-to-image", "image-to-image"]
  },
  "Kling Motion Control": {
    name: "Kling Motion Control",
    provider: "kling",
    durations: ["5s", "10s"],
    aspectRatios: ["1:1", "16:9", "9:16"],
    resolutions: ["480p", "720p", "1080p"],
    supportsAudio: false,
    defaultDuration: "5s",
    defaultAspectRatio: "16:9",
    defaultResolution: "720p",
    supportedFeatures: ["motion-control"]
  },
  "Kling O1": {
    name: "Kling O1",
    provider: "kling",
    durations: ["5s", "10s"],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    resolutions: ["480p", "720p", "1080p"],
    supportsAudio: true,
    defaultDuration: "5s",
    defaultAspectRatio: "16:9",
    defaultResolution: "720p",
    supportedFeatures: ["text-to-video", "image-to-video", "video-to-video", "text-to-image", "image-to-image"]
  }
};

/**
 * Get capabilities for a specific model
 */
export function getModelCapabilities(modelName: string): ModelCapability | null {
  return MODEL_CAPABILITIES[modelName] || null;
}

/**
 * Get all model capabilities
 */
export function getAllModelCapabilities(): ModelCapability[] {
  return Object.values(MODEL_CAPABILITIES);
}

/**
 * Validate if a duration is supported by the model
 */
export function isDurationSupported(modelName: string, duration: string): boolean {
  const capability = getModelCapabilities(modelName);
  if (!capability) return false;
  return capability.durations.includes(duration);
}

/**
 * Validate if an aspect ratio is supported by the model
 */
export function isAspectRatioSupported(modelName: string, aspectRatio: string): boolean {
  const capability = getModelCapabilities(modelName);
  if (!capability) return false;
  return capability.aspectRatios.includes(aspectRatio);
}

/**
 * Validate if a resolution is supported by the model
 */
export function isResolutionSupported(modelName: string, resolution: string): boolean {
  const capability = getModelCapabilities(modelName);
  if (!capability) return false;
  return capability.resolutions.includes(resolution);
}

/**
 * Get the nearest supported duration for a model
 */
export function getNearestSupportedDuration(modelName: string, requestedDuration: string): string {
  const capability = getModelCapabilities(modelName);
  if (!capability) return requestedDuration;
  
  const requestedSeconds = parseInt(requestedDuration.replace('s', ''));
  const supportedDurations = capability.durations.map(d => parseInt(d.replace('s', '')));
  
  // Find the nearest supported duration
  const nearest = supportedDurations.reduce((prev, curr) => {
    return Math.abs(curr - requestedSeconds) < Math.abs(prev - requestedSeconds) ? curr : prev;
  });
  
  return `${nearest}s`;
}

/**
 * Check if a model supports a specific feature
 */
export function supportsFeature(modelName: string, feature: string): boolean {
  const capability = getModelCapabilities(modelName);
  if (!capability || !capability.supportedFeatures) return false;
  return capability.supportedFeatures.includes(feature);
}

/**
 * Get all models that support a specific feature
 */
export function getModelsByFeature(feature: string): ModelCapability[] {
  return getAllModelCapabilities().filter(cap => 
    cap.supportedFeatures && cap.supportedFeatures.includes(feature)
  );
}
