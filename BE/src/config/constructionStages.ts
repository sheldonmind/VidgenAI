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
