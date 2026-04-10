// Visual constants for canvas rendering
export const LATENT_RADIUS = 36
export const MANIFEST_DEFAULT_W = 60
export const MANIFEST_DEFAULT_H = 60
export const DATASET_DEFAULT_W = 60
export const DATASET_DEFAULT_H = 60
// Display coordinate transformation constants
// Used when computing anchor offsets for normalized coordinate space
// TODO: Make these configurable via model.visualization.displayContext
//       and global configuration for cascade/submodel positioning
export const DISPLAY_MARGINS = {
  LEFT: 50,
  TOP: 50,
} as const

export const MODEL_WIDTH_FACTOR = 0.5  // For future horizontal centering in cascade layouts