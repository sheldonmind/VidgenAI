/**
 * Construction stages configuration
 * Defines the 8 construction stages for automated reverse construction visualization
 * Generates images going backwards in time from completed house to bare land
 */

export interface ConstructionStage {
  stageKey: string;
  stageOrder: number;
  stageName: string;
  stagePrompt: string;
  strength: number;
}

export const BASE_PROMPT = "Exact same house from reference image, minimalist modern design with rice field setting, identical architecture, size, proportions, identical camera angle, lens, perspective, identical location, background, horizon, NO redesign, NO style change, NO creativity, construction realism, civil-engineering accurate, use previous image output as next input";
export const CONSTRUCTION_STAGES: ConstructionStage[] = [
  {
    stageKey: "completed-house",
    stageOrder: 1,
    stageName: "Landscaping & Exterior Walkways (Completed House Reference)",
    stagePrompt: "PASS THROUGH — use the uploaded reference image of the completed minimalist house. The final stage shows the elevated wooden walkway that leads through the rice field to the house, decorative greenery planted around the base of the deck, outdoor furniture and lighting in place.",
    strength: 0
  },
  {
    stageKey: "final-finishing-accents",
    stageOrder: 2,
    stageName: "Final Finishing & Accents",
    stagePrompt: "create an image from the exact same camera angle and perspective showing the house before landscaping was added. The distinct look is achieved here: matte white painted exterior walls, vertical wood slats installed on the gable (triangular roof section), exterior wall lanterns mounted. The large black-framed glass sliding doors and windows are in place, completed wooden deck visible. NO wooden walkway through rice field, NO outdoor furniture, NO decorative plants around the deck. The house sits on bare ground with the rice field visible in the background. It should look like a realistic construction site just before final landscaping stage.",
    strength: 0.3
  },
  {
    stageKey: "fenestration-decking",
    stageOrder: 3,
    stageName: "Fenestration (Doors & Windows) & Decking",
    stagePrompt: "create an image from the exact same camera angle and perspective showing the house with structure enclosed. The large black-framed glass sliding doors and windows are freshly installed. The wooden planks are laid over the sub-frame creating the expansive front porch/deck. The exterior walls show smooth cement plaster (rendering) but NOT yet painted (showing grey cement color). NO vertical wood slats on gable, NO wall lanterns, NO landscaping, NO exterior paint. The dark roof tiles or metal sheets are complete with under-eave wooden panels fitted. It should look like a realistic construction site during fenestration and decking installation.",
    strength: 0.35
  },
  {
    stageKey: "wall-construction-rendering",
    stageOrder: 4,
    stageName: "Wall Construction & Rendering",
    stagePrompt: "create an image from the exact same camera angle and perspective showing the wall construction phase. The masonry blocks or bricks for the walls are laid and erected. The walls are coated with smooth cement plaster (rendering) providing the flat, clean surface required for minimalist finish. The roof with dark tiles or corrugated metal sheets is complete. Under-eave wooden panels are fitted. NO doors or windows installed yet (showing open frames), NO deck planks (only wooden sub-frame structure visible if any), NO exterior paint or finishes. It should look like a realistic construction site during wall rendering phase.",
    strength: 0.35
  },
  {
    stageKey: "roofing-eave-paneling",
    stageOrder: 5,
    stageName: "Roofing & Eave Paneling",
    stagePrompt: "create an image from the exact same camera angle and perspective showing the roofing phase. The roof trusses are covered with dark tiles or high-grade corrugated metal sheets. The under-eave wooden panels are fitted to provide the warm contrast seen against the black roof and white walls. The walls show completed masonry block structure but NO cement plaster rendering yet (showing raw block or brick texture). NO doors, NO windows, NO deck structure. The asymmetrical Saltbox-inspired roofline must match the reference house exactly. It should look like a realistic construction site during roofing installation.",
    strength: 0.35
  },
  {
    stageKey: "structural-framing",
    stageOrder: 6,
    stageName: "Structural Framing",
    stagePrompt: "create an image from the exact same camera angle and perspective showing the structural framing phase. The skeleton of the house is erected, consisting of reinforced concrete pillars (columns) and beams. The roof structure creating the asymmetrical Saltbox-inspired roofline is visible but NO roof covering materials yet (no tiles or metal sheets). The structure sits on the elevated concrete platform. NO walls, NO roof covering, NO finishes, only the structural frame with beams and columns. It should look like a realistic construction site during structural framing phase in a rice field (paddy) setting.",
    strength: 0.4
  },
  {
    stageKey: "foundation-site-preparation",
    stageOrder: 7,
    stageName: "Foundation & Site Preparation",
    stagePrompt: "create an image from the exact same camera angle and perspective showing the foundation and site preparation phase. This is the very first step: the build site is elevated. The house is built on a stilt or pier foundation given it is in a rice field (paddy). Piles are driven into the ground and an elevated concrete platform is poured to keep the living space dry and protected from seasonal flooding. NO vertical structural frame yet, NO columns or beams erected, only the foundation piles and elevated concrete platform/slab visible. The rice field surroundings are visible. It should look like a realistic construction site at the foundation stage.",
    strength: 0.4
  },
  {
    stageKey: "bare-land",
    stageOrder: 8,
    stageName: "Bare Land (Empty Plot)",
    stagePrompt: "create an image from the exact same camera angle and perspective showing completely bare land before any construction begins. The scene shows an empty plot of land in a rice field (paddy) setting. NO foundation, NO piles, NO concrete platform, NO construction materials, NO equipment. Just natural untouched land with rice fields, the horizon, mountains in the background if visible in original image. The land is flat and empty, ready for future construction. It should look like pristine agricultural land before any site work begins.",
    strength: 0.45
  }
];

/**
 * Get a construction stage by its key
 */
export function getStageByKey(stageKey: string): ConstructionStage | null {
  return CONSTRUCTION_STAGES.find(stage => stage.stageKey === stageKey) || null;
}

/**
 * Get a construction stage by its order number
 */
export function getStageByOrder(order: number): ConstructionStage | null {
  return CONSTRUCTION_STAGES.find(stage => stage.stageOrder === order) || null;
}

/**
 * Get all construction stages in order
 */
export function getAllStages(): ConstructionStage[] {
  return [...CONSTRUCTION_STAGES].sort((a, b) => a.stageOrder - b.stageOrder);
}

/**
 * Build the full prompt for a stage by combining base prompt with stage-specific prompt
 */
export function buildStagePrompt(stage: ConstructionStage, customBasePrompt?: string): string {
  const base = customBasePrompt || BASE_PROMPT;
  return `${base}, ${stage.stagePrompt}`;
}

/**
 * Video transition configuration for 12 videos (5s each = 60s total)
 * Each video uses start frame and end frame (image_tail) for precise transitions
 * Videos are created between consecutive images (including intermediate images)
 */
export interface VideoTransition {
  fromStageOrder: number;
  toStageOrder: number;
  fromStageKey: string;
  toStageKey: string;
  videoNumber: number;
  prompt: string;
  title: string;
}

/**
 * Generate video transitions for 12 videos (60s total)
 * Creates videos between consecutive stages, including intermediate transitions
 */
export function generateVideoTransitions(stageResults: Array<{
  stageKey: string;
  stageOrder: number;
  imageUrl: string;
  success: boolean;
}>): VideoTransition[] {
  const transitions: VideoTransition[] = [];
  let videoNumber = 1;

  // Sort stages by order (8 → 1)
  const sortedStages = [...stageResults]
    .filter(s => s.success)
    .sort((a, b) => b.stageOrder - a.stageOrder);

  // Create transitions between consecutive stages
  for (let i = 0; i < sortedStages.length - 1; i++) {
    const fromStage = sortedStages[i];
    const toStage = sortedStages[i + 1];
    
    // Get prompt for this transition
    const prompt = getVideoTransitionPrompt(fromStage.stageOrder, toStage.stageOrder);
    const title = getVideoTitle(fromStage.stageOrder, toStage.stageOrder);

    transitions.push({
      fromStageOrder: fromStage.stageOrder,
      toStageOrder: toStage.stageOrder,
      fromStageKey: fromStage.stageKey,
      toStageKey: toStage.stageKey,
      videoNumber: videoNumber++,
      prompt,
      title
    });
  }

  return transitions;
}

/**
 * Intermediate image prompts for creating transitional states between main stages
 * These images bridge the gap between major construction phases for smoother video transitions
 */
export const INTERMEDIATE_IMAGE_PROMPTS: Record<string, string> = {
  "8-7": `Create an intermediate construction stage image showing the transition from bare land to foundation preparation. The scene shows early site work in progress: survey markers are placed, some excavation has begun, and construction equipment has arrived. Workers are visible preparing the site. Some soil has been moved but no concrete piles are installed yet. The elevated concrete platform is not yet visible. This is the midpoint between completely bare land and completed foundation. Use exact same camera angle and perspective. Photorealistic construction site.`,
  
  "7-6": `Create an intermediate construction stage image showing the transition from foundation to structural framing. The elevated concrete foundation platform is complete with piles visible. Some vertical columns have been partially erected but not all columns are in place yet. Horizontal beams are being installed but the structural skeleton is not fully complete. Scaffolding is being set up. This shows the midpoint between completed foundation and fully erected structural frame. Use exact same camera angle and perspective. Photorealistic construction progress.`,
  
  "6-5": `Create an intermediate construction stage image showing the transition from structural framing to roofing. The complete structural frame with all columns and beams is visible. Roof trusses are being installed and partially assembled. Some roof structure is visible but not fully covered yet. The asymmetrical roof shape is beginning to form. Scaffolding and ladders are in use. This shows the midpoint between completed structural frame and fully covered roof. Use exact same camera angle and perspective. Photorealistic construction activity.`,
  
  "5-4": `Create an intermediate construction stage image showing the transition from roofing to wall construction. The roof is fully covered with dark tiles or metal sheets, and under-eave wooden panels are fitted. Wall construction has begun: some masonry blocks are laid but walls are not fully erected yet. Cement plaster rendering has started on some sections but not completed. This shows the midpoint between completed roof and fully rendered walls. Use exact same camera angle and perspective. Photorealistic construction progress.`,
  
  "4-3": `Create an intermediate construction stage image showing the transition from wall rendering to fenestration. The walls are fully rendered with smooth cement plaster (grey, unpainted). Some door and window openings have frames installed but not all openings are complete. The wooden deck sub-frame structure is visible but deck planks are not yet laid. This shows the midpoint between completed walls and fully installed fenestration with deck. Use exact same camera angle and perspective. Photorealistic construction site.`,
  
  "3-2": `Create an intermediate construction stage image showing the transition from fenestration to final finishing. The house has completed doors, windows, and deck installed. Exterior walls show grey cement plaster rendering. Some painting work has begun: white paint is partially applied to some wall sections but not complete. Vertical wooden slats may be partially installed on the gable. Exterior wall lights may be partially mounted. The deck is complete but not yet refined. This shows the midpoint between completed fenestration and fully finished exterior. Use exact same camera angle and perspective. Photorealistic construction progress.`,
  
  "2-1": `Create an intermediate construction stage image showing the transition from final finishing to completed house with landscaping. The house shows completed white painted walls, vertical wood slats on gable, exterior wall lights mounted, and refined deck. Some landscaping work has begun: the wooden walkway may be partially installed, some decorative plants may be partially planted around the deck, but not all landscaping is complete. Outdoor furniture may be partially placed. This shows the midpoint between completed house finishing and fully landscaped completed house. Use exact same camera angle and perspective. Photorealistic construction completion.`
};

/**
 * Get intermediate image prompt for a specific transition
 */
export function getIntermediateImagePrompt(fromStageOrder: number, toStageOrder: number): string {
  const key = `${fromStageOrder}-${toStageOrder}`;
  return INTERMEDIATE_IMAGE_PROMPTS[key] || `Create an intermediate construction stage image between stage ${fromStageOrder} and stage ${toStageOrder}. Show a transitional state that bridges these two stages. Use the exact same camera angle and perspective. The image should show construction progress that is halfway between the two stages.`;
}

/**
 * Video transition prompts for 5-second videos WITH image_tail
 * These prompts are optimized for 5-second transitions with precise start and end frames
 * Each video shows a specific construction activity between two consecutive images
 */
export const VIDEO_TRANSITION_PROMPTS: Record<string, string> = {
  // Video 1: Bare Land → Intermediate (8 → 7.5)
  "8-7.5": `Site preparation begins on empty rice field. Construction workers arrive with equipment. Survey markers are placed on the ground. Initial excavation starts, soil is being moved. Construction vehicles and tools are visible. Workers begin marking and measuring the site. The land shows early signs of construction activity. No foundation yet. No camera movement. Fixed camera angle. Photorealistic construction site preparation.`,
  
  // Video 2: Intermediate → Foundation (7.5 → 7)
  "7.5-7": `Foundation construction continues. Excavation deepens, soil is leveled. Concrete piles are driven into the ground one by one. Workers prepare concrete mixture. Wet concrete is poured to form the elevated foundation platform. The concrete platform gradually takes shape and hardens. Piles become visible above ground. The elevated foundation structure becomes complete. No camera movement. Fixed camera angle. Photorealistic foundation construction process.`,
  
  // Video 3: Foundation → Intermediate (7 → 6.5)
  "7-6.5": `Structural work begins on completed foundation. Workers set up scaffolding around the foundation. First vertical columns are lifted and positioned. Columns are secured to the foundation platform. More columns are gradually erected. Horizontal beams start to be installed. The structural skeleton begins to take shape. No camera movement. Fixed camera angle. Photorealistic structural construction activity.`,
  
  // Video 4: Intermediate → Structural Frame (6.5 → 6)
  "6.5-6": `Structural framing continues. Remaining columns are erected and secured. Horizontal beams are connected between columns. The complete structural skeleton forms. Roof trusses are being prepared. The asymmetrical roof structure begins to take shape. Scaffolding is actively used. The main structural frame becomes fully visible. No camera movement. Fixed camera angle. Photorealistic structural completion.`,
  
  // Video 5: Structural Frame → Intermediate (6 → 5.5)
  "6-5.5": `Roofing installation begins. Workers climb scaffolding and ladders. Roof trusses are lifted and positioned on the structural frame. Trusses are secured to the frame. The roof structure takes shape. Workers begin installing roof covering materials. Some sections show roof structure without covering. The asymmetrical roof shape becomes more defined. No camera movement. Fixed camera angle. Photorealistic roofing process.`,
  
  // Video 6: Intermediate → Roofing (5.5 → 5)
  "5.5-5": `Roofing completion continues. Dark roof tiles or corrugated metal sheets are installed section by section. The roof covering spreads across the structure. Under-eave wooden panels are fitted beneath the roof. The roof becomes fully covered. The asymmetrical Saltbox-inspired roofline is complete. Workers finish roofing details. The roof structure is fully complete. No camera movement. Fixed camera angle. Photorealistic roofing completion.`,
  
  // Video 7: Roofing → Intermediate (5 → 4.5)
  "5-4.5": `Wall construction begins beneath completed roof. Workers lay masonry blocks course by course. Walls rise gradually from the foundation. Some sections show completed block structure. Cement plaster rendering starts on some wall sections. Wet cement is applied by hand. Walls show partial rendering. The building structure becomes more enclosed. No camera movement. Fixed camera angle. Photorealistic wall construction.`,
  
  // Video 8: Intermediate → Walls (4.5 → 4)
  "4.5-4": `Wall construction and rendering continues. Remaining masonry blocks are laid. Walls reach full height. Cement plaster is applied to all wall surfaces. Wet cement rendering spreads across walls. Smooth cement plaster finish is achieved. Walls show uniform grey cement rendering. No doors or windows installed yet. The building structure is fully enclosed. No camera movement. Fixed camera angle. Photorealistic wall rendering completion.`,
  
  // Video 9: Walls → Intermediate (4 → 3.5)
  "4-3.5": `Fenestration work begins. Workers prepare door and window openings. Window frames are positioned and installed. Some windows are fixed in place. Large glass sliding door frames are positioned. The wooden deck sub-frame structure is assembled. Deck supports are installed. Some deck structure becomes visible. No camera movement. Fixed camera angle. Photorealistic fenestration installation.`,
  
  // Video 10: Intermediate → Fenestration (3.5 → 3)
  "3.5-3": `Fenestration and decking completion. All window frames are installed and secured. Large glass sliding doors are positioned and fixed. Glass panels are installed in windows and doors. Deck planks are laid across the sub-frame. The wooden deck becomes fully constructed. All fenestration is complete. The building shows completed doors, windows, and deck. No camera movement. Fixed camera angle. Photorealistic fenestration completion.`,
  
  // Video 11: Fenestration → Final Finishing (3 → 2)
  "3-2": `Final exterior finishing work begins. Workers prepare paint and materials. Exterior walls are painted white using rollers and brushes. White paint spreads across walls. Vertical wooden slats are installed on the gable section. Exterior wall lights are mounted and positioned. The wooden deck is cleaned and refined. The house shows completed exterior finishes. No camera movement. Fixed camera angle. Photorealistic finishing work.`,
  
  // Video 11: Fenestration → Intermediate (3 → 2.5)
  "3-2.5": `Exterior finishing work begins. Workers prepare paint materials. White paint is applied to exterior walls using rollers and brushes. Paint spreads across wall surfaces. Some sections show completed white paint while others still show grey cement. Vertical wooden slats begin to be installed on the gable section. Exterior wall lights start to be mounted. The deck is being cleaned. No camera movement. Fixed camera angle. Photorealistic finishing work in progress.`,
  
  // Video 12: Intermediate → Final Finishing (2.5 → 2)
  "2.5-2": `Final finishing completion. All exterior walls are painted white. Vertical wooden slats are fully installed on the gable. Exterior wall lights are mounted and positioned. The wooden deck is refined and cleaned. All exterior finishing details are complete. The house shows completed white painted walls, slats, and lights. No landscaping added yet. No camera movement. Fixed camera angle. Photorealistic finishing stage completion.`,
  
  // Video 13: Final Finishing → Intermediate (2 → 1.5)
  "2-1.5": `Landscaping work begins. Workers start installing the wooden walkway through the rice field. Walkway supports are placed. Some walkway planks are laid. Decorative plants begin to be planted around the deck base. Some outdoor furniture is positioned. Lighting fixtures are being adjusted. Landscaping work is in progress but not complete. No camera movement. Fixed camera angle. Photorealistic landscaping process.`,
  
  // Video 14: Intermediate → Completed House (1.5 → 1)
  "1.5-1": `Landscaping completion. The wooden walkway is fully installed connecting to the house. All decorative plants are planted around the deck. Outdoor furniture is carefully placed and arranged. Lighting fixtures are adjusted and tested. Final landscaping details are completed. Workers finish their tasks and gradually leave the site. The house appears fully completed with all landscaping finished. No camera movement. Cinematic construction completion.`
};

/**
 * Get video transition prompt for a specific stage transition
 * Handles both integer stages (8, 7, 6...) and intermediate stages (7.5, 6.5...)
 */
export function getVideoTransitionPrompt(fromStageOrder: number, toStageOrder: number): string {
  // Try exact match first
  const exactKey = `${fromStageOrder}-${toStageOrder}`;
  if (VIDEO_TRANSITION_PROMPTS[exactKey]) {
    return VIDEO_TRANSITION_PROMPTS[exactKey];
  }
  
  // Try rounding for intermediate stages
  const fromRounded = Math.round(fromStageOrder * 2) / 2; // Round to nearest 0.5
  const toRounded = Math.round(toStageOrder * 2) / 2;
  const roundedKey = `${fromRounded}-${toRounded}`;
  if (VIDEO_TRANSITION_PROMPTS[roundedKey]) {
    return VIDEO_TRANSITION_PROMPTS[roundedKey];
  }
  
  // Fallback to main stage transition
  const fromMain = Math.ceil(fromStageOrder);
  const toMain = Math.ceil(toStageOrder);
  const mainKey = `${fromMain}-${toMain}`;
  if (VIDEO_TRANSITION_PROMPTS[mainKey]) {
    return VIDEO_TRANSITION_PROMPTS[mainKey];
  }
  
  // Final fallback
  return `Construction timelapse transition from stage ${fromStageOrder} to stage ${toStageOrder}. Smooth morphing transformation showing construction progress. Professional architectural visualization.`;
}

/**
 * Get video title for a specific stage transition
 */
export function getVideoTitle(fromStageOrder: number, toStageOrder: number): string {
  const titles: Record<string, string> = {
    "8-7": "Bare Land → Foundation & Site Preparation",
    "7-6": "Foundation → Structural Framing",
    "6-5": "Structural Framing → Roofing Structure",
    "5-4": "Roofing Structure → Walls & Rendering",
    "4-3": "Wall Rendering → Fenestration & Decking",
    "3-2": "Fenestration → Final Finishing",
    "2-1": "Final Finishing → Completed House & Landscaping"
  };
  const key = `${fromStageOrder}-${toStageOrder}`;
  return titles[key] || `Stage ${fromStageOrder} → Stage ${toStageOrder}`;
}
