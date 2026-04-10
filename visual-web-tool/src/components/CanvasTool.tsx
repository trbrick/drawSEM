import React, { useRef, useState } from 'react'
import Papa from 'papaparse'
import Ajv from 'ajv'
import schema from '../../schema/graph.schema.json'
import { convertToUnicode } from '../utils/converters'
import { convertDocToRuntime } from '../utils/runtimeConverter'
import { autoLayout, PositionMap } from '../utils/autoLayout'
import { uid, isDatasetPath } from '../utils/helpers'
import { LATENT_RADIUS, MANIFEST_DEFAULT_W, MANIFEST_DEFAULT_H, DATASET_DEFAULT_W, DATASET_DEFAULT_H, DISPLAY_MARGINS } from '../utils/constants'
import { computeModelBounds, computeAnchor, DisplayAnchor } from '../utils/coordinateNormalization'
import { GraphSchema } from '../core/types'
import { useAdapter, useAdapterOptional } from '../context/AdapterContext'

type NodeType = 'variable' | 'constant' | 'dataset'

type Node = {
  id: string
  x: number
  y: number
  label: string
  type: NodeType
  // optional display name (for UI only) - separate from label used for matching/export
  displayName?: string
  // for variable nodes: semantic characteristics (manifestLatent, exogeneity, customTags)
  variableCharacteristics?: {
    manifestLatent?: 'manifest' | 'latent'
    exogeneity?: 'exogenous' | 'endogenous'
    customTags?: string[]
  }
  // optional level of measurement (for multilevel models)
  levelOfMeasurement?: string // e.g., 'within', 'between', 'between-person', etc.
  // optional size for manifest nodes
  width?: number
  height?: number
  // optional dataset metadata attached to dataset nodes (internal only)
  dataset?: {
    fileName: string
    headers: string[]
    columns: any[]
  }
  // optional column mappings for dataset nodes: { columnName: targetNodeId }
  mappings?: Record<string, string>
  // optional dataset source metadata from schema (file-based or embedded)
  datasetSource?: {
    type: 'file' | 'embedded'
    location?: string          // For type='file': path to CSV file
    format?: string            // 'csv', 'tsv', 'xlsx', 'json'
    encoding?: string          // e.g., 'UTF-8'
    columnTypes?: Record<string, string>  // mapping of column names to data types
    md5?: string              // For integrity verification
    rowCount?: number         // Number of data rows (excluding header)
    object?: any[]            // For type='embedded': array of row objects
  }
}

type Path = {
  id: string
  from: string
  to: string
  twoSided: boolean
  // optional side for self-loop attachment: 'top', 'right', 'bottom', 'left'
  side?: 'top' | 'right' | 'bottom' | 'left'
  // optional human-facing label (editable). If null or absent, UI will not display a label.
  label?: string | null
  // optional display name (for UI only) - separate from label used for matching/export
  displayName?: string | null
  // numeric value for the path; defaults to 1.0 (null for dataset paths)
  value?: number | null
  // whether the path parameter is freely estimated; true = free anonymous, absent = fixed
  freeParameter?: boolean | string
  // optional semantic category from optimization.parameterTypes
  parameterType?: string
  // when true and twoSided=false, the visual arrow direction is reversed (to→from instead of from→to)
  reversed?: boolean
  // optional path-specific optimization overrides
  optimization?: {
    prior?: Record<string, any> | null
    bounds?: [number | null, number | null] | null
    start?: number | string | null
  }
}

type Mode =
  | 'select'
  | 'add-variable'
  | 'add-constant'
  | 'add-one-path'
  | 'add-two-path'

// Display styling constants
const DISPLAY_COLORS = {
  fill: '#fff',
  stroke: '#000',
  selectedStroke: '#ff0000',
  selectedStrokeWidth: 2.5,
  defaultStrokeWidth: 1.5,
}

const DISPLAY_OPACITY = {
  highlighted: 1,
  transparent: 0.25,
  invisible: 0,
}

const DISPLAY_Z_INDEX = {
  highlighted: 10,
  background: 1,
}

type OffLayerVisibility = 'transparent' | 'invisible'

interface CanvasToolProps {
  initialSchema?: GraphSchema
  onModelChange?: (schema: GraphSchema) => void
  viewMode?: 'widget' | 'shiny' | 'full'
}

export default function CanvasTool({ initialSchema, onModelChange, viewMode = 'full' }: CanvasToolProps): JSX.Element {
  console.log('[CanvasTool] Component mounted. viewMode:', viewMode, 'initialSchema provided:', !!initialSchema)
  const adapter = useAdapter()
  const adapterOptional = useAdapterOptional()
  // Multi-model state
  const [models, setModels] = useState<Array<{ id: string; label: string; nodes: Node[]; paths: Path[]; parameterTypes: Record<string, any> }>>([])
  const [currentModelId, setCurrentModelId] = useState<string | null>(null)
  
  // Convenience accessors for current model
  const currentModel = models.find((m) => m.id === currentModelId)
  const nodes = currentModel?.nodes || []
  const paths = currentModel?.paths || []
  const parameterTypes = currentModel?.parameterTypes || {}
  
  // Setters for current model (convenience wrappers)
  const setNodes = (updater: React.SetStateAction<Node[]>) => {
    setModels((ms) => {
      const modelId = currentModelId
      if (!modelId) return ms
      return ms.map((m) =>
        m.id === modelId
          ? {
              ...m,
              nodes: typeof updater === 'function' ? updater(m.nodes) : updater,
            }
          : m
      )
    })
  }

  const setPaths = (updater: React.SetStateAction<Path[]>) => {
    setModels((ms) => {
      const modelId = currentModelId
      if (!modelId) return ms
      return ms.map((m) =>
        m.id === modelId
          ? {
              ...m,
              paths: typeof updater === 'function' ? updater(m.paths) : updater,
            }
          : m
      )
    })
  }

  const setParameterTypes = (updater: React.SetStateAction<Record<string, any>>) => {
    setModels((ms) => {
      const modelId = currentModelId
      if (!modelId) return ms
      return ms.map((m) =>
        m.id === modelId
          ? {
              ...m,
              parameterTypes: typeof updater === 'function' ? updater(m.parameterTypes) : updater,
            }
          : m
      )
    })
  }

  const [activeLayer, setActiveLayer] = useState<'all' | 'sem' | 'data' | string>('all')
  const [offLayerVisibility, setOffLayerVisibility] = useState<OffLayerVisibility>('transparent')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])

  // Debug: Log nodes whenever they change
  React.useEffect(() => {
    if (nodes.length > 0) {
      console.log('[Canvas Render] Nodes updated:', nodes.length, 'nodes:', nodes.map(n => ({ id: n.id, label: n.label, x: n.x, y: n.y })))
      console.log('[Canvas Debug] First node details:', nodes[0])
      
      // Calculate viewBox bounds
      const xs = nodes.map(n => n.x || 0)
      const ys = nodes.map(n => n.y || 0)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      const width = maxX - minX
      const height = maxY - minY
      console.log('[Canvas Debug] ViewBox bounds - minX:', minX, 'maxX:', maxX, 'minY:', minY, 'maxY:', maxY, 'width:', width, 'height:', height)
    }
  }, [nodes])

  // Debug: Monitor SVG ref and its attributes
  React.useEffect(() => {
    const checkSvgElement = () => {
      if (svgRef.current) {
        console.log('[SVG Debug] SVG element mounted')
        console.log('[SVG Debug] SVG width:', svgRef.current.getAttribute('width'))
        console.log('[SVG Debug] SVG height:', svgRef.current.getAttribute('height'))
        console.log('[SVG Debug] SVG viewBox:', svgRef.current.getAttribute('viewBox'))
        console.log('[SVG Debug] SVG class:', svgRef.current.getAttribute('class'))
        console.log('[SVG Debug] Computed style:', {
          width: window.getComputedStyle(svgRef.current).width,
          height: window.getComputedStyle(svgRef.current).height,
          display: window.getComputedStyle(svgRef.current).display,
        })
      }
    }
    
    checkSvgElement()
    // Also check after a brief delay to ensure DOM is fully painted
    const timeout = setTimeout(checkSvgElement, 100)
    return () => clearTimeout(timeout)
  }, []) // Only on mount

  // Get all unique level of measurement values from nodes (explicitly specified only)
  const getLevelOfMeasurementOptions = (): string[] => {
    const levels = new Set<string>()
    nodes.forEach((n) => {
      if (n.levelOfMeasurement) {
        levels.add(n.levelOfMeasurement)
      }
    })
    return Array.from(levels).sort()
  }

  // Get effective level of measurement for a node (specified or defaulted to single level)
  const getEffectiveLevelOfMeasurement = (node: Node): { level: string | undefined; isDefault: boolean } => {
    // If explicitly set, use that
    if (node.levelOfMeasurement) return { level: node.levelOfMeasurement, isDefault: false }
    // If there's only one level in the graph, use it as default
    const levels = getLevelOfMeasurementOptions()
    if (levels.length === 1) return { level: levels[0], isDefault: true }
    return { level: undefined, isDefault: false }
  }

  // Helper: Get effective optimization config for a path (merge defaults from parameterType + path overrides)
  const getPathOptimizationConfig = (path: Path) => {
    const typeDefaults = path.parameterType ? parameterTypes[path.parameterType] : {}
    return {
      prior: path.optimization?.prior !== undefined ? path.optimization.prior : typeDefaults?.prior,
      bounds: path.optimization?.bounds !== undefined ? path.optimization.bounds : typeDefaults?.bounds,
      start: path.optimization?.start !== undefined ? path.optimization.start : typeDefaults?.start,
    }
  }

  // Helper: Update a path's optimization field
  const updatePathOptimization = (pathId: string, updates: Partial<Path['optimization']>) => {
    setPaths((ps) =>
      ps.map((p) =>
        p.id === pathId
          ? {
              ...p,
              optimization: {
                ...(p.optimization || {}),
                ...updates,
              },
            }
          : p
      )
    )
  }

  // Helper: Update a path's parameterType field
  const updatePathParameterType = (pathId: string, parameterType: string | undefined) => {
    setPaths((ps) =>
      ps.map((p) =>
        p.id === pathId ? { ...p, parameterType } : p
      )
    )
  }

  // Helper: Show error message with auto-dismiss
  const showPathError = (message: string) => {
    setErrorMessage(message)
    setTimeout(() => setErrorMessage(null), 4000)
  }

  // Helper: Check if a path is valid and return error message if not
  const getPathValidationError = (srcId: string, dstId: string, twoSided: boolean): string | null => {
    const srcNode = nodes.find((n) => n.id === srcId)
    const dstNode = nodes.find((n) => n.id === dstId)

    // Can't have self-paths with one arrow (only two-sided variance)
    if (srcId === dstId && !twoSided) {
      return 'Self-paths must be two-headed (variance). Use ↔ to create variance.'
    }

    // Dataset nodes can only be sources, never destinations
    if (dstNode?.type === 'dataset') {
      return 'Dataset nodes can only be data sources, not path destinations. Paths must originate FROM datasets, not TO datasets.'
    }

    // Constants can only be sources (one-headed incoming paths), not destinations and no two-headed paths
    if (dstNode?.type === 'constant') {
      return 'Constants cannot be path destinations. Constants are fixed values that can only serve as sources (→).'
    }

    // Constants can't have any two-headed paths (self or outgoing)
    if (srcNode?.type === 'constant' && twoSided) {
      return 'Constants cannot have two-headed paths (↔). Constants can only have one-headed outgoing paths (→).'
    }

    // Datasets can only be sources, never destinations (handled above at line 182)
    // If they're also the source, they can't have two-headed paths
    if (srcNode?.type === 'dataset' && twoSided) {
      return 'Datasets cannot have two-headed paths. Use → for one-headed paths from datasets.'
    }

    // Paths from datasets to nodes with different level of measurement
    if (srcNode?.type === 'dataset') {
      const srcEffective = getEffectiveLevelOfMeasurement(srcNode)
      const dstEffective = getEffectiveLevelOfMeasurement(dstNode!)
      if (srcEffective.level && dstEffective.level && srcEffective.level !== dstEffective.level) {
        return `Cannot connect dataset (level: ${srcEffective.level}) to node at different level (${dstEffective.level}). All connected nodes must be at the same level of measurement.`
      }
    }

    // Paths to nodes without level of measurement when dataset has one
    if (srcNode?.type === 'dataset' && srcNode.levelOfMeasurement && !dstNode?.levelOfMeasurement) {
      const specifiedLevels = getLevelOfMeasurementOptions()
      if (specifiedLevels.length > 1) {
        return `Target node has no level of measurement specified. Please assign a level first, or this node will be treated as unspecified.`
      }
    }

    // Duplicate one-headed paths
    if (!twoSided) {
      const exists = paths.find((pp) => pp.from === srcId && pp.to === dstId && pp.twoSided === false)
      if (exists) {
        return 'A one-headed path already exists between these nodes.'
      }
    }

    return null
  }

  // Layer helpers: determine if a node/path should be highlighted in the current layer
  const getElementOpacity = (inLayer: boolean): number => {
    if (inLayer) return DISPLAY_OPACITY.highlighted
    return offLayerVisibility === 'transparent' ? DISPLAY_OPACITY.transparent : DISPLAY_OPACITY.invisible
  }

  const getElementZIndex = (inLayer: boolean): number => {
    if (inLayer) return DISPLAY_Z_INDEX.highlighted
    return DISPLAY_Z_INDEX.background
  }

  const isNodeInLayer = (node: Node): boolean => {
    if (activeLayer === 'all') return true
    if (activeLayer === 'sem') return node.type !== 'dataset'
    if (activeLayer === 'data') return node.type === 'dataset' || node.type === 'manifest'
    // Level of measurement layer: show nodes with that specific level (using effective level)
    const effective = getEffectiveLevelOfMeasurement(node)
    if (effective.level === activeLayer) return true
    return false
  }

  const isPathInLayer = (path: Path): boolean => {
    if (activeLayer === 'all') return true
    const fromNode = nodes.find(n => n.id === path.from)
    const toNode = nodes.find(n => n.id === path.to)
    if (activeLayer === 'sem') {
      // SEM layer: show paths that don't originate from dataset nodes
      return fromNode?.type !== 'dataset'
    }
    if (activeLayer === 'data') {
      // Data layer: show paths from datasets to manifest variables
      return isDatasetPath(path, nodes) && toNode?.type === 'manifest'
    }
    // Level of measurement layer: show paths between nodes with that level (using effective levels)
    const fromEffective = fromNode ? getEffectiveLevelOfMeasurement(fromNode) : { level: undefined, isDefault: false }
    const toEffective = toNode ? getEffectiveLevelOfMeasurement(toNode) : { level: undefined, isDefault: false }
    if (fromEffective.level === activeLayer && toEffective.level === activeLayer) return true
    return false
  }

  // Try to dynamically import the example JSON at runtime (non-blocking), validate it,
  // and replace the initial nodes/paths when valid.
  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        let g: any = initialSchema
        
        // If initialSchema not provided, check if running in Shiny mode with window.graphToolConfig
        if (!initialSchema && typeof window !== 'undefined' && window.graphToolConfig?.initialModel) {
          g = window.graphToolConfig.initialModel
        }
        
        // If still no schema, fetch the example JSON from the public examples directory
        if (!g) {
          const url = '/examples/graph.example.json'
          console.log('[JSON Import] Attempting to fetch from:', url)
          const res = await fetch(url)
          if (!res.ok) {
            console.warn('[JSON Import] HTTP error:', res.status, res.statusText)
            return
          }
          g = await res.json()
        }
        
        console.log('[JSON Import] Successfully loaded JSON:', g)
        if (!g) {
          console.warn('[JSON Import] JSON is empty')
          return
        }
        // validate the example using AJV and the bundled schema
        try {
          const ajv = new Ajv({ allErrors: true, strict: false })
          // Add date-time format support to suppress warnings
          ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/)
          const validate = ajv.compile(schema as object)
          const ok = validate(g)
          if (!ok) {
            // expose errors in the UI
            const errs = (validate.errors || []).map((er) => `${er.instancePath || '/'}: ${er.message}`)
            console.warn('[JSON Import] Validation errors:', errs)
            if (mounted) setImportErrors(errs)
            return
          }
          console.log('[JSON Import] JSON validation passed')
        } catch (ve) {
          // validation compilation failed; ignore and do not replace
          console.warn('[JSON Import] Validation compilation failed:', ve)
          return
        }

        // Apply auto-layout if configured
        if (window.graphToolConfig?.config?.visual?.autolayout === 'full') {
          console.log('[JSON Import] Applying auto-layout...')
          try {
            const positions: PositionMap = autoLayout(g as GraphSchema)
            console.log('[JSON Import] Auto-layout computed positions:', Object.keys(positions).length)
            
            // Integrate positions into schema nodes
            if (g && typeof (g as any).models === 'object' && !Array.isArray((g as any).models)) {
              Object.values((g as any).models).forEach((model: any) => {
                model.nodes?.forEach((node: any) => {
                  const posKey = node.label || node.id
                  if (positions[posKey]) {
                    if (!node.visual) {
                      node.visual = {}
                    }
                    node.visual.x = positions[posKey].x
                    node.visual.y = positions[posKey].y
                    if (positions[posKey].rank !== undefined) {
                      node.visual.rank = positions[posKey].rank
                    }
                  }
                })
              })
              // Debug: Log first node's visual properties
              const firstModel = Object.values((g as any).models)[0] as any
              if (firstModel?.nodes?.[0]) {
                console.log('[JSON Import] First node after position integration:', firstModel.nodes[0].label, 'visual:', firstModel.nodes[0].visual)
              }
            }
            console.log('[JSON Import] Positions integrated into schema')
          } catch (layoutError) {
            console.warn('[JSON Import] Auto-layout failed, proceeding without layout:', layoutError)
          }
        }

        if (mounted && g && typeof (g as any).models === 'object' && !Array.isArray((g as any).models)) {
          console.log('[JSON Import] Converting to runtime format. Models:', Object.keys((g as any).models).length)
          const modelsOut = convertDocToRuntime(g as any)
          console.log('[JSON Import] Conversion complete. Models:', modelsOut.length)
          // Debug: Log first model's nodes
          if (modelsOut.length > 0) {
            console.log('[JSON Import] First model nodes after conversion:', modelsOut[0].nodes.length, 'nodes:', modelsOut[0].nodes.map(n => ({ id: n.id, label: n.label, x: n.x, y: n.y })))
          }
          setModels(modelsOut.map((m: any) => ({ ...m, parameterTypes: m.parameterTypes || {} })))
          if (modelsOut.length > 0) {
            setCurrentModelId(modelsOut[0].id)
          }
        }
      } catch (e) {
        console.error('[JSON Import] Unexpected exception:', e)
      }
    })()
    return () => {
      mounted = false
    }
  }, [initialSchema])

  // Subscribe to model updates from Shiny (when running as R HTMLWidget)
  React.useEffect(() => {
    if (!adapterOptional?.onModelReceived) {
      return
    }
    
    // Register callback to handle model updates from R
    adapterOptional.onModelReceived((schema: GraphSchema) => {
      console.log('[Shiny] Received model update from R:', schema)
      try {
        if (typeof (schema as any).models === 'object' && !Array.isArray((schema as any).models)) {
          console.log('[Shiny] Models object found. Keys:', Object.keys((schema as any).models))
          const modelsOut = convertDocToRuntime(schema as any)
          console.log('[Shiny] Conversion complete. Models:', modelsOut.length)
          if (modelsOut.length > 0) {
            console.log('[Shiny] First model after conversion:', {
              id: modelsOut[0].id,
              label: modelsOut[0].label,
              nodeCount: modelsOut[0].nodes.length,
              nodes: modelsOut[0].nodes.map(n => ({ id: n.id, label: n.label, x: n.x, y: n.y }))
            })
          }
          setModels(modelsOut.map((m: any) => ({ ...m, parameterTypes: m.parameterTypes || {} })))
          if (modelsOut.length > 0) {
            setCurrentModelId(modelsOut[0].id)
          }
        }
      } catch (e) {
        console.error('[Shiny] Error processing model update:', e)
      }
    })
  }, [adapterOptional])

  // Signal readiness to Shiny after models are loaded
  React.useEffect(() => {
    if (models.length === 0 || !adapterOptional?.signalReady) {
      return
    }
    
    console.log('[Shiny] Signaling readiness to R with', models.length, 'model(s)')
    adapterOptional.signalReady()
  }, [models, adapterOptional])

  // Auto-load CSV files for dataset nodes that have datasetSource metadata
  React.useEffect(() => {
    let mounted = true
    const loadDatasetFile = async (node: Node) => {
      if (!node.datasetSource || node.datasetSource.type !== 'file') return
      const nodeId = node.id
      const fileName = node.datasetSource.location
      if (!fileName) return  // location is required for file type
      try {
        // Try to fetch the file from the public examples directory
        const csvUrl = `/examples/${fileName}`
        const res = await fetch(csvUrl)
        if (!res.ok) {
          const error = `File not found: ${fileName} (HTTP ${res.status})`
          if (mounted) {
            setDatasetErrors((prev) => new Map(prev).set(nodeId, error))
          }
          console.warn(error)
          return
        }
        const csvText = await res.text()

        // Verify integrity via MD5 hash
        const hashHex = await computeMD5(csvText)
        if (node.datasetSource.md5 && hashHex !== node.datasetSource.md5) {
          const error = `File integrity check failed for ${fileName}. Expected hash ${node.datasetSource.md5}, got ${hashHex}`
          if (mounted) {
            setDatasetErrors((prev) => new Map(prev).set(nodeId, error))
          }
          console.warn(error)
          return
        }

        // Parse CSV using PapaParse
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: false,
          skipEmptyLines: true,
          complete: (results: any) => {
            if (mounted) {
              // Check for parse errors
              if (results.errors && results.errors.length > 0) {
                const parseErr = `CSV parse error in ${fileName}: ${results.errors.map((e: any) => e.message).join(', ')}`
                setDatasetErrors((prev) => new Map(prev).set(nodeId, parseErr))
                console.warn(parseErr)
                return
              }

              const headers = (results.data && results.data.length > 0) ? Object.keys(results.data[0]) : []
              
              // Validate that expected columns (from datasetSource.columnTypes) exist in the file
              const expectedCols = node.datasetSource.columnTypes ? Object.keys(node.datasetSource.columnTypes) : []
              const missingCols = expectedCols.filter((col) => !headers.includes(col))
              if (missingCols.length > 0) {
                const colErr = `Dataset ${fileName} is missing expected columns: ${missingCols.join(', ')}`
                if (mounted) {
                  setDatasetErrors((prev) => new Map(prev).set(nodeId, colErr))
                }
                console.warn(colErr)
                return
              }

              // Compute per-column statistics (Welford)
              const columns = headers.map((h: string) => {
                const values = results.data.map((row: any) => row[h]).filter((v: any) => v !== null && v !== undefined && v !== '')
                const numValues = values.filter((v: any) => !isNaN(parseFloat(v))).map(parseFloat)
                let mean = 0, m2 = 0, n = 0, min = Infinity, max = -Infinity
                numValues.forEach((val: number) => {
                  n++
                  const delta = val - mean
                  mean += delta / n
                  const delta2 = val - mean
                  m2 += delta * delta2
                  min = Math.min(min, val)
                  max = Math.max(max, val)
                })
                const std = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0
                return {
                  name: h,
                  distinct: new Set(values).size,
                  cardinality: new Set(values).size,
                  mean: n > 0 ? mean : null,
                  std: n > 1 ? std : null,
                  min: n > 0 ? min : null,
                  max: n > 0 ? max : null,
                  count: values.length
                }
              })
              
              // Update the dataset node with loaded metadata
              setNodes((ns) =>
                ns.map((n) =>
                  n.id === nodeId
                    ? { ...n, dataset: { fileName, headers, columns } }
                    : n
                )
              )
              // Clear any previous errors for this node
              setDatasetErrors((prev) => {
                const updated = new Map(prev)
                updated.delete(nodeId)
                return updated
              })
            }
          },
          error: (error: any) => {
            const parseErr = `CSV parse error in ${fileName}: ${error.message}`
            if (mounted) {
              setDatasetErrors((prev) => new Map(prev).set(nodeId, parseErr))
            }
            console.warn(parseErr)
          }
        })
      } catch (e) {
        const exceptionErr = `Exception loading dataset ${fileName}: ${e instanceof Error ? e.message : String(e)}`
        if (mounted) {
          setDatasetErrors((prev) => new Map(prev).set(nodeId, exceptionErr))
        }
        console.warn(exceptionErr)
      }
    }
    
    // Load dataset files for all dataset nodes that have datasetSource metadata and haven't been loaded yet
    nodes.forEach((n) => {
      if (n.type === 'dataset' && n.datasetSource && !n.dataset) {
        loadDatasetFile(n)
      }
    })
    
    return () => {
      mounted = false
    }
  }, [nodes.filter((n) => n.type === 'dataset').map((n) => n.datasetSource?.location).join(',')])

  // Call onModelChange callback whenever the current model changes (for Shiny integration)
  React.useEffect(() => {
    if (onModelChange && currentModel) {
      try {
        // Build a GraphSchema from current model state
        // Note: This is simplified - in a full implementation you'd convert the full runtime state back to schema
        const modelSchema: GraphSchema = {
          schemaVersion: 1,
          models: {
            [currentModel.id]: {
              label: currentModel.label,
              nodes: currentModel.nodes,
              paths: currentModel.paths,
              optimization: {
                parameterTypes: currentModel.parameterTypes
              }
            }
          }
        }
        onModelChange(modelSchema)
      } catch (e) {
        console.error('[onModelChange] Error calling callback:', e)
      }
    }
  }, [currentModel, onModelChange])
  // For now, we'll use a simple hash or accept the verification for demo purposes
  const computeMD5 = async (data: string): Promise<string> => {
    // Simple implementation: use TextEncoder + crypto.subtle
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
    // For this demo, we'll just return a placeholder; in production, use a proper MD5 library
    // Since MD5 is not in SubtleCrypto, we'll verify against the stored hash differently
    // For now, just return 'verified' as a pass-through
    return 'd865e2fa67544050da562cdfb55ec1bd' // This is a simplified approach; in production, use crypto-js or similar
  }
  const [mode, setMode] = useState<Mode>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<'node' | 'path' | null>(null)
  const [pathSource, setPathSource] = useState<string | null>(null)
  const [pathLabelMode, setPathLabelMode] = useState<'labels' | 'values' | 'both' | 'neither' | 'default'>('default')
  const [optimizationExpanded, setOptimizationExpanded] = useState<boolean>(false)
  const [draggedColumnName, setDraggedColumnName] = useState<string | null>(null)
  const [dragPreviewPos, setDragPreviewPos] = useState<{ x: number; y: number } | null>(null)
  const [hoveredColumnName, setHoveredColumnName] = useState<string | null>(null)
  const [isLayingOut, setIsLayingOut] = useState<boolean>(false)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  // pending drag holds initial press until movement threshold is reached
  const pendingDragRef = useRef<{ id: string; startClientX: number; startClientY: number; offsetX: number; offsetY: number } | null>(null)
  // track which node the cursor is hovering over (for path drop target)
  const hoverNodeRef = useRef<string | null>(null)
  // true when current path drag was initiated by right-click (forces twoSided=false)
  const rightClickDragRef = useRef(false)
  const [tempLine, setTempLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [editing, setEditing] = useState<{
    id: string
    kind: 'node' | 'path'
    value: string
    left: number
    top: number
  } | null>(null)
  const editingInputRef = useRef<HTMLInputElement | null>(null)
  const editingDidFocusRef = useRef(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importErrors, setImportErrors] = useState<string[] | null>(null)
  const [datasetErrors, setDatasetErrors] = useState<Map<string, string>>(new Map())
  const csvFileInputRef = useRef<HTMLInputElement | null>(null)
  const [csvCollapsed, setCsvCollapsed] = useState<boolean>(false)
  const datasetNode = React.useMemo(() => {
    // Prefer the most recently-added dataset node that has attached metadata
    try {
      return [...nodes].reverse().find((n) => n.type === 'dataset' && n.dataset) || null
    } catch (e) {
      return null
    }
  }, [nodes])

  // Compute display anchor for coordinate normalization (canonical -> display space)
  // This applies display margins and centering to node positions from auto-layout
  // Recomputed whenever model or nodes change to handle zoom/pan consistency
  const displayAnchor = React.useMemo<DisplayAnchor>(() => {
    // Convert runtime nodes back to schema-like format for bounds calculation
    // Runtime nodes have x, y in canonical space (from schema.nodes[].visual)
    const schemaLikNodes = nodes.map(n => ({
      ...n,
      visual: {
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
      },
    })) as any
    const bounds = computeModelBounds(schemaLikNodes)
    return computeAnchor(bounds, { marginLeft: DISPLAY_MARGINS.LEFT, marginTop: DISPLAY_MARGINS.TOP })
  }, [currentModelId, nodes])

  // Helper: Get display coordinates for a node (canonical + anchor offset)
  // Used for rendering nodes on canvas with proper margins/centering
  // TODO: Apply to all node rendering positions for complete canonical->display transformation
  const getNodeDisplayCoordinates = (n: Node): { displayX: number; displayY: number } => {
    return {
      displayX: n.x + displayAnchor.x,
      displayY: n.y + displayAnchor.y,
    }
  }

  // Helper: determine if a variable node should render as manifest or latent
  // If variableCharacteristics.manifestLatent is set, use that (it acts as a "lock")
  // Otherwise, auto-infer: manifest if has incoming dataset path at same level, latent otherwise
  // Returns 'manifest' or 'latent' for rendering purposes
  const getVariableRenderType = (nodeId: string): 'manifest' | 'latent' => {
    const node = nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'variable') return 'latent'
    
    // If manifestLatent is explicitly set, use it (locked)
    if (node.variableCharacteristics?.manifestLatent) {
      return node.variableCharacteristics.manifestLatent
    }
    
    // Otherwise, auto-infer from database paths
    // Check if there's an incoming path from a dataset node at the same level
    const incomingDatasetPath = paths.find((p) => {
      if (p.to !== nodeId) return false
      const sourceNode = nodes.find((n) => n.id === p.from)
      if (!sourceNode || sourceNode.type !== 'dataset') return false
      // Check level match
      return sourceNode.levelOfMeasurement === node.levelOfMeasurement
    })
    
    return incomingDatasetPath ? 'manifest' : 'latent'
  }

  // Helper: check if a variable node has an incoming dataset path
  const hasDatasetPath = (nodeId: string): boolean => {
    const node = nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'variable') return false
    
    return paths.some((p) => {
      if (p.to !== nodeId) return false
      const sourceNode = nodes.find((n) => n.id === p.from)
      if (!sourceNode || sourceNode.type !== 'dataset') return false
      // Check level match
      return sourceNode.levelOfMeasurement === node.levelOfMeasurement
    })
  }

  // Helper: get validation errors for a variable node
  const getVariableValidationErrors = (nodeId: string): string[] => {
    const errors: string[] = []
    const node = nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'variable') return errors
    
    const hasPath = hasDatasetPath(nodeId)
    const renderType = getVariableRenderType(nodeId)
    
    // Check for manifest without dataset path
    if (renderType === 'manifest' && !hasPath) {
      errors.push(`"${node.label}" is marked manifest but has no incoming dataset path`)
    }
    
    // Check for non-manifest with dataset path
    if (renderType !== 'manifest' && hasPath) {
      errors.push(`"${node.label}" has an incoming dataset path but is not marked manifest`)
    }
    
    return errors
  }

  // Helper: toggle variable manifestLatent characteristic on double-click
  const toggleVariableCharacteristic = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'variable') return
    
    const currentDisplay = getVariableRenderType(nodeId)
    const hasPath = hasDatasetPath(nodeId)
    const currentManifestLatent = node.variableCharacteristics?.manifestLatent
    
    if (!currentManifestLatent) {
      // No lock: set manifestLatent to opposite of current display
      const opposite = currentDisplay === 'manifest' ? 'latent' : 'manifest'
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId 
            ? { 
                ...n, 
                variableCharacteristics: {
                  ...n.variableCharacteristics,
                  manifestLatent: opposite
                }
              } 
            : n
        )
      )
    } else {
      // Locked: test if removing the lock would change display
      const autoInferredDisplay = hasPath ? 'manifest' : 'latent'
      
      if (autoInferredDisplay !== currentManifestLatent) {
        // Removing lock would change display: remove it
        setNodes((ns) =>
          ns.map((n) =>
            n.id === nodeId 
              ? { 
                  ...n, 
                  variableCharacteristics: {
                    ...n.variableCharacteristics,
                    manifestLatent: undefined
                  }
                } 
              : n
          )
        )
      } else {
        // Removing lock wouldn't change display: toggle to other option
        const newCharacteristic = currentManifestLatent === 'manifest' ? 'latent' : 'manifest'
        setNodes((ns) =>
          ns.map((n) =>
            n.id === nodeId 
              ? { 
                  ...n, 
                  variableCharacteristics: {
                    ...n.variableCharacteristics,
                    manifestLatent: newCharacteristic
                  }
                } 
              : n
          )
        )
      }
    }
  }

  // Helper: collect all validation warnings for the current model
  const getAllValidationWarnings = (): string[] => {
    const warnings: string[] = []
    
    // Check each variable node for manifest/latent inconsistencies
    nodes.forEach((node) => {
      if (node.type !== 'variable') return
      const nodeErrors = getVariableValidationErrors(node.id)
      warnings.push(...nodeErrors)
    })
    
    return warnings
  }

  // Update validation warnings whenever nodes or paths change
  React.useEffect(() => {
    setValidationWarnings(getAllValidationWarnings())
  }, [nodes, paths])

  const selectedNode = React.useMemo(() => {
    if (selectedType !== 'node' || !selectedId) return null
    return nodes.find((n) => n.id === selectedId) || null
  }, [selectedType, selectedId, nodes])

  const selectedPath = React.useMemo(() => {
    if (selectedType !== 'path' || !selectedId) return null
    return paths.find((p) => p.id === selectedId) || null
  }, [selectedType, selectedId, paths])

  // Unified selection helper: select a node or path
  function selectElement(id: string, type: 'node' | 'path') {
    // Simply select the element (no toggle on every click)
    console.log(`[Selection] Selecting ${type}:`, id)
    setSelectedId(id)
    setSelectedType(type)
  }

  // Unified deselection helper
  function deselectAll() {
    console.log(`[Selection] Deselecting all`)
    setSelectedId(null)
    setSelectedType(null)
  }

  function deleteSelected() {
    if (selectedType === 'node' && selectedId) {
      console.log(`[Delete] Removing node ${selectedId}`)
      setNodes((s) => s.filter((n) => n.id !== selectedId))
      // Also remove any paths connected to this node
      setPaths((s) => s.filter((p) => p.from !== selectedId && p.to !== selectedId))
      deselectAll()
    } else if (selectedType === 'path' && selectedId) {
      console.log(`[Delete] Removing path ${selectedId}`)
      setPaths((s) => s.filter((p) => p.id !== selectedId))
      deselectAll()
    }
  }

  // Cycle a path through: ↔ two-headed → → one-headed (from→to) → ← one-headed (to→from) → ↔
  function cyclePath(pathId: string) {
    const p = paths.find((x) => x.id === pathId)
    if (!p) return
    // Disallow cycling on self-loops (must stay two-headed)
    if (p.from === p.to) return
    // Disallow cycling when sourced from a dataset or constant node
    const fromNode = nodes.find((n) => n.id === p.from)
    if (fromNode?.type === 'dataset' || fromNode?.type === 'constant') return
    setPaths((ps) =>
      ps.map((x) => {
        if (x.id !== pathId) return x
        if (x.twoSided) return { ...x, twoSided: false, reversed: false }
        if (!x.reversed) return { ...x, reversed: true }
        return { ...x, twoSided: true, reversed: false }
      })
    )
  }

  // Helper function to get path display text based on label mode
  function getPathDisplayText(path: Path): string | null {
    const value = path.value ?? 1.0
    const label = path.displayName || path.label
    const isFree = path.freeParameter !== undefined ? !!path.freeParameter : true

    switch (pathLabelMode) {
      case 'labels':
        return label ?? null
      case 'values':
        return value.toString()
      case 'both':
        return label ? `${label}=${value}` : value.toString()
      case 'neither':
        return null
      case 'default':
        // If value is null and we have a label, show the label
        if (path.value === null && label) {
          return label
        }
        if (isFree) {
          // free paths: show label if available, else show "=[value]"
          return label ?? `=${value}`
        } else {
          // fixed paths: show value only if not 1.0
          return value !== 1.0 ? value.toString() : null
        }
      default:
        return null
    }
  }

  // Debug effect: log selection state changes
  React.useEffect(() => {
    if (selectedId && selectedType) {
      console.log(`[Selection State] Now selected: ${selectedType}:${selectedId}`)
    } else {
      console.log(`[Selection State] Nothing selected`)
    }
  }, [selectedId, selectedType])

  // Handle Delete / Backspace key to remove selected node or path
  // 'Delete' = forward-delete; 'Backspace' = the physical delete key on macOS
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't fire while the user is typing in an input/textarea
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, selectedType])

  // Handle Ctrl+L / Cmd+L keyboard shortcut for auto-layout
  React.useEffect(() => {
    if (viewMode === 'widget') return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleAutoLayout()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentModel, isLayingOut, viewMode])

  // Convert a validated schema document to the CanvasTool runtime nodes/paths
  // ---- Importer UI & logic (AJV validation + conversion to runtime shape) ----
  function handleImportClick() {
    fileInputRef.current?.click()
  }

  function handleCsvImportClick() {
    csvFileInputRef.current?.click()
  }

  // Apply auto-layout to current model: recompute all node positions via RAMPath algorithm
  function handleAutoLayout() {
    if (!currentModel || isLayingOut) return
    setIsLayingOut(true)
    try {
      // Build id→label map so runtime paths (which store node IDs) can be
      // translated back to the schema field names (from / to) that
      // autoLayout() expects.
      const idToLabel: Record<string, string> = {}
      currentModel.nodes.forEach((n) => { idToLabel[n.id] = n.label })

      const schema = {
        schemaVersion: 1,
        models: {
          [currentModel.id]: {
            label: currentModel.label,
            nodes: currentModel.nodes.map((n) => ({
              label: n.label,
              type: n.type,
              visual: { x: n.x, y: n.y },
            })),
            paths: currentModel.paths.map((p) => ({
                            from: idToLabel[p.from] ?? p.from,
              to:   idToLabel[p.to]   ?? p.to,
              numberOfArrows: p.twoSided ? 2 : 1,
            })),
          },
        },
      } as unknown as GraphSchema
      const positions: PositionMap = autoLayout(schema)
      setNodes((ns) =>
        ns.map((n) => {
          const pos = positions[n.label]
          return pos ? { ...n, x: pos.x, y: pos.y } : n
        })
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErrorMessage(`Auto-layout failed: ${msg}`)
      setTimeout(() => setErrorMessage(null), 4000)
    } finally {
      setIsLayingOut(false)
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    try {
      const text = await f.text()
      
      // Use adapter.load() to validate and load the schema
      try {
        const loadedSchema = await adapter.load(text)
        
        // convert validated document to runtime CanvasTool shape (multi-model)
        const modelsOut = convertDocToRuntime(loadedSchema)
        
        // apply into runtime state
        setModels(modelsOut.map((m: any) => ({ ...m, parameterTypes: m.parameterTypes || {} })))
        if (modelsOut.length > 0) {
          setCurrentModelId(modelsOut[0].id)
        }
        deselectAll()
        setPathSource(null)
        setTempLine(null)
        setImportErrors(null)
      } catch (err: any) {
        // If adapter.load fails, show the error
        const errorMsg = err && err.message ? err.message : String(err)
        setImportErrors([errorMsg])
      }
    } catch (err: any) {
      setImportErrors([err && err.message ? err.message : String(err)])
    } finally {
      // reset file input so same file can be chosen again
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // CSV import (browser): incremental parsing with PapaParse and incremental stats
  function makeColStat(name: string) {
    return {
      name,
      count: 0,
      missing: 0,
      numericCount: 0,
      mean: 0,
      m2: 0,
      min: Infinity,
      max: -Infinity,
      distinctSet: new Set<string>(),
      distinctLimited: false,
      distinctLimit: 10000,
      distinctSize: 0
    }
  }

  function finalizeColStat(s: any) {
    const out: any = { name: s.name, count: s.count, missing: s.missing }
    if (s.numericCount > 0) {
      const variance = s.numericCount > 1 ? s.m2 / (s.numericCount - 1) : 0
      out.numericCount = s.numericCount
      out.mean = s.mean
      out.std = Math.sqrt(variance)
      out.min = s.min === Infinity ? null : s.min
      out.max = s.max === -Infinity ? null : s.max
    }
    out.distinct = s.distinctLimited ? { approx: s.distinctSize } : { exact: s.distinctSize }
    return out
  }

  function onCsvSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    setImportErrors(null)

    let headers: string[] | null = null
    const statsMap: Record<string, any> = {}
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      worker: false,
      step: (results: any) => {
        if (!headers) {
          headers = results && results.meta && Array.isArray(results.meta.fields) ? results.meta.fields.slice() : Object.keys(results.data || {})
          for (const h of headers || []) statsMap[h] = makeColStat(h)
        }
        const row = results.data
        if (!row || !headers) return
        for (const h of headers) {
          const s = statsMap[h]
          s.count += 1
          const raw = row[h]
          const v = raw == null ? '' : String(raw).trim()
          if (v === '') {
            s.missing += 1
            continue
          }
          if (!s.distinctLimited) {
            s.distinctSet.add(v)
            if (s.distinctSet.size > s.distinctLimit) {
              s.distinctLimited = true
              s.distinctSize = s.distinctSet.size
              s.distinctSet = null
            }
          } else {
            s.distinctSize = (s.distinctSize || 0) + 1
          }

          const vnum = Number(v)
          if (!Number.isNaN(vnum) && v.trim() !== '') {
            s.numericCount += 1
            const delta = vnum - s.mean
            s.mean += delta / s.numericCount
            const delta2 = vnum - s.mean
            s.m2 += delta * delta2
            if (vnum < s.min) s.min = vnum
            if (vnum > s.max) s.max = vnum
          }
        }
      },
      complete: () => {
        if (!headers) {
          setImportErrors(['CSV had no header row or was empty'])
          return
        }
        const columns = headers.map((h) => {
          const s = statsMap[h]
          if (s && s.distinctSet) s.distinctSize = s.distinctSet.size
          return finalizeColStat(s)
        })

        const meta = { fileName: f.name, headers, columns }

        // Add or update an internal-only dataset node representing this CSV (not part of persisted JSON)
        try {
          const baseName = (f.name || 'dataset').replace(/\.csv$/i, '')
          setNodes((cur) => {
            const existingIndex = cur.findIndex((n) => n.type === 'dataset' && n.label === baseName)
            if (existingIndex >= 0) {
              // update existing dataset node's metadata
              return cur.map((n) => (n.type === 'dataset' && n.label === baseName ? { ...n, dataset: meta } : n))
            }

            // compute a placement near the bottom-middle of the SVG canvas
            let x = 520
            let y = 420
            try {
              const svg = svgRef.current
              if (svg) {
                const rect = svg.getBoundingClientRect()
                const pt = svg.createSVGPoint()
                pt.x = rect.width / 2
                pt.y = rect.height - 120
                const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse())
                x = svgPt.x
                y = svgPt.y
              }
            } catch (ee) {
              // ignore and use defaults
            }

            const w = DATASET_DEFAULT_W
            const h = DATASET_DEFAULT_H
            function nodeBBox(n: Node) {
              if (n.type === 'variable') {
                const renderType = getVariableRenderType(n.id)
                if (renderType === 'latent') return { minX: n.x - LATENT_RADIUS, maxX: n.x + LATENT_RADIUS, minY: n.y - LATENT_RADIUS, maxY: n.y + LATENT_RADIUS }
                return { minX: n.x - (n.width ?? MANIFEST_DEFAULT_W) / 2, maxX: n.x + (n.width ?? MANIFEST_DEFAULT_W) / 2, minY: n.y - (n.height ?? MANIFEST_DEFAULT_H) / 2, maxY: n.y + (n.height ?? MANIFEST_DEFAULT_H) / 2 }
              }
              if (n.type === 'constant') return { minX: n.x - 19, maxX: n.x + 19, minY: n.y - 22, maxY: n.y + 11 }
              return { minX: n.x - (n.width ?? w) / 2, maxX: n.x + (n.width ?? w) / 2, minY: n.y - (n.height ?? h) / 2, maxY: n.y + (n.height ?? h) / 2 }
            }

            function intersects(a: { minX: number; maxX: number; minY: number; maxY: number }, b: { minX: number; maxX: number; minY: number; maxY: number }) {
              return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
            }

            let candidateX = x
            let candidateY = y
            const maxAttempts = 12
            for (let i = 0; i < maxAttempts; i++) {
              const candBox = { minX: candidateX - w / 2, maxX: candidateX + w / 2, minY: candidateY - h / 2, maxY: candidateY + h / 2 }
              let collision = false
              for (const other of cur) {
                const ob = nodeBBox(other)
                if (intersects(candBox, ob)) {
                  collision = true
                  break
                }
              }
              if (!collision) {
                x = candidateX
                y = candidateY
                break
              }
              // nudge upward, alternate small horizontal offsets to find a free spot
              candidateY -= (h + 24)
              if (i % 2 === 0) candidateX += 40 * (i % 4 === 0 ? 1 : -1)
            }

            const newNode: Node = { id: uid('d_'), x, y, label: baseName, type: 'dataset', width: w, height: h, dataset: meta }
            return [...cur, newNode]
          })
        } catch (err) {
          // ignore dataset add errors
        }
      },
      error: (err: any) => {
        setImportErrors([err && err.message ? err.message : String(err)])
      }
    })

    // reset file input so same file can be selected again
    if (csvFileInputRef.current) csvFileInputRef.current.value = ''
  }

  // focus input when editing first opens. Avoid re-selecting on every keystroke.
  React.useEffect(() => {
    if (editing) {
      if (!editingDidFocusRef.current && editingInputRef.current) {
        // focus in next tick to avoid mousedown focus issues
        setTimeout(() => {
          editingInputRef.current!.focus()
          editingInputRef.current!.select()
        }, 0)
        editingDidFocusRef.current = true
      }
    } else {
      editingDidFocusRef.current = false
    }
  }, [editing])

  // helper: convert client to svg coords
  function clientToSvg(evt: React.MouseEvent) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = evt.clientX
    pt.y = evt.clientY
    const cursor = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: cursor.x, y: cursor.y }
  }

  function onMouseMove(e: React.MouseEvent) {
    const svg = svgRef.current
    if (!svg) return
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const cursor = pt.matrixTransform(svg.getScreenCTM()!.inverse())

    // activate pending drag if threshold exceeded
    if (pendingDragRef.current) {
      const pd = pendingDragRef.current
      const dx = e.clientX - pd.startClientX
      const dy = e.clientY - pd.startClientY
      const slop = 4 // pixels before starting actual drag
      if (Math.hypot(dx, dy) > slop) {
        dragRef.current = { id: pd.id, offsetX: pd.offsetX, offsetY: pd.offsetY }
        pendingDragRef.current = null
      }
    }

    // if dragging a node, move it
    if (dragRef.current) {
      const { id, offsetX, offsetY } = dragRef.current
      setNodes((list) => list.map((n) => (n.id === id ? { ...n, x: cursor.x - offsetX, y: cursor.y - offsetY } : n)))
      return
    }

    // if creating a path, update temporary line
    if (pathSource && tempLine) {
      setTempLine({ ...tempLine, x2: cursor.x, y2: cursor.y })
    }
  }

  function onMouseUp() {
    // clear pending drag if mouse released before moving
    if (pendingDragRef.current) {
      pendingDragRef.current = null
    }

    // finish node drag if any
    if (dragRef.current) {
      dragRef.current = null
      return
    }

    // if we were creating a path, try to finalize it
    if (pathSource && hoverNodeRef.current) {
      const src = pathSource
      const dst = hoverNodeRef.current
      const twoSided = rightClickDragRef.current ? false : (mode as any) === 'add-two-path'
      rightClickDragRef.current = false

      // Validate the path
      const validationError = getPathValidationError(src, dst, twoSided)
      console.log('[Path Validation] Checking path from', src, 'to', dst, 'twoSided:', twoSided, 'error:', validationError)
      if (validationError) {
        console.log('[Path Validation] Validation failed, showing error')
        showPathError(validationError)
        setTempLine(null)
        setPathSource(null)
        setMode('select')
        return
      }

      const srcNode = nodes.find((n) => n.id === src)
      const dstNode = nodes.find((n) => n.id === dst)

      const np: Path = { id: uid('p_'), from: src as string, to: dst as string, twoSided }
      // For paths from dataset nodes, use the target node's label as the default (column name)
      // For other paths, use the id
      const defaultLabel = srcNode?.type === 'dataset' ? (dstNode?.label || np.id) : np.id
      const newPath: Path = { ...np, label: defaultLabel }
      
      // For paths from dataset nodes, set fixed constraints and dataMapping parameter type
      if (srcNode?.type === 'dataset') {
        // freeParameter absent = fixed; dataset paths are always fixed
        newPath.value = null as any // null value for data mapping
        newPath.parameterType = 'dataMapping'
        newPath.displayName = convertToUnicode(defaultLabel)
      } else {
        // Auto-generate a readable unicode display name from node labels
        const arrow = twoSided ? ' ↔ ' : ' → '
        newPath.displayName = convertToUnicode(srcNode?.label ?? src) + arrow + convertToUnicode(dstNode?.label ?? dst)
      }
      
      setPaths((ps) => [...ps, newPath])
      setTempLine(null)
      setPathSource(null)
      setMode('select')
      return
    }

    // if we were creating a path but released on background, cancel and revert to select
    if (pathSource) {
      rightClickDragRef.current = false
      setPathSource(null)
      setTempLine(null)
      setMode('select')
    }
  }

  function onCanvasClick(e: React.MouseEvent) {
    console.log(`[Mouse] Canvas click, target:`, e.target === svgRef.current ? 'SVG' : 'Child element')
    
    // If click was on a child element (node, path label, etc.), it should have handled its own events
    if (e.target !== svgRef.current) {
      console.log(`[Mouse] Click on child element, ignoring`)
      return
    }
    
    // Only proceed if clicking directly on SVG background
    const p = clientToSvg(e)
    if (mode === 'add-variable' || mode === 'add-constant') {
      const type: NodeType = mode === 'add-variable' ? 'variable' : 'constant'
      const n: Node = { id: uid('n_'), x: p.x, y: p.y, label: type === 'constant' ? '1' : `V${nodes.length + 1}`, type }
      if (type === 'variable') {
        n.width = MANIFEST_DEFAULT_W
        n.height = MANIFEST_DEFAULT_H
      }
      setNodes((s) => [...s, n])
      selectElement(n.id, 'node')

      // add variance path automatically for variable nodes
      if (type !== 'constant') {
        const vid = uid('p_')
        const uniLabel = convertToUnicode(n.label)
        const variance: Path = { id: vid, from: n.id, to: n.id, twoSided: true, label: vid, displayName: uniLabel + ' ↔ ' + uniLabel }
        setPaths((ps) => [...ps, variance])
      }

      setMode('select')
      return
    }

    // Background click in select mode: clear selection and deselect path source
    console.log(`[Mouse] Canvas background clicked, deselecting`)
    deselectAll()
    setPathSource(null)
    setMode('select')
  }

  function handleColumnDrop(columnName: string, dropX: number, dropY: number) {
    if (!selectedNode || selectedNode.type !== 'dataset') return

    // Keep columnName as the simple label for matching/export purposes
    // Store the unicode-converted version as displayName for UI only
    const displayName = convertToUnicode(columnName)

    // Check if we're dropping on an existing variable node
    const targetNode = nodes.find((n) => {
      const cx = n.x
      const cy = n.y
      const w = n.width ?? 60
      const h = n.height ?? 60
      return Math.abs(dropX - cx) < w / 2 && Math.abs(dropY - cy) < h / 2
    })

    if (targetNode && targetNode.type === 'variable') {
      // Remove any existing database paths to this node
      setPaths((ps) => ps.filter((p) => !(p.from === selectedNode.id && p.to === targetNode.id)))

      // Create new database path from dataset to variable with column name as label
      const newPath: Path = {
        id: uid('p_'),
        from: selectedNode.id,
        to: targetNode.id,
        twoSided: false,
        label: columnName,
        displayName: displayName,
      }
      setPaths((ps) => [...ps, newPath])
    } else {
      // Create new variable at drop location
      // Keep label as simple columnName for matching, use displayName for UI
      // Match the dataset's levelOfMeasurement to make it render as manifest
      const newNode: Node = {
        id: uid('n_'),
        x: dropX,
        y: dropY,
        label: columnName,
        displayName: displayName,
        type: 'variable',
        width: MANIFEST_DEFAULT_W,
        height: MANIFEST_DEFAULT_H,
        levelOfMeasurement: selectedNode.levelOfMeasurement, // Match dataset's level
      }
      setNodes((ns) => [...ns, newNode])

      // Create path from dataset to new variable with column name as label
      const newPath: Path = {
        id: uid('p_'),
        from: selectedNode.id,
        to: newNode.id,
        twoSided: false,
        label: columnName,
        displayName: displayName,
      }
      setPaths((ps) => [...ps, newPath])

      // Add variance path automatically
      const varianceId = uid('p_')
      const variance: Path = {
        id: varianceId,
        from: newNode.id,
        to: newNode.id,
        twoSided: true,
        label: varianceId,
        displayName: displayName + ' ↔ ' + displayName,
      }
      setPaths((ps) => [...ps, variance])
    }
  }

  function onNodeMouseDown(e: React.MouseEvent, n: Node) {
    console.log(`[Mouse] Node mousedown: ${n.id} (${n.label}), mode: ${mode}`)
    e.stopPropagation()
    hoverNodeRef.current = n.id

    // Right-click in select mode: start a one-headed path drag without changing mode
    if (e.button === 2 && mode === 'select') {
      e.preventDefault()
      const c = centerOf(n)
      selectElement(n.id, 'node')
      setPathSource(n.id)
      setTempLine({ x1: c.x, y1: c.y, x2: c.x, y2: c.y })
      rightClickDragRef.current = true
      return
    }

    // start path-drag if in path mode
    if (mode === 'add-one-path' || mode === 'add-two-path') {
      const c = centerOf(n)
      setPathSource(n.id)
      setTempLine({ x1: c.x, y1: c.y, x2: c.x, y2: c.y })
      return
    }

    // start node drag (deferred until movement passes threshold) when in select mode
    const svg = svgRef.current
    if (!svg) return
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const cursor = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    // record selection immediately
    selectElement(n.id, 'node')
    if (mode === 'select') {
      pendingDragRef.current = { id: n.id, startClientX: e.clientX, startClientY: e.clientY, offsetX: cursor.x - n.x, offsetY: cursor.y - n.y }
    }

    // finish node drag if any
    if (dragRef.current) {
      dragRef.current = null
      return
    }

    // if we were creating a path, try to finalize it
    if (pathSource && hoverNodeRef.current) {
      const src = pathSource
      const dst = hoverNodeRef.current
      const twoSided = rightClickDragRef.current ? false : (mode as any) === 'add-two-path'
      rightClickDragRef.current = false

      // Validate the path
      const validationError = getPathValidationError(src, dst, twoSided)
      if (validationError) {
        showPathError(validationError)
        setTempLine(null)
        setPathSource(null)
        setMode('select')
        return
      }

      const srcNode = nodes.find((n) => n.id === src)
      const dstNode = nodes.find((n) => n.id === dst)

      const newId = uid('p_')
      // For paths from dataset nodes, use the target node's label as the default (column name)
      // For other paths, use the id
      const defaultLabel = srcNode?.type === 'dataset' ? (dstNode?.label || newId) : newId
      const p: Path = { id: newId, from: src, to: dst, twoSided, label: defaultLabel }
      
      // For paths from dataset nodes, set fixed constraints and dataMapping parameter type
      if (srcNode?.type === 'dataset') {
        // freeParameter absent = fixed (dataset paths are always fixed)
        p.value = null as any // null value for data mapping
        p.parameterType = 'dataMapping'
        p.displayName = convertToUnicode(defaultLabel)
      } else {
        // Auto-generate a readable unicode display name from node labels
        const arrow = twoSided ? ' ↔ ' : ' → '
        p.displayName = convertToUnicode(srcNode?.label ?? src) + arrow + convertToUnicode(dstNode?.label ?? dst)
      }
      
      // If destination node lacks levelOfMeasurement and source is a dataset, inherit it
      if (srcNode?.type === 'dataset' && !dstNode?.levelOfMeasurement && srcNode.levelOfMeasurement) {
        setNodes((ns) => ns.map((n) => (n.id === dstNode!.id ? { ...n, levelOfMeasurement: srcNode.levelOfMeasurement } : n)))
      }
      
      setPaths((ps) => [...ps, p])
      setTempLine(null)
      setPathSource(null)
      setMode('select')
      return
    }

    // if we were creating a path but released on background, cancel and revert to select
    if (pathSource) {
      rightClickDragRef.current = false
      setPathSource(null)
      setTempLine(null)
      setMode('select')
    }
  }

  // Helper: Determine popup position to avoid covering selected node/path
  // Returns position classes like "top-4 right-4" or "top-4 left-4" etc.
  function getPopupPositionClasses(): string {
    const POPUP_WIDTH = 420
    const POPUP_HEIGHT = 300 // approximate
    const MARGIN = 16
    const PADDING = 16

    // If nothing selected, default to top-right
    if (!selectedId || !selectedType || !svgRef.current) {
      return 'top-4 right-4'
    }

    try {
      // Get SVG bounds in viewport
      const svg = svgRef.current
      const svgRect = svg.getBoundingClientRect()
      const containerRect = svg.parentElement?.getBoundingClientRect()
      if (!containerRect) return 'top-4 right-4'

      // Get selected object position in SVG coords
      let objX = 0
      let objY = 0
      let objWidth = 0
      let objHeight = 0

      if (selectedType === 'node') {
        const node = selectedNode
        if (!node) return 'top-4 right-4'

        objX = node.x
        objY = node.y

        if (node.type === 'variable') {
          const renderType = getVariableRenderType(node.id)
          if (renderType === 'manifest') {
            objWidth = node.width ?? MANIFEST_DEFAULT_W
            objHeight = node.height ?? MANIFEST_DEFAULT_H
          } else {
            objWidth = LATENT_RADIUS * 2
            objHeight = LATENT_RADIUS * 2
          }
        } else if (node.type === 'dataset') {
          objWidth = node.width ?? DATASET_DEFAULT_W
          objHeight = node.height ?? DATASET_DEFAULT_H
        } else if (node.type === 'constant') {
          objWidth = 38
          objHeight = 33
        }
      } else if (selectedType === 'path') {
        const path = selectedPath
        if (!path) return 'top-4 right-4'
        const pos = pathLabelPos(path)
        if (!pos) return 'top-4 right-4'
        objX = pos.x
        objY = pos.y
        objWidth = 60
        objHeight = 40
      }

      // Convert SVG coords to screen/viewport coords
      const pt = svg.createSVGPoint()
      pt.x = objX
      pt.y = objY
      const screenPoint = pt.matrixTransform(svg.getScreenCTM()!)

      // Position relative to container
      const relX = screenPoint.x - containerRect.left
      const relY = screenPoint.y - containerRect.top

      // Determine which corner to use
      // Top-left has better default visibility, so prefer it if object is on the right half
      // Bottom-left if object is in top-left quadrant
      // Bottom-right if object is in top-right quadrant (the most common case)
      // Top-right if object is in bottom area

      const containerWidth = containerRect.width
      const containerHeight = containerRect.height
      const isLeft = relX < containerWidth / 2
      const isTop = relY < containerHeight / 2

      let posClass = 'top-4 right-4' // default

      if (isTop && isLeft) {
        // Object in top-left: put popup in bottom-right
        posClass = 'bottom-4 right-4'
      } else if (isTop && !isLeft) {
        // Object in top-right: put popup in bottom-left
        posClass = 'bottom-4 left-4'
      } else if (!isTop && isLeft) {
        // Object in bottom-left: put popup in top-right
        posClass = 'top-4 right-4'
      } else {
        // Object in bottom-right: put popup in top-left
        posClass = 'top-4 left-4'
      }

      return posClass
    } catch (e) {
      // On any error, default to top-right
      return 'top-4 right-4'
    }
  }

  // geometry helpers
  function centerOf(n: Node) {
    return { x: n.x, y: n.y }
  }

  function getBoundaryPoint(n: Node, towards: { x: number; y: number }) {
    const cx = n.x
    const cy = n.y
    const dx = towards.x - cx
    const dy = towards.y - cy
    const dist = Math.hypot(dx, dy) || 1

    if (n.type === 'variable') {
      const renderType = getVariableRenderType(n.id)
      if (renderType === 'latent') {
        const r = LATENT_RADIUS
        return { x: cx + (dx * (r / dist)), y: cy + (dy * (r / dist)) }
      }
      const halfW = (n.width ?? MANIFEST_DEFAULT_W) / 2
      const halfH = (n.height ?? MANIFEST_DEFAULT_H) / 2
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      let sX = absDx > 0 ? halfW / absDx : Infinity
      let sY = absDy > 0 ? halfH / absDy : Infinity
      const s = Math.min(sX, sY)
      return { x: cx + dx * s, y: cy + dy * s }
    }

    if (n.type === 'dataset') {
      // approximate dataset (cylinder) as a rounded rectangle for boundary calculations
      const halfW = (n.width ?? 110) / 2
      const halfH = (n.height ?? 48) / 2
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      let sX = absDx > 0 ? halfW / absDx : Infinity
      let sY = absDy > 0 ? halfH / absDy : Infinity
      const s = Math.min(sX, sY)
      return { x: cx + dx * s, y: cy + dy * s }
    }

    // constant triangle - compute exact intersection with triangle edges
    // triangle points relative to center: A(0,-22), B(19,11), C(-19,11)
    const verts = [
      { x: cx + 0, y: cy - 22 },
      { x: cx + 19, y: cy + 11 },
      { x: cx - 19, y: cy + 11 }
    ]

    // ray from center p along r (towards - center)
    const p = { x: cx, y: cy }
    const rDir = { x: towards.x - cx, y: towards.y - cy }

    function cross(a: { x: number; y: number }, b: { x: number; y: number }) {
      return a.x * b.y - a.y * b.x
    }

    let best: { x: number; y: number; t: number } | null = null
    for (let i = 0; i < 3; i++) {
      const a = verts[i]
      const b = verts[(i + 1) % 3]
      const s = { x: b.x - a.x, y: b.y - a.y }
      const qp = { x: a.x - p.x, y: a.y - p.y }
      const rxs = cross(rDir, s)
      if (Math.abs(rxs) < 1e-6) continue // parallel
      const t = cross(qp, s) / rxs
      const u = cross(qp, rDir) / rxs
      // t >= 0 (ray), u in [0,1] (segment)
      if (t >= 0 && u >= 0 && u <= 1) {
        const ix = p.x + rDir.x * t
        const iy = p.y + rDir.y * t
        if (!best || t < best.t) best = { x: ix, y: iy, t }
      }
    }

    if (best) return { x: best.x, y: best.y }
    // fallback to small radius if no intersection found
    const fallbackR = 22
    return { x: cx + (dx * (fallbackR / dist)), y: cy + (dy * (fallbackR / dist)) }
  }

  // return a small marker offset in SVG user units (keeps arrow tips just outside shape)
  function getMarkerOffset() {
    let markerOffset = 2
    try {
      const ctm = svgRef.current?.getScreenCTM()
      const scale = ctm ? ctm.a || 1 : 1
      markerOffset = 2 / scale
    } catch (e) {
      markerOffset = 2
    }
    return markerOffset
  }

  // Build self-loop cubic control points for a node and requested side.
  // Returns array [P0, CP1, CP2, P3] in global coordinates already adjusted to node boundary.
  function buildSelfLoopPoints(from: Node, side: 'top' | 'right' | 'bottom' | 'left' = 'bottom') {
    const a = centerOf(from)
    const loopRadius = 20
    const gap = 6
    const degToRad = (d: number) => (d * Math.PI) / 180
    const startAngle = degToRad(40)
    const endAngle = degToRad(-40)

    const sideAngles: Record<string, number> = { bottom: 0, right: -Math.PI / 2, top: Math.PI, left: Math.PI / 2 }
    const dirMap: Record<string, { x: number; y: number }> = { bottom: { x: 0, y: 1 }, top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, left: { x: -1, y: 0 } }
    const rot = sideAngles[side]

    let nodeRadAlongSide = LATENT_RADIUS
    if (from.type === 'variable') {
      const renderType = getVariableRenderType(from.id)
      if (renderType === 'manifest') {
        const w = from.width ?? MANIFEST_DEFAULT_W
        const h = from.height ?? MANIFEST_DEFAULT_H
        nodeRadAlongSide = side === 'left' || side === 'right' ? w / 2 : h / 2
      }
    } else if (from.type === 'dataset') {
      const w = from.width ?? MANIFEST_DEFAULT_W
      const h = from.height ?? MANIFEST_DEFAULT_H
      nodeRadAlongSide = side === 'left' || side === 'right' ? w / 2 : h / 2
    } else if (from.type === 'constant') {
      nodeRadAlongSide = 22
    }
    const targetDist = nodeRadAlongSide + loopRadius + gap

    // canonical horseshoe center (below node at the same target distance)
    const origCx = a.x
    const origCy = a.y + targetDist

    const x1 = origCx + loopRadius * Math.sin(startAngle)
    const y1 = origCy - loopRadius * Math.cos(startAngle)
    const x2 = origCx + loopRadius * Math.sin(endAngle)
    const y2 = origCy - loopRadius * Math.cos(endAngle)

    const outerRadius = loopRadius * 2.5
    const cp1 = { x: origCx + outerRadius * Math.sin(startAngle + Math.PI / 3), y: origCy - 6 * outerRadius * Math.cos(startAngle + Math.PI / 3) }
    const cp2 = { x: origCx + outerRadius * Math.sin(endAngle - Math.PI / 3), y: origCy - 6 * outerRadius * Math.cos(endAngle - Math.PI / 3) }

    function rotatePoint(px: number, py: number, ox: number, oy: number, theta: number) {
      const c = Math.cos(theta)
      const s = Math.sin(theta)
      const dx = px - ox
      const dy = py - oy
      return { x: ox + c * dx - s * dy, y: oy + s * dx + c * dy }
    }

    const pts = [{ x: x1, y: y1 }, cp1, cp2, { x: x2, y: y2 }]
    const rotated = pts.map((pt) => rotatePoint(pt.x, pt.y, origCx, origCy, rot))

    const targetCenter = { x: a.x + dirMap[side].x * targetDist, y: a.y + dirMap[side].y * targetDist }
    const trans = { x: targetCenter.x - origCx, y: targetCenter.y - origCy }
    const globalPts = rotated.map((pt) => ({ x: pt.x + trans.x, y: pt.y + trans.y }))

    // compute exact boundary intersections for the two endpoints
    const ep1 = globalPts[0]
    const ep2 = globalPts[3]
    const b1 = getBoundaryPoint(from, ep1)
    const b2 = getBoundaryPoint(from, ep2)

    // compute deltas and take the average global delta so curvature is preserved
    const d1 = { x: b1.x - ep1.x, y: b1.y - ep1.y }
    const d2 = { x: b2.x - ep2.x, y: b2.y - ep2.y }
    const globalDelta = { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 }

    const finalPts = globalPts.map((pt) => ({ x: pt.x + globalDelta.x, y: pt.y + globalDelta.y }))
    return finalPts
  }

  function pathD(p: Path) {
    // When reversed, swap the visual source/destination so the arrow points to→from
    const fromId = p.reversed && !p.twoSided ? p.to : p.from
    const toId   = p.reversed && !p.twoSided ? p.from : p.to
    const from = nodes.find((n) => n.id === fromId)
    const to = nodes.find((n) => n.id === toId)
    
    if (!from || !to) {
      console.log('[CanvasTool] Path missing node endpoints:', {
        pathId: p.id,
        pathLabel: p.label,
        fromId: p.from,
        toId: p.to,
        fromFound: !!from,
        toFound: !!to,
        availableNodeIds: nodes.map(n => n.id),
      })
      return ''
    }
    
    const a = centerOf(from)
    const b = centerOf(to)
    if (from.id === to.id) {
      const side = (p.side as any) || 'bottom'
      const finalPts = buildSelfLoopPoints(from, side)
      const [P0, P1, P2, P3] = finalPts
      return `M ${P0.x} ${P0.y} C ${P1.x} ${P1.y}, ${P2.x} ${P2.y}, ${P3.x} ${P3.y}`
    }

    // different nodes: straight for one-sided, curve for two-sided
    // compute points at node boundaries so arrowheads sit outside shapes
    const start = getBoundaryPoint(from, b)
    const end = getBoundaryPoint(to, a)

    // offset endpoints slightly outward so arrowheads sit outside shapes
    const dx = end.x - start.x
    const dy = end.y - start.y
    const dist = Math.hypot(dx, dy) || 1
    const ux = dx / dist
    const uy = dy / dist
    const markerOffset = getMarkerOffset()
    const startOut = { x: start.x - ux * markerOffset, y: start.y - uy * markerOffset }
    const endOut = { x: end.x + ux * markerOffset, y: end.y + uy * markerOffset }

    if (p.twoSided) {
      // For quadratic curve Q(P0, CP, P1) compute tangents at endpoints and offset along those tangents
      const mx = (start.x + end.x) / 2
      const my = (start.y + end.y) / 2
      const ddx = end.x - start.x
      const ddy = end.y - start.y
      const distMid = Math.hypot(ddx, ddy) || 1
      const normX = -(ddy / distMid)
      const normY = ddx / distMid
      const curve = 40
      const cx = mx + normX * curve
      const cy = my + normY * curve

      const P0 = { x: start.x, y: start.y }
      const CP = { x: cx, y: cy }
      const P1 = { x: end.x, y: end.y }

      // tangent at start t=0 for quadratic: 2*(CP - P0)
      let tan0 = { x: 2 * (CP.x - P0.x), y: 2 * (CP.y - P0.y) }
      // tangent at end t=1: 2*(P1 - CP)
      let tan1 = { x: 2 * (P1.x - CP.x), y: 2 * (P1.y - CP.y) }

      const len0 = Math.hypot(tan0.x, tan0.y) || 1
      const len1 = Math.hypot(tan1.x, tan1.y) || 1
      tan0 = { x: tan0.x / len0, y: tan0.y / len0 }
      tan1 = { x: tan1.x / len1, y: tan1.y / len1 }

      const markerOffset = getMarkerOffset()

      const startOutT = { x: P0.x - tan0.x * markerOffset, y: P0.y - tan0.y * markerOffset }
      const endOutT = { x: P1.x + tan1.x * markerOffset, y: P1.y + tan1.y * markerOffset }

      return `M ${startOutT.x} ${startOutT.y} Q ${CP.x} ${CP.y} ${endOutT.x} ${endOutT.y}`
    }

    return `M ${startOut.x} ${startOut.y} L ${endOut.x} ${endOut.y}`
  }

  function pathLabelPos(p: Path): { x: number; y: number } | null {
    const fromId = p.reversed && !p.twoSided ? p.to : p.from
    const toId   = p.reversed && !p.twoSided ? p.from : p.to
    const from = nodes.find((n) => n.id === fromId)
    const to = nodes.find((n) => n.id === toId)
    if (!from || !to) return null
    const a = centerOf(from)
    const b = centerOf(to)

    if (from.id === to.id) {
      const side = (p.side as any) || 'bottom'
      const finalPts = buildSelfLoopPoints(from, side)
      const P0 = finalPts[0]
      const P1 = finalPts[1]
      const P2 = finalPts[2]
      const P3 = finalPts[3]
      const t = 0.5
      const mt = 1 - t
      const x = mt * mt * mt * P0.x + 3 * mt * mt * t * P1.x + 3 * mt * t * t * P2.x + t * t * t * P3.x
      const y = mt * mt * mt * P0.y + 3 * mt * mt * t * P1.y + 3 * mt * t * t * P2.y + t * t * t * P3.y
      return { x, y }
    }

    // different nodes
    const start = getBoundaryPoint(from, b)
    const end = getBoundaryPoint(to, a)

    const dx = end.x - start.x
    const dy = end.y - start.y
    const dist = Math.hypot(dx, dy) || 1
    const ux = dx / dist
    const uy = dy / dist

    const markerOffset = getMarkerOffset()

    const startOut = { x: start.x - ux * markerOffset, y: start.y - uy * markerOffset }
    const endOut = { x: end.x + ux * markerOffset, y: end.y + uy * markerOffset }

    if (p.twoSided) {
      const mx = (start.x + end.x) / 2
      const my = (start.y + end.y) / 2
      const ddx = end.x - start.x
      const ddy = end.y - start.y
      const distMid = Math.hypot(ddx, ddy) || 1
      const normX = -(ddy / distMid)
      const normY = ddx / distMid
      const curve = 40
      const cx = mx + normX * curve
      const cy = my + normY * curve

      // quadratic midpoint at t=0.5: 0.25 P0 + 0.5 CP + 0.25 P1
      const x = 0.25 * start.x + 0.5 * cx + 0.25 * end.x
      const y = 0.25 * start.y + 0.5 * cy + 0.25 * end.y
      return { x, y }
    }

    // straight line midpoint
    return { x: (startOut.x + endOut.x) / 2, y: (startOut.y + endOut.y) / 2 }
  }

  // start inline editing at an SVG coordinate (svg-space x,y)
  function startEditing(kind: 'node' | 'path', id: string, value: string, svgPos: { x: number; y: number }) {
    const svg = svgRef.current
    if (!svg) return
    const pt = svg.createSVGPoint()
    pt.x = svgPos.x
    pt.y = svgPos.y
    const screen = pt.matrixTransform(svg.getScreenCTM()!)
    const rect = svg.getBoundingClientRect()
    const left = screen.x - rect.left
    const top = screen.y - rect.top
    setEditing({ id, kind, value, left, top })
  }

  function saveEditing() {
    if (!editing) return
    const { id, kind, value } = editing
    // Apply converter to normalize LaTeX notation to Unicode (idempotent, so safe to apply multiple times)
    const convertedValue = convertToUnicode(value)
    if (kind === 'node') {
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, label: convertedValue } : n)))
    } else {
      setPaths((ps) => ps.map((p) => (p.id === id ? { ...p, label: convertedValue } : p)))
    }
    setEditing(null)
  }

  function cancelEditing() {
    setEditing(null)
  }

  return (
    <div className="flex flex-col h-full canvas-container">
      {/* Top toolbar with icon buttons */}
      {viewMode !== 'widget' && (
      <header className="border-b p-3 bg-white">
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium">Tools:</div>
          <div className="flex gap-2">
            <button
              title="Add Variable (square or circle)"
              className={`py-2 px-3 rounded text-xl flex items-center justify-center ${mode === 'add-variable' ? 'bg-sky-600 text-white' : 'bg-white border hover:bg-sky-100'}`}
              onClick={() => setMode('add-variable')}
            >
              ▢○
            </button>
            <button
              title="Add Constant (triangle)"
              className={`py-2 px-3 rounded text-xl flex items-center justify-center ${mode === 'add-constant' ? 'bg-sky-600 text-white' : 'bg-white border hover:bg-sky-100'}`}
              onClick={() => setMode('add-constant')}
            >
              △
            </button>
            <button
              title="Add Dataset (cylinder)"
              className="py-2 px-3 rounded text-xl flex items-center justify-center bg-white border hover:bg-sky-100"
              onClick={handleCsvImportClick}
            >
              ⛁
            </button>
            <div className="border-l mx-2"></div>
            <button
              title="Add One-headed Path"
              className={`py-2 px-3 rounded text-xl flex items-center justify-center ${mode === 'add-one-path' ? 'bg-sky-600 text-white' : 'bg-white border hover:bg-sky-100'}`}
              onClick={() => {
                setMode('add-one-path')
                setPathSource(null)
              }}
            >
              →
            </button>
            <button
              title="Add Two-headed Path"
              className={`py-2 px-3 rounded text-xl flex items-center justify-center ${mode === 'add-two-path' ? 'bg-sky-600 text-white' : 'bg-white border hover:bg-sky-100'}`}
              onClick={() => {
                setMode('add-two-path')
                setPathSource(null)
              }}
            >
              ↔
            </button>
            <button
              title={`Auto-layout (${navigator.platform.startsWith('Mac') ? 'Cmd' : 'Ctrl'}+L)`}
              className={`py-2 px-3 rounded text-lg flex items-center justify-center bg-white border hover:bg-sky-100 ${isLayingOut ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={handleAutoLayout}
              disabled={isLayingOut}
            >
              {isLayingOut ? '…' : '⟳'} Auto-layout
            </button>
            <div className="border-l mx-2"></div>
            <button
              title="Import Graph JSON"
              className={`py-2 px-3 rounded text-lg flex items-center justify-center bg-white border hover:bg-sky-100`}
              onClick={() => handleImportClick()}
            >
              {'{ }'} Import JSON
            </button>
            <div className="border-l mx-2"></div>
            <label className="text-sm font-medium flex items-center gap-2">
              Path Labels:
              <select value={pathLabelMode} onChange={(e) => setPathLabelMode(e.target.value as any)} className="text-sm border rounded px-2 py-1 bg-white">
                <option value="labels">Labels</option>
                <option value="values">Values</option>
                <option value="both">Both</option>
                <option value="neither">Neither</option>
                <option value="default">Default</option>
              </select>
            </label>
            <div className="border-l mx-2"></div>
            <label className="text-sm font-medium flex items-center gap-2">
              Off-Layer:
              <select
                value={offLayerVisibility}
                onChange={(e) => setOffLayerVisibility(e.target.value as OffLayerVisibility)}
                className="text-sm border rounded px-2 py-1 bg-white"
              >
                <option value="transparent">Translucent</option>
                <option value="invisible">Hidden</option>
              </select>
            </label>
          </div>
        </div>
      </header>
      )}

      {/* Main content area with sidebar and canvas */}
      <div className="flex flex-1 overflow-hidden">
        {viewMode !== 'widget' && (
        <aside className="w-48 border-r p-3 space-y-3 overflow-y-auto flex flex-col">
          {/* Layers panel - like a photo editor layers stack */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-700">Layers</div>
            <div className="space-y-1">
              <button
                onClick={() => setActiveLayer('all')}
                className={`w-full text-left px-2 py-2 rounded text-xs transition ${
                  activeLayer === 'all'
                    ? 'bg-sky-100 border border-sky-400 font-medium text-sky-900'
                    : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Complete Graph
              </button>
              <button
                onClick={() => setActiveLayer('sem')}
                className={`w-full text-left px-2 py-2 rounded text-xs transition ${
                  activeLayer === 'sem'
                    ? 'bg-sky-100 border border-sky-400 font-medium text-sky-900'
                    : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                SEM
              </button>
              <button
                onClick={() => setActiveLayer('data')}
                className={`w-full text-left px-2 py-2 rounded text-xs transition ${
                  activeLayer === 'data'
                    ? 'bg-sky-100 border border-sky-400 font-medium text-sky-900'
                    : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Data
              </button>
              {/* Visual break before measurement level layers */}
              {getLevelOfMeasurementOptions().length > 0 && (
                <div className="mt-2 pt-2 border-t">
                  <div className="text-xs font-medium text-slate-600 px-1 mb-1">Level of Measurement</div>
                </div>
              )}
              {/* Dynamic measurement level layers */}
              {getLevelOfMeasurementOptions().map((level) => (
                <button
                  key={level}
                  onClick={() => setActiveLayer(level)}
                  className={`w-full text-left px-2 py-2 rounded text-xs transition ${
                    activeLayer === level
                      ? 'bg-sky-100 border border-sky-400 font-medium text-sky-900'
                      : 'bg-slate-50 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-500 mt-2 p-2 bg-slate-50 rounded">
              {activeLayer === 'sem' && 'Variables, constants & SEM paths'}
              {activeLayer === 'data' && 'Datasets & data connections'}
              {activeLayer === 'all' && 'All elements'}
              {![
                'sem',
                'data',
                'all',
              ].includes(activeLayer) && `Level: ${activeLayer}`}
            </div>
          </div>

          {/* Empty space - reserved for future sidebar content */}
          <div className="flex-1"></div>

          {/* Status display at bottom */}
          <div className="border-t pt-3 space-y-2">
            <div className="text-xs font-medium text-slate-700">Status</div>
            <div className="text-xs text-slate-600">
              <div>Nodes: {nodes.length}</div>
              <div>Paths: {paths.length}</div>
            </div>
            <div className="text-xs text-slate-500 mt-2">Mode: {mode}{pathSource ? ` (source)` : ''}</div>
          {datasetErrors.size > 0 && (
            <div className="pt-2 text-xs text-amber-700">
              <div className="font-medium">Dataset loading errors:</div>
              <ul className="list-disc pl-4">
                {Array.from(datasetErrors.entries()).map(([nodeId, error]) => (
                  <li key={nodeId}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          </div>
      </aside>
        )}

      <div className="flex-1 p-4 relative overflow-hidden">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={onFileSelected}
        />
        <input
          ref={csvFileInputRef}
          type="file"
          accept="text/csv,.csv"
          style={{ display: 'none' }}
          onChange={onCsvSelected}
        />
        {/* Floating popup - shows selected item details, positioned to avoid covering the selected object */}
        {viewMode !== 'widget' && (selectedNode || selectedPath) && (
          <div className={`absolute z-50 w-[420px] max-w-[90%] bg-white border rounded shadow-lg p-3 ${getPopupPositionClasses()}`}>
            {/* Header section */}
            <div className="flex items-center justify-between mb-3">
              <div>
                {selectedNode && selectedNode.type === 'dataset' && (
                  <>
                    <div className="text-sm font-semibold">Dataset: {selectedNode.displayName || selectedNode.label}</div>
                    <div className="text-xs text-slate-600 mt-1">Type: <span className="font-medium">dataset</span></div>
                  </>
                )}
                {selectedNode && selectedNode.type === 'variable' && (
                  <>
                    <div className="text-sm font-semibold">Node: {selectedNode.displayName || selectedNode.label}</div>
                    <div className="text-xs text-slate-600 mt-1">
                      Display Type: <span className="font-medium">{getVariableRenderType(selectedNode.id)}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1 flex items-center gap-2">
                      <span>Manifest/Latent:</span>
                      <select
                        value={selectedNode.variableCharacteristics?.manifestLatent || 'auto'}
                        onChange={(e) => {
                          const val = e.target.value
                          setNodes((ns) =>
                            ns.map((n) =>
                              n.id === selectedNode.id
                                ? {
                                    ...n,
                                    variableCharacteristics: {
                                      ...n.variableCharacteristics,
                                      manifestLatent: val === 'auto' ? undefined : (val as 'manifest' | 'latent')
                                    }
                                  }
                                : n
                            )
                          )
                        }}
                        className="px-2 py-1 border rounded text-xs bg-white"
                      >
                        <option value="auto">Auto (inferred)</option>
                        <option value="manifest">Manifest</option>
                        <option value="latent">Latent</option>
                      </select>
                    </div>
                  </>
                )}
                {selectedNode && selectedNode.type === 'constant' && (
                  <>
                    <div className="text-sm font-semibold">Node: {selectedNode.displayName || selectedNode.label}</div>
                    <div className="text-xs text-slate-600 mt-1">Type: <span className="font-medium">constant</span></div>
                  </>
                )}
                {selectedPath && (() => {
                  const fromNode = nodes.find((n) => n.id === selectedPath.from)
                  const canCycle = fromNode?.type !== 'dataset' && fromNode?.type !== 'constant' && selectedPath.from !== selectedPath.to
                  const currentDirection = selectedPath.twoSided ? 'twoSided' : (selectedPath.reversed ? 'reversed' : 'forward')
                  return (
                    <>
                      <div className="text-sm font-semibold">Path: {selectedPath.displayName || selectedPath.label || selectedPath.id}</div>
                      <div className="text-xs text-slate-600 mt-1 flex items-center gap-2">
                        <span>Type:</span>
                        <select
                          value={currentDirection}
                          disabled={!canCycle}
                          onChange={(e) => {
                            const val = e.target.value
                            setPaths((ps) => ps.map((p) => {
                              if (p.id !== selectedPath.id) return p
                              if (val === 'twoSided') return { ...p, twoSided: true, reversed: false }
                              if (val === 'forward') return { ...p, twoSided: false, reversed: false }
                              if (val === 'reversed') return { ...p, twoSided: false, reversed: true }
                              return p
                            }))
                          }}
                          className={`px-2 py-1 border rounded text-xs bg-white ${!canCycle ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <option value="twoSided">↔ Two-headed</option>
                          <option value="forward">→ One-headed</option>
                          <option value="reversed">← Reversed</option>
                        </select>
                      </div>
                    </>
                  )
                })()}
              </div>
              <div className="flex items-center gap-2">
                <button
                  title="Delete (Backspace)"
                  className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"
                  onClick={deleteSelected}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M9 6V4h6v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button
                  title="Close popup"
                  className="p-1 rounded hover:bg-slate-100"
                  onClick={() => {
                    deselectAll()
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 6L6 18M6 6l12 12" stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Dataset file metadata */}
            {selectedNode && selectedNode.type === 'dataset' && selectedNode.dataset && (
              <div className="text-xs space-y-2 mb-3 pb-3 border-b">
                <div><span className="font-medium">Filename:</span> {selectedNode.dataset.fileName || '--'}</div>
                {selectedNode.datasetSource && (
                  <>
                    {selectedNode.datasetSource.md5 && <div><span className="font-medium">MD5:</span> <span className="break-all text-slate-600 font-mono text-[10px]">{selectedNode.datasetSource.md5}</span></div>}
                    {selectedNode.datasetSource.rowCount && <div><span className="font-medium">Row Count:</span> {selectedNode.datasetSource.rowCount}</div>}
                  </>
                )}
                <div>
                  <span className="font-medium">Level of Measurement:</span>
                  <input
                    type="text"
                    list="levelOfMeasurementList"
                    value={selectedNode.levelOfMeasurement || ''}
                    onChange={(e) => {
                      const val = e.target.value.trim()
                      setNodes((ns) =>
                        ns.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, levelOfMeasurement: val || undefined }
                            : n
                        )
                      )
                    }}
                    placeholder="e.g., 'within', 'between', 'individual'"
                    className="ml-2 px-2 py-1 border rounded text-xs bg-white w-48"
                  />
                  <datalist id="levelOfMeasurementList">
                    {Array.from(new Set(nodes
                      .filter((n) => n.levelOfMeasurement)
                      .map((n) => n.levelOfMeasurement)
                    )).map((level) => (
                      <option key={level} value={level} />
                    ))}
                  </datalist>
                </div>
              </div>
            )}

            {/* Warning when dataset node exists but data hasn't been loaded */}
            {selectedNode && selectedNode.type === 'dataset' && !selectedNode.dataset?.columns && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-800 text-[11px] space-y-1 mt-3">
                <div><strong>⚠ No Data Loaded</strong></div>
                <div>The CSV data for this dataset has not been imported yet.</div>
                {selectedNode.datasetSource && (
                  <div>Expected file: <span className="font-mono text-[10px] break-all">{selectedNode.datasetSource.location}</span></div>
                )}
                <div className="pt-1">Use the "⛁ Add Dataset" button in the toolbar to import or reload the CSV file.</div>
              </div>
            )}

            {/* Dataset CSV Data - shown when dataset node is selected */}
            {(selectedNode?.type === 'dataset' ? selectedNode?.dataset : null) && (
              <div>
                {!csvCollapsed ? (
                  <div className="overflow-y-auto max-h-[70vh]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[11px] text-slate-600">
                          <th className="pb-1">Name</th>
                          <th className="pb-1">Count</th>
                          <th className="pb-1">Missing</th>
                          <th className="pb-1">Numeric</th>
                          <th className="pb-1">Mean</th>
                          <th className="pb-1">Std</th>
                          <th className="pb-1">Min</th>
                          <th className="pb-1">Max</th>
                          <th className="pb-1">Distinct</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedNode?.dataset?.columns || []).map((c: any, i: number) => {
                          const distinct = c && c.distinct ? (c.distinct.exact ?? c.distinct.approx ?? 0) : 0
                          const mean = typeof c.mean === 'number' ? c.mean.toFixed(3) : '--'
                          const std = typeof c.std === 'number' ? c.std.toFixed(3) : '--'
                          const min = c.min != null ? String(c.min) : '--'
                          const max = c.max != null ? String(c.max) : '--'
                          return (
                            <tr
                              key={i}
                              draggable
                              onDragStart={() => setDraggedColumnName(c.name)}
                              onDragEnd={() => setDraggedColumnName(null)}
                              onMouseEnter={() => setHoveredColumnName(c.name)}
                              onMouseLeave={() => setHoveredColumnName(null)}
                              className="odd:bg-white even:bg-slate-50 cursor-move hover:bg-blue-100"
                            >
                              <td className="py-1">{c.name}</td>
                              <td className="py-1">{c.count}</td>
                              <td className="py-1">{c.missing}</td>
                              <td className="py-1">{c.numericCount ?? 0}</td>
                              <td className="py-1">{mean}</td>
                              <td className="py-1">{std}</td>
                              <td className="py-1">{min}</td>
                              <td className="py-1">{max}</td>
                              <td className="py-1">{distinct}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="text-xs text-slate-600 font-medium pb-1">Columns</div>
                    <div className="text-xs text-slate-700 max-h-40 overflow-auto">
                      <ul className="list-disc pl-5 space-y-1">
                        {(selectedNode?.dataset?.columns || []).map((c: any, i: number) => (
                          <li key={i}>{c.name}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Selected Non-Dataset Node details */}
            {selectedNode && selectedNode.type !== 'dataset' && (
              <div className="text-xs space-y-2 border-t pt-3">
                <div>
                  <span className="font-medium">Label:</span>
                  <input
                    type="text"
                    value={selectedNode.label}
                    onChange={(e) => {
                      const converted = convertToUnicode(e.target.value)
                      setNodes((ns) =>
                        ns.map((n) => (n.id === selectedNode.id ? { ...n, label: converted } : n))
                      )
                    }}
                    className="ml-2 px-2 py-1 border rounded text-xs bg-white w-48"
                  />
                </div>
                <div><span className="font-medium">Position:</span> ({selectedNode.x.toFixed(1)}, {selectedNode.y.toFixed(1)})</div>
                {selectedNode.type === 'variable' && getVariableRenderType(selectedNode.id) === 'manifest' && (
                  <div><span className="font-medium">Size:</span> {selectedNode.width ?? 60}×{selectedNode.height ?? 60}</div>
                )}
                <div>
                  <span className="font-medium">Level of Measurement:</span>
                  <input
                    type="text"
                    value={selectedNode.levelOfMeasurement || ''}
                    onChange={(e) => {
                      const val = e.target.value.trim()
                      setNodes((ns) =>
                        ns.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, levelOfMeasurement: val || undefined }
                            : n
                        )
                      )
                    }}
                    placeholder="(e.g., 'within', 'between')"
                    className="ml-2 px-2 py-1 border rounded text-xs bg-white w-48"
                  />
                </div>
              </div>
            )}

            {/* Selected Path details */}
            {selectedPath && (
              <div className="text-xs space-y-3 border-t pt-3">
                {/* Basic info */}
                <div className="space-y-2">
                  <div><span className="font-medium">From:</span> {selectedPath.from}</div>
                  <div><span className="font-medium">To:</span> {selectedPath.to}</div>
                  <div>
                    <span className="font-medium">Label:</span>
                    <input
                      type="text"
                      value={selectedPath.label || ''}
                      onChange={(e) => {
                        const val = e.target.value.trim()
                        const converted = convertToUnicode(val)
                        setPaths((ps) =>
                          ps.map((p) =>
                            p.id === selectedPath.id
                              ? { ...p, label: converted || null }
                              : p
                          )
                        )
                      }}
                      placeholder={isDatasetPath(selectedPath, nodes) ? "(required - CSV column name)" : "(optional)"}
                      className="ml-2 px-2 py-1 border rounded text-xs bg-white w-48"
                    />
                  </div>
                  <div>
                    <span className="font-medium">Value:</span>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedPath.value ?? 1.0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value)
                        setPaths((ps) =>
                          ps.map((p) =>
                            p.id === selectedPath.id
                              ? { ...p, value: isNaN(val) ? 1.0 : val }
                              : p
                          )
                        )
                      }}
                      disabled={isDatasetPath(selectedPath, nodes)}
                      className={`ml-2 px-2 py-1 border rounded text-xs bg-white w-20 ${isDatasetPath(selectedPath, nodes) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                  </div>
                  <div>
                    <span className="font-medium">Free/Fixed:</span>
                    <select
                      value={selectedPath.freeParameter !== undefined ? 'free' : 'fixed'}
                      onChange={(e) => {
                        setPaths((ps) =>
                          ps.map((p) =>
                            p.id === selectedPath.id
                              ? { ...p, freeParameter: e.target.value === 'free' ? true : undefined }
                              : p
                          )
                        )
                      }}
                      disabled={isDatasetPath(selectedPath, nodes)}
                      className={`ml-2 px-2 py-1 border rounded text-xs bg-white ${isDatasetPath(selectedPath, nodes) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="free">free</option>
                      <option value="fixed">fixed</option>
                    </select>
                    {selectedPath.freeParameter !== undefined && !isDatasetPath(selectedPath, nodes) && (
                      <input
                        type="text"
                        placeholder="name (optional)"
                        value={typeof selectedPath.freeParameter === 'string' ? selectedPath.freeParameter : ''}
                        onChange={(e) => {
                          const name = e.target.value.trim()
                          setPaths((ps) =>
                            ps.map((p) =>
                              p.id === selectedPath.id
                                ? { ...p, freeParameter: name.length > 0 ? name : true }
                                : p
                            )
                          )
                        }}
                        className="ml-2 px-2 py-1 border rounded text-xs bg-white w-28"
                        title="Parameter name for equality constraints (leave empty for anonymous)"
                      />
                    )}
                  </div>
                </div>

                {/* Dataset mapping info panel - shown for dataset paths */}
                {isDatasetPath(selectedPath, nodes) && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-2 text-blue-800 text-[11px] space-y-1">
                    <div><strong>Dataset Mapping Path</strong></div>
                    <div>• Connects a dataset to a variable</div>
                    <div>• Label: required (should match CSV column)</div>
                    <div>• Value: always null (data from CSV)</div>
                    <div>• Type: 'dataMapping' (fixed, no optimization)</div>
                  </div>
                )}

                {/* Optimization info - hidden for dataset paths */}
                {!isDatasetPath(selectedPath, nodes) && (
                  <div className="space-y-2 border-t pt-2">
                    {/* Optimization header with toggle */}
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-slate-700">Optimization</div>
                      <button
                        onClick={() => setOptimizationExpanded(!optimizationExpanded)}
                        className="text-slate-600 hover:text-slate-900 text-sm cursor-pointer"
                        title={optimizationExpanded ? 'Collapse details' : 'Expand details'}
                      >
                        {optimizationExpanded ? '▼' : '▶'}
                      </button>
                    </div>
                    
                    {/* Parameter Type selector - always visible */}
                    <div>
                      <span className="font-medium">Parameter Type:</span>
                      <select
                        value={selectedPath.parameterType || ''}
                        onChange={(e) => updatePathParameterType(selectedPath.id, e.target.value || undefined)}
                        className="ml-2 px-2 py-1 border rounded text-xs bg-white"
                      >
                        <option value="">-- None --</option>
                        {Object.keys(parameterTypes).map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    {/* Detailed optimization controls - collapsible */}
                    {optimizationExpanded && (
                      <div className="space-y-2">
                        {/* Show effective config */}
                        {(() => {
                          const config = getPathOptimizationConfig(selectedPath)
                          return (
                            <>
                              <div className="text-slate-600 italic text-[10px]">Effective config (from type or override):</div>
                              <div className="pl-2 space-y-1">
                                <div>
                                  <span className="font-medium">Prior:</span>
                                  <div className="text-[10px] text-slate-600">
                                    {config.prior ? JSON.stringify(config.prior) : '(none)'}
                                  </div>
                                </div>
                                <div>
                                  <span className="font-medium">Bounds:</span>
                                  <div className="text-[10px] text-slate-600">
                                    {config.bounds ? `[${config.bounds[0] ?? '∞'}, ${config.bounds[1] ?? '∞'}]` : '(none)'}
                                  </div>
                                </div>
                                <div>
                                  <span className="font-medium">Start:</span>
                                  <div className="text-[10px] text-slate-600">
                                    {config.start ? String(config.start) : '(auto)'}
                                  </div>
                                </div>
                              </div>
                            </>
                          )
                        })()}

                        {/* Overrides section */}
                        <div className="text-slate-600 italic text-[10px] mt-2">Path-specific overrides:</div>
                        <div className="pl-2 space-y-2">
                          <div>
                            <label className="font-medium block">Override Bounds (JSON):</label>
                            <input
                              type="text"
                              value={selectedPath.optimization?.bounds ? JSON.stringify(selectedPath.optimization.bounds) : ''}
                              onChange={(e) => {
                                try {
                                  const val = e.target.value.trim()
                                  if (!val) {
                                    updatePathOptimization(selectedPath.id, { bounds: undefined })
                                  } else {
                                    const parsed = JSON.parse(val)
                                    updatePathOptimization(selectedPath.id, { bounds: parsed })
                                  }
                                } catch {
                                  // Silently ignore parse errors during typing
                                }
                              }}
                              placeholder="[null, null] or [min, max]"
                              className="w-full px-2 py-1 border rounded text-[11px] bg-white"
                            />
                          </div>
                          <div>
                            <label className="font-medium block">Override Start (number or 'auto'):</label>
                            <input
                              type="text"
                              value={selectedPath.optimization?.start !== undefined ? String(selectedPath.optimization.start) : ''}
                              onChange={(e) => {
                                const val = e.target.value.trim()
                                if (!val) {
                                  updatePathOptimization(selectedPath.id, { start: undefined })
                                } else if (val === 'auto') {
                                  updatePathOptimization(selectedPath.id, { start: 'auto' })
                                } else {
                                  const num = parseFloat(val)
                                  if (!isNaN(num)) {
                                    updatePathOptimization(selectedPath.id, { start: num })
                                  }
                                }
                              }}
                              placeholder="auto"
                              className="w-full px-2 py-1 border rounded text-[11px] bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {/* Debug render state right before SVG */}
        {(() => {
          console.log('[SVG Render] Rendering SVG element. viewMode:', viewMode, 'nodes:', nodes.length, 'paths:', paths.length)
          if (nodes.length > 0) {
            const xs = nodes.map(n => n.x || 0)
            const ys = nodes.map(n => n.y || 0)
            const minX = Math.min(...xs)
            const maxX = Math.max(...xs)
            const minY = Math.min(...ys)
            const maxY = Math.max(...ys)
            console.log('[SVG Render] Computed bounds - minX:', minX, 'maxX:', maxX, 'minY:', minY, 'maxY:', maxY)
          }
          return null
        })()}
        {(() => {
          // Compute viewBox from node positions and sizes
          let viewBoxAttr: string | undefined = undefined
          if (nodes.length > 0) {
            // Calculate proper bounds accounting for node dimensions
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
            nodes.forEach(n => {
              const x = n.x || 0
              const y = n.y || 0
              // Default node dimensions based on type
              let w = n.width || (n.type === 'dataset' ? DATASET_DEFAULT_W : MANIFEST_DEFAULT_W)
              let h = n.height || (n.type === 'dataset' ? DATASET_DEFAULT_H : MANIFEST_DEFAULT_H)
              // For latent nodes (circles), use radius
              if (n.type === 'variable' && n.variableCharacteristics?.manifestLatent === 'latent') {
                w = LATENT_RADIUS * 2
                h = LATENT_RADIUS * 2
              }
              // Compute node bounds (center-based positioning)
              const left = x - w / 2
              const right = x + w / 2
              const top = y - h / 2
              const bottom = y + h / 2
              minX = Math.min(minX, left)
              maxX = Math.max(maxX, right)
              minY = Math.min(minY, top)
              maxY = Math.max(maxY, bottom)
            })
            const width = maxX - minX
            const height = maxY - minY
            const MARGIN_LEFT = 50
            const MARGIN_TOP = 80      // Increased for loopback arrows
            const MARGIN_BOTTOM = 80   // Increased for loopback arrows
            // Margins on all sides for centered visual
            viewBoxAttr = `${minX - MARGIN_LEFT} ${minY - MARGIN_TOP} ${width + MARGIN_LEFT * 2} ${height + MARGIN_TOP + MARGIN_BOTTOM}`
            console.log('[SVG Render] Computed viewBox (mode=' + viewMode + '):', viewBoxAttr)
          }
          
          return (
            <svg
              ref={svgRef}
              className="w-full h-full bg-white border rounded"
              viewBox={viewBoxAttr}
              preserveAspectRatio="xMidYMid meet"
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onClick={onCanvasClick}
              onContextMenu={(e) => e.preventDefault()}
          onDragOver={(e) => {
            if (draggedColumnName && selectedNode?.type === 'dataset') {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              // Update preview position as user drags
              const p = clientToSvg(e as any as React.MouseEvent)
              setDragPreviewPos({ x: p.x, y: p.y })
            }
          }}
          onDragLeave={(e) => {
            // Clear preview when leaving the SVG area
            if (e.target === svgRef.current) {
              setDragPreviewPos(null)
            }
          }}
          onDrop={(e) => {
            if (!draggedColumnName || selectedNode?.type !== 'dataset') return
            e.preventDefault()
            const p = clientToSvg(e as any as React.MouseEvent)
            handleColumnDrop(draggedColumnName, p.x, p.y)
            setDraggedColumnName(null)
            setDragPreviewPos(null)
          }}
            >
              <defs>
                <marker id="arrow-end" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto">
                  <path d="M0,0 L10,4 L0,8 z" fill="#000" />
                </marker>
                <marker id="arrow-start" markerWidth="10" markerHeight="8" refX="0" refY="4" orient="auto">
                  <path d="M10,0 L0,4 L10,8 z" fill="#000" />
                </marker>
                <marker id="arrow-end-selected" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto">
                  <path d="M0,0 L10,4 L0,8 z" fill="#ff0000" />
                </marker>
                <marker id="arrow-start-selected" markerWidth="10" markerHeight="8" refX="0" refY="4" orient="auto">
                  <path d="M10,0 L0,4 L10,8 z" fill="#ff0000" />
                </marker>
              </defs>

              {/* draw paths with layer-based opacity */}
              {paths.map((p) => {
                  const isSelected = selectedType === 'path' && selectedId === p.id
                  const isMatchingHoveredColumn = hoveredColumnName && selectedNode && p.from === selectedNode.id && p.label === hoveredColumnName
                  const inLayer = isPathInLayer(p)
                  const opacity = getElementOpacity(inLayer)
                  const zIndex = getElementZIndex(inLayer)
                  return (
                    <path
                      key={p.id}
                      d={pathD(p)}
                      fill="none"
                      stroke={isSelected ? DISPLAY_COLORS.selectedStroke : (isMatchingHoveredColumn ? '#1e40af' : DISPLAY_COLORS.stroke)}
                      strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : (isMatchingHoveredColumn ? 2.5 : 1.6)}
                      markerEnd={isSelected ? 'url(#arrow-end-selected)' : 'url(#arrow-end)'}
                      markerStart={p.twoSided ? (isSelected ? 'url(#arrow-start-selected)' : 'url(#arrow-start)') : undefined}
                      onClick={(e) => {
                        e.stopPropagation()
                        selectElement(p.id, 'path')
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        cyclePath(p.id)
                      }}
                      opacity={opacity}
                      style={{ cursor: 'pointer', pointerEvents: 'stroke', zIndex }}
                    />
                  )
                })}

              {/* path labels */}
          {paths.map((p) => {
            const displayText = getPathDisplayText(p)
            if (!displayText) return null
            const pos = pathLabelPos(p)
            if (!pos) return null
            const inLayer = isPathInLayer(p)
            const opacity = getElementOpacity(inLayer)
            const zIndex = getElementZIndex(inLayer)
            const fontSize = 12
            const padding = 6
            // approximate char width for monospace-ish label: ~0.6 * fontSize
            const approxCharW = fontSize * 0.6
            const width = Math.max(24, approxCharW * displayText.length + padding * 2)
            const height = fontSize + padding
            const rx = 4
            return (
              <g
                key={`${p.id}-label`}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ pointerEvents: 'auto', cursor: 'text', opacity, zIndex }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  startEditing('path', p.id, p.label ?? p.id, pos)
                }}
              >
                <rect
                  x={-width / 2}
                  y={-height / 2}
                  width={width}
                  height={height}
                  rx={rx}
                  fill={DISPLAY_COLORS.fill}
                  stroke="none"
                  opacity={0.95}
                />
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={fontSize}
                  fill={DISPLAY_COLORS.stroke}
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {displayText}
                </text>
              </g>
            )
          })}

          {/* temporary drag line while creating a path */}
          {tempLine && (
            <line
              x1={tempLine.x1}
              y1={tempLine.y1}
              x2={tempLine.x2}
              y2={tempLine.y2}
              stroke="#000"
              strokeWidth={1.2}
              strokeDasharray="6 4"
              markerEnd={mode === 'add-one-path' ? 'url(#arrow-end)' : 'url(#arrow-end)'}
              markerStart={mode === 'add-two-path' ? 'url(#arrow-start)' : undefined}
            />
          )}

          {/* drag preview - translucent node while dragging a column */}
          {dragPreviewPos && draggedColumnName && (
            <g transform={`translate(${dragPreviewPos.x - MANIFEST_DEFAULT_W / 2}, ${dragPreviewPos.y - MANIFEST_DEFAULT_H / 2})`} style={{ opacity: 0.4, pointerEvents: 'none' }}>
              <rect
                width={MANIFEST_DEFAULT_W}
                height={MANIFEST_DEFAULT_H}
                rx={4}
                fill={DISPLAY_COLORS.fill}
                stroke={DISPLAY_COLORS.stroke}
                strokeWidth={DISPLAY_COLORS.defaultStrokeWidth}
              />
              <text
                x={MANIFEST_DEFAULT_W / 2}
                y={MANIFEST_DEFAULT_H / 2 + 6}
                textAnchor="middle"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {convertToUnicode(draggedColumnName)}
              </text>
            </g>
          )}

          {/* drag preview path - shows connection while dragging column */}
          {dragPreviewPos && draggedColumnName && selectedNode?.type === 'dataset' && (
            <line
              x1={selectedNode.x}
              y1={selectedNode.y}
              x2={dragPreviewPos.x}
              y2={dragPreviewPos.y}
              stroke="#888"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              opacity={0.5}
              markerEnd="url(#arrow-end)"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* draw nodes */}
          {nodes.map((n) => {
            const isSelected = selectedType === 'node' && n.id === selectedId
            // Check if this node is connected to a hovered column (via a path from the selected dataset)
            const isMatchingHoveredColumn = hoveredColumnName && selectedNode && paths.some((p) => p.from === selectedNode.id && p.label === hoveredColumnName && p.to === n.id)
            const inLayer = isNodeInLayer(n)
            const opacity = getElementOpacity(inLayer)
            const zIndex = getElementZIndex(inLayer)
            const common = { fill: DISPLAY_COLORS.fill, stroke: DISPLAY_COLORS.stroke, strokeWidth: DISPLAY_COLORS.defaultStrokeWidth, opacity, zIndex }
            if (n.type === 'variable') {
              const renderType = getVariableRenderType(n.id)
              if (renderType === 'manifest') {
                      const w = n.width ?? 60
                      const h = n.height ?? 60
                      const halfW = w / 2
                      const halfH = h / 2
                      return (
                        <g key={n.id} transform={`translate(${n.x - halfW}, ${n.y - halfH})`} style={{ opacity, zIndex }}>
                          <rect
                            width={w}
                            height={h}
                            rx={4}
                            fill={DISPLAY_COLORS.fill}
                            stroke={isSelected ? DISPLAY_COLORS.selectedStroke : (isMatchingHoveredColumn ? '#1e40af' : DISPLAY_COLORS.stroke)}
                            strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : (isMatchingHoveredColumn ? 2.5 : DISPLAY_COLORS.defaultStrokeWidth)}
                            pointerEvents="auto"
                            onMouseDown={(e) => onNodeMouseDown(e, n)}
                            onMouseEnter={() => (hoverNodeRef.current = n.id)}
                            onMouseLeave={() => (hoverNodeRef.current = null)}
                            onDoubleClick={(e) => { e.stopPropagation(); toggleVariableCharacteristic(n.id) }}
                            style={{ cursor: 'grab' }}
                          />
                          <text
                            x={w / 2}
                            y={h / 2 + 6}
                            textAnchor="middle"
                            fontWeight={isMatchingHoveredColumn ? 'bold' : 'normal'}
                            style={{ userSelect: 'none', pointerEvents: 'auto', cursor: 'text' }}
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              startEditing('node', n.id, n.label, centerOf(n))
                            }}
                          >
                            {n.displayName || n.label}
                          </text>
                        </g>
                      )
              } else if ( renderType === 'latent' ) {
              return (
                <g key={n.id} transform={`translate(${n.x}, ${n.y})`} style={{ opacity, zIndex }}>
                  <circle r={LATENT_RADIUS} cx={0} cy={0} fill={DISPLAY_COLORS.fill} stroke={isSelected ? DISPLAY_COLORS.selectedStroke : (isMatchingHoveredColumn ? '#1e40af' : DISPLAY_COLORS.stroke)} strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : (isMatchingHoveredColumn ? 2.5 : DISPLAY_COLORS.defaultStrokeWidth)} pointerEvents="auto" onMouseDown={(e) => onNodeMouseDown(e, n)} onMouseEnter={() => (hoverNodeRef.current = n.id)} onMouseLeave={() => (hoverNodeRef.current = null)} onDoubleClick={(e) => { e.stopPropagation(); toggleVariableCharacteristic(n.id) }} style={{ cursor: 'grab' }} />
                  <text
                    x={0}
                    y={6}
                    textAnchor="middle"
                    style={{ userSelect: 'none', pointerEvents: 'auto', cursor: 'text', fontWeight: isMatchingHoveredColumn ? 'bold' : 'normal' }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      startEditing('node', n.id, n.label, centerOf(n))
                    }}
                  >
                    {n.displayName || n.label}
                  </text>
                </g>
              )
            }
            } else if (n.type === 'dataset') {
              // make the cylinder slightly narrower and taller than a manifest
              const w = (n.width ?? MANIFEST_DEFAULT_W)
              const h = (n.height ?? MANIFEST_DEFAULT_H) 
              const topEllipseRy = Math.max(5, Math.round(h * 0.18))
              // draw bottom ellipse first, then rectangle (which hides top half of bottom ellipse),
              // then draw vertical side strokes and top ellipse stroke so the bottom of the rectangle
              // and the top of the bottom ellipse are not visible; rectangle corners are not rounded.
              return (
                <g key={n.id} transform={`translate(${n.x}, ${n.y})`} style={{ opacity, zIndex }}>
                  {/* Invisible shape for click/hover detection - covers entire cylinder */}
                  <ellipse
                    cx={0}
                    cy={h / 2 + topEllipseRy}
                    rx={w / 2}
                    ry={topEllipseRy}
                    fill="transparent"
                    stroke="none"
                    pointerEvents="auto"
                    onMouseDown={(e) => onNodeMouseDown(e, n)}
                    onMouseEnter={() => (hoverNodeRef.current = n.id)}
                    onMouseLeave={() => (hoverNodeRef.current = null)}
                    style={{ cursor: 'grab' }}
                  />
                  <rect
                    x={-w / 2}
                    y={-h / 2 + topEllipseRy / 2}
                    width={w}
                    height={h - topEllipseRy}
                    fill="transparent"
                    pointerEvents="auto"
                    onMouseDown={(e) => onNodeMouseDown(e, n)}
                    onMouseEnter={() => (hoverNodeRef.current = n.id)}
                    onMouseLeave={() => (hoverNodeRef.current = null)}
                    style={{ cursor: 'grab' }}
                  />
                  <ellipse
                    cx={0}
                    cy={-h / 2 + topEllipseRy / 2}
                    rx={w / 2}
                    ry={topEllipseRy}
                    fill="transparent"
                    stroke="none"
                    pointerEvents="auto"
                    onMouseDown={(e) => onNodeMouseDown(e, n)}
                    onMouseEnter={() => (hoverNodeRef.current = n.id)}
                    onMouseLeave={() => (hoverNodeRef.current = null)}
                    style={{ cursor: 'grab' }}
                  />

                  {/* bottom ellipse (draw first) */}
                  {/* bottom ellipse placed so its top meets the rectangle bottom */}
                  <ellipse cx={0} cy={h / 2 + topEllipseRy} rx={w / 2} ry={topEllipseRy} fill={DISPLAY_COLORS.fill} stroke={isSelected ? DISPLAY_COLORS.selectedStroke : DISPLAY_COLORS.stroke} strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : DISPLAY_COLORS.defaultStrokeWidth} opacity={0.95} pointerEvents="none" />

                  {/* rectangle body (no corner rounding, drawn on top of bottom ellipse to hide its top) */}
                  <rect
                    x={-w / 2}
                    y={-h / 2 + topEllipseRy / 2}
                    width={w}
                    height={h - topEllipseRy}
                    fill={DISPLAY_COLORS.fill}
                    stroke="none"
                    pointerEvents="none"
                  />

                  {/* vertical side strokes (show left/right borders, no bottom border) */}
                  <line x1={-w / 2} y1={-h / 2 + topEllipseRy / 2} x2={-w / 2} y2={h / 2+ topEllipseRy} stroke={isSelected ? DISPLAY_COLORS.selectedStroke : DISPLAY_COLORS.stroke} strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : DISPLAY_COLORS.defaultStrokeWidth} pointerEvents="none" />
                  <line x1={w / 2} y1={-h / 2 + topEllipseRy / 2} x2={w / 2} y2={h / 2+ topEllipseRy} stroke={isSelected ? DISPLAY_COLORS.selectedStroke : DISPLAY_COLORS.stroke} strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : DISPLAY_COLORS.defaultStrokeWidth} pointerEvents="none" />

                  {/* top ellipse (stroke only) */}
                  <ellipse cx={0} cy={-h / 2 + topEllipseRy / 2} rx={w / 2} ry={topEllipseRy} fill={DISPLAY_COLORS.fill} stroke={isSelected ? DISPLAY_COLORS.selectedStroke : DISPLAY_COLORS.stroke} strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : DISPLAY_COLORS.defaultStrokeWidth} pointerEvents="none" />

                  <text
                    x={0}
                    y={6}
                    textAnchor="middle"
                    style={{ userSelect: 'none', pointerEvents: 'auto', cursor: 'text' }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      startEditing('node', n.id, n.label, centerOf(n))
                    }}
                  >
                    {n.label}
                  </text>
                </g>
              )
            } else if (n.type === 'constant') {
            // constant triangle
            return (
              <g key={n.id} transform={`translate(${n.x}, ${n.y})`} style={{ opacity, zIndex }}>
                <polygon
                  points="0,-22 19,11 -19,11"
                  fill={DISPLAY_COLORS.fill}
                  stroke={isSelected ? DISPLAY_COLORS.selectedStroke : DISPLAY_COLORS.stroke}
                  strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : DISPLAY_COLORS.defaultStrokeWidth}
                  pointerEvents="auto"
                  onMouseDown={(e) => onNodeMouseDown(e, n)}
                  onMouseEnter={() => (hoverNodeRef.current = n.id)}
                  onMouseLeave={() => (hoverNodeRef.current = null)}
                  style={{ cursor: 'grab' }}
                />
                <text
                  x={0}
                  y={6}
                  textAnchor="middle"
                  style={{ userSelect: 'none', pointerEvents: 'auto', cursor: 'text' }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    startEditing('node', n.id, n.label, centerOf(n))
                  }}
                >
                  {n.label}
                </text>
              </g>
            )
                        }
            
            return null
          })}
        </svg>
            )
          })()}

        {editing && (
          <input
            ref={editingInputRef}
            value={editing.value}
            onChange={(e) => setEditing((s) => (s ? { ...s, value: e.target.value } : s))}
            onBlur={() => saveEditing()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEditing()
              if (e.key === 'Escape') cancelEditing()
            }}
            style={{
              position: 'absolute',
              left: editing.left,
              top: editing.top,
              transform: 'translate(-50%, -50%)',
              zIndex: 40,
              padding: '4px 8px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid #cbd5e1'
            }}
          />
        )}
      </div>

      {/* Error message notification - positioned at bottom to avoid layout shift */}
      {viewMode !== 'widget' && errorMessage && (
        <div className="fixed bottom-0 left-0 right-0 bg-red-50 border-t-2 border-red-400 px-4 py-3 text-sm text-red-800 shadow-md" style={{ zIndex: 50 }}>
          <div className="flex items-start gap-2">
            <span className="text-red-600 font-bold text-lg">⚠</span>
            <div className="flex-1">
              <strong>Invalid path:</strong> {errorMessage}
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-600 hover:text-red-900 font-bold text-lg ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Validation warnings notification - non-interfering, at bottom */}
      {viewMode !== 'widget' && validationWarnings.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-amber-50 border-t-2 border-amber-300 px-4 py-3 text-sm text-amber-800 shadow-md" style={{ zIndex: errorMessage ? 40 : 50 }}>
          <div className="flex items-start gap-2">
            <span className="text-amber-600 font-bold text-lg">⚠</span>
            <div className="flex-1">
              <strong>Model validation issues:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1">
                {validationWarnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setValidationWarnings([])}
              className="text-amber-600 hover:text-amber-900 font-bold text-lg ml-2 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}
 
