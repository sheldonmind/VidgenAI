/**
 * Interior transformation stages configuration
 * Defines the simplified 2-image + 1-video interior transformation pipeline
 * 
 * NEW WORKFLOW:
 * - User inputs custom prompts for image and video generation
 * - Generate 2 images: Start Frame and End Frame
 * - Generate 1 video with Start Frame → End Frame transition
 * - User can select duration based on selected video model
 */

export interface InteriorStage {
  stageKey: string;
  stageOrder: number;
  stageName: string;
  stagePrompt: string;
  strength: number;
  stageType: 'image' | 'video';
  platform?: string;
}

// Base prompt for camera lock and photorealism (can be customized)
export const BASE_INTERIOR_PROMPT = "Photorealistic interior space, single interior room only, camera completely static, same lens same framing same eye-level throughout, no camera motion, no layout changes, no geometry distortion, photorealism mandatory, no artistic or stylized rendering.";

// Default prompts (used when user doesn't provide custom prompts)
export const DEFAULT_START_FRAME_PROMPT = "Empty interior space, finished walls ceiling and floor, no furniture, no decor, no people, clean architectural realism, neutral daylight, eye-level camera, wide lens suitable for interior architecture.";

export const DEFAULT_END_FRAME_PROMPT = "Fully furnished and decorated interior space, all furniture in place, complete decor elements including rugs cushions wall art and plants, warm cinematic lighting, magazine-quality interior photography, no people.";

export const DEFAULT_VIDEO_PROMPT = "IMAGE-TO-VIDEO animation showing interior transformation. Furniture and decor gradually appear in their final positions. Objects emerge naturally and settle in place. STRICT CONSTRAINTS: NO sliding across floor, NO snapping into place, NO teleportation, NO morphing or stretching, NO deformation, NO humans, NO camera movement. Camera is COMPLETELY STATIC: same lens, same framing, same eye-level. Lighting remains stable and realistic. Photorealistic interior furnishing process.";

export const INTERIOR_STAGES: InteriorStage[] = [
  {
    stageKey: "start-frame",
    stageOrder: 1,
    stageName: "Start Frame",
    stagePrompt: DEFAULT_START_FRAME_PROMPT,
    strength: 0,
    stageType: 'image',
    platform: 'Nano Banana'
  },
  {
    stageKey: "end-frame",
    stageOrder: 2,
    stageName: "End Frame",
    stagePrompt: DEFAULT_END_FRAME_PROMPT,
    strength: 0.35,
    stageType: 'image',
    platform: 'Nano Banana'
  },
  {
    stageKey: "transformation-video",
    stageOrder: 3,
    stageName: "Interior Transformation Video",
    stagePrompt: DEFAULT_VIDEO_PROMPT,
    strength: 0,
    stageType: 'video',
    platform: 'Kling'
  }
];

/**
 * Get an interior stage by its key
 */
export function getInteriorStageByKey(stageKey: string): InteriorStage | null {
  return INTERIOR_STAGES.find(stage => stage.stageKey === stageKey) || null;
}

/**
 * Get an interior stage by its order number
 */
export function getInteriorStageByOrder(order: number): InteriorStage | null {
  return INTERIOR_STAGES.find(stage => stage.stageOrder === order) || null;
}

/**
 * Get all interior stages in order
 */
export function getAllInteriorStages(): InteriorStage[] {
  return [...INTERIOR_STAGES].sort((a, b) => a.stageOrder - b.stageOrder);
}

/**
 * Get only image stages (excluding videos)
 */
export function getImageStages(): InteriorStage[] {
  return INTERIOR_STAGES.filter(stage => stage.stageType === 'image');
}

/**
 * Get only video stages
 */
export function getVideoStages(): InteriorStage[] {
  return INTERIOR_STAGES.filter(stage => stage.stageType === 'video');
}

/**
 * Build the full prompt for a stage by combining base prompt with stage-specific prompt
 * @param stage - The stage configuration
 * @param customPrompt - Optional custom prompt to use instead of stage default
 * @param includeBasePrompt - Whether to include the base prompt (default: true)
 */
export function buildInteriorStagePrompt(
  stage: InteriorStage, 
  customPrompt?: string,
  includeBasePrompt: boolean = true
): string {
  const prompt = customPrompt || stage.stagePrompt;
  
  if (includeBasePrompt) {
    return `${BASE_INTERIOR_PROMPT} ${prompt}`;
  }
  
  return prompt;
}

/**
 * Video transition configuration for image-to-video animations
 * Video uses start frame and end frame with smooth transition
 */
export interface InteriorVideoTransition {
  videoNumber: number;
  fromStageOrder: number;
  toStageOrder: number;
  fromStageKey: string;
  toStageKey: string;
  prompt: string;
  title: string;
  platform: string;
}

/**
 * Generate video transitions for interior transformation pipeline
 * Creates 1 video from start frame to end frame
 */
export function generateInteriorVideoTransitions(
  stageResults: Array<{
    stageKey: string;
    stageOrder: number;
    imageUrl: string;
    success: boolean;
  }>,
  customVideoPrompt?: string
): InteriorVideoTransition[] {
  const transitions: InteriorVideoTransition[] = [];
  
  // Video: Start Frame (stage 1) → End Frame (stage 2)
  const startFrame = stageResults.find(s => s.stageKey === 'start-frame' && s.success);
  const endFrame = stageResults.find(s => s.stageKey === 'end-frame' && s.success);
  
  if (startFrame && endFrame) {
    const videoStage = INTERIOR_STAGES.find(s => s.stageKey === 'transformation-video');
    if (videoStage) {
      transitions.push({
        videoNumber: 1,
        fromStageOrder: startFrame.stageOrder,
        toStageOrder: endFrame.stageOrder,
        fromStageKey: startFrame.stageKey,
        toStageKey: endFrame.stageKey,
        prompt: customVideoPrompt || videoStage.stagePrompt,
        title: videoStage.stageName,
        platform: videoStage.platform || 'Kling'
      });
    }
  }
  
  return transitions;
}

/**
 * Get video transition prompt
 */
export function getInteriorVideoTransitionPrompt(customPrompt?: string): string {
  if (customPrompt) {
    return `${BASE_INTERIOR_PROMPT} ${customPrompt}`;
  }
  
  const stage = INTERIOR_STAGES.find(s => s.stageKey === 'transformation-video');
  return stage ? `${BASE_INTERIOR_PROMPT} ${stage.stagePrompt}` : DEFAULT_VIDEO_PROMPT;
}

/**
 * Get video title for interior transformation
 */
export function getInteriorVideoTitle(): string {
  return "Start Frame → End Frame Transformation";
}

/**
 * Duration options available for each video model
 * This is used by frontend to show appropriate duration selector
 */
export const VIDEO_MODEL_DURATIONS: Record<string, { durations: string[]; default: string }> = {
  "Kling O1": { durations: ["5s", "10s"], default: "5s" },
  "Kling 2.6": { durations: ["5s", "10s"], default: "5s" },
  "Kling 2.5 Turbo": { durations: ["5s", "10s"], default: "5s" },
  "Kling Motion Control": { durations: ["5s", "10s"], default: "5s" },
  "Veo 3": { durations: ["4s", "6s", "8s"], default: "6s" },
  "Veo 3.1": { durations: ["4s", "6s", "8s"], default: "6s" },
  "Veo 3 Fast": { durations: ["4s", "6s", "8s"], default: "4s" }
};

/**
 * Get duration options for a specific video model
 */
export function getDurationOptionsForModel(modelName: string): { durations: string[]; default: string } {
  return VIDEO_MODEL_DURATIONS[modelName] || { durations: ["5s", "10s"], default: "5s" };
}
