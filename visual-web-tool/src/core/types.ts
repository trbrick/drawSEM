/**
 * Core TypeScript interfaces for the Visual Web Tool
 * These types directly mirror graph.schema.json structure
 * GraphSchema is the universal interchange format for all operations
 */

/**
 * Root graph document - matches graph.schema.json structure
 * This is the universal interchange format for all operations
 */
export interface GraphSchema {
  schemaVersion: 1
  meta?: Record<string, unknown>  // Global metadata
  models: Record<string, Model>   // Named dictionary of models
}

/**
 * Individual statistical model
 * All nodes and paths must be defined within a model
 */
export interface Model {
  label?: string
  meta?: Record<string, unknown>
  nodes: Node[]
  paths: Path[]
  optimization?: ModelOptimization
}

/**
 * Node represents a variable, constant, or dataset
 * "type" determines how it participates in paths
 */
export interface Node {
  id?: string                          // Auto-generated if missing
  label: string                        // Required identifier
  type: 'variable' | 'constant' | 'dataset'
  levelOfMeasurement?: string          // 'within' | 'between' for multilevel
  tags?: string[]                      // Classification tags
  visual?: VisualProperties
  mappings?: Record<string, string>    // CSV column → node ID mappings (dataset only)
  datasetFile?: DatasetFileMetadata    // For dataset nodes
}

/**
 * Path represents a relationship between nodes
 * numberOfArrows determines semantic meaning:
 * - 1 = regression/directed path (→)
 * - 2 = covariance/bidirectional (↔)
 */
export interface Path {
  id?: string
  fromLabel: string                    // Source node label (must exist in nodes)
  toLabel: string                      // Target node label (must exist in nodes)
  numberOfArrows: 0 | 1 | 2
  value?: number | null                // Parameter value (null for dataset paths)
  free?: 'free' | 'fixed'             // Whether parameter is estimated
  label?: string | null               // Optional path label/name
  description?: string
  parameterType?: string              // Reference to optimization.parameterTypes
  optimization?: ParameterType        // Path-level overrides (same shape as ParameterType)
  tags?: string[]
  visual?: PathVisualProperties
}

/**
 * Model-level optimization configuration
 * Defines parameter type templates used by paths
 */
export interface ModelOptimization {
  parameterTypes?: Record<string, ParameterType>
}

/**
 * Parameter type definition / Optimization configuration
 * Used both as semantic category for parameters and as path-level overrides
 * Provides default priors, bounds, and starting values
 */
export interface ParameterType {
  prior?: Prior | null
  bounds?: [number | null, number | null] | null
  start?: number | string | null      // 'auto' or numeric value
}

/**
 * Prior distribution specification
 * Structure depends on backend (OpenMx, lavaan, blavaan)
 */
export interface Prior {
  distribution?: string               // 'normal', 'uniform', etc.
  [key: string]: unknown              // Backend-specific properties
}

/**
 * Visual layout hints (for UI rendering and preservation)
 */
export interface VisualProperties {
  x?: number
  y?: number
  width?: number
  height?: number
  angle?: number
}

/**
 * Path-specific visual properties
 */
export interface PathVisualProperties {
  loopSide?: 'top' | 'right' | 'bottom' | 'left'
  midpointOffset?: { x: number; y: number }
}

/**
 * Dataset file metadata for CSV integration
 */
export interface DatasetFileMetadata {
  fileName: string
  md5?: string                         // For integrity verification
  rowCount?: number
  columnCount?: number
  columns?: string[]
}

/**
 * Exporter interface - all backends implement this
 * Note: All methods work with GraphSchema as the exchange format
 */
export interface GraphAdapter {
  /**
   * Load a GraphSchema from source (file, URL, Shiny, etc.)
   * Must validate before returning using existing validators
   */
  load(source: string): Promise<GraphSchema>

  /**
   * Save a GraphSchema to destination
   * Should validate before persisting
   */
  save(schema: GraphSchema): Promise<void>

  /**
   * Export schema to backend code
   * Takes complete schema, returns code string
   */
  export(
    schema: GraphSchema,
    format: 'openmx' | 'lavaan' | 'blavaan',
    options?: ExportOptions
  ): Promise<string>
}

/**
 * Export options shared by all backends
 * Each exporter can use subset relevant to its format
 */
export interface ExportOptions {
  modelId?: string                    // Which model to export (uses first if unspecified)
  includeComments?: boolean           // Add explanatory comments in output (default: true)
  variableNames?: Record<string, string>  // Custom variable name mapping
  printResults?: boolean              // Print results after fitting (OpenMx)
  mcmcOptions?: {                     // MCMC options for Bayesian methods
    chains?: number
    iterations?: number
    burnin?: number
    thin?: number
  }
}

/**
 * Type guard: validate that an object is a GraphSchema
 * Used before exporting to ensure data integrity
 */
export function isGraphSchema(obj: unknown): obj is GraphSchema {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'schemaVersion' in obj &&
    'models' in obj &&
    (obj as any).schemaVersion === 1 &&
    typeof (obj as any).models === 'object'
  )
}

/**
 * Helper: Extract first model ID from schema
 * Useful for exporters when modelId not specified
 */
export function getFirstModelId(schema: GraphSchema): string {
  const keys = Object.keys(schema.models)
  if (keys.length === 0) throw new Error('Schema has no models')
  return keys[0]
}

/**
 * Helper: Get model by ID with fallback to first
 */
export function getModel(schema: GraphSchema, modelId?: string): Model {
  const id = modelId || getFirstModelId(schema)
  const model = schema.models[id]
  if (!model) throw new Error(`Model "${id}" not found`)
  return model
}

/**
 * Helper: Get all nodes in a model as a map for quick lookup by label
 */
export function getNodesByLabel(
  model: Model
): Record<string, Node> {
  const map: Record<string, Node> = {}
  for (const node of model.nodes) {
    map[node.label] = node
  }
  return map
}

/**
 * Helper: Validate that all path endpoints exist in the model
 */
export function validatePathEndpoints(model: Model): string[] {
  const errors: string[] = []
  const nodeLabels = new Set(model.nodes.map(n => n.label))

  for (const path of model.paths) {
    if (!nodeLabels.has(path.fromLabel)) {
      errors.push(
        `Path from "${path.fromLabel}" to "${path.toLabel}": source node not found`
      )
    }
    if (!nodeLabels.has(path.toLabel)) {
      errors.push(
        `Path from "${path.fromLabel}" to "${path.toLabel}": target node not found`
      )
    }
  }

  return errors
}

/**
 * Helper: Get parameter type definition for a path
 * Merges path-level overrides with parameter type defaults
 */
export function getPathParameterConfig(
  path: Path,
  model: Model
): ParameterType | undefined {
  if (!path.parameterType || !model.optimization?.parameterTypes) {
    return undefined
  }

  const typeDefault = model.optimization.parameterTypes[path.parameterType]
  if (!typeDefault) return undefined

  // Path-level optimization overrides type defaults
  if (path.optimization) {
    return {
      prior: path.optimization.prior ?? typeDefault.prior,
      bounds: path.optimization.bounds ?? typeDefault.bounds,
      start: path.optimization.start ?? typeDefault.start,
    }
  }

  return typeDefault
}

/**
 * Helper: Check if a node is a dataset node
 */
export function isDatasetNode(node: Node): boolean {
  return node.type === 'dataset'
}

/**
 * Helper: Check if a path originates from a dataset
 */
export function isDatasetPath(path: Path, model: Model): boolean {
  const nodesByLabel = getNodesByLabel(model)
  const sourceNode = nodesByLabel[path.fromLabel]
  return sourceNode ? isDatasetNode(sourceNode) : false
}

/**
 * Helper: Get all paths from a specific node
 */
export function getPathsFrom(model: Model, nodeLabel: string): Path[] {
  return model.paths.filter(p => p.fromLabel === nodeLabel)
}

/**
 * Helper: Get all paths to a specific node
 */
export function getPathsTo(model: Model, nodeLabel: string): Path[] {
  return model.paths.filter(p => p.toLabel === nodeLabel)
}

/**
 * Helper: Check if a path is a covariance (two-headed)
 */
export function isCovariance(path: Path): boolean {
  return path.numberOfArrows === 2
}

/**
 * Helper: Check if a path is a regression (one-headed)
 */
export function isRegression(path: Path): boolean {
  return path.numberOfArrows === 1
}

/**
 * Helper: Check if a path is a self-loop
 */
export function isSelfLoop(path: Path): boolean {
  return path.fromLabel === path.toLabel
}
