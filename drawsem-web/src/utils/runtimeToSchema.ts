import type { GraphSchema, Model, ModelVisualization } from '../core/types'
import { DANGLING_ENDPOINT_PREFIX, mergeOwned } from './helpers'
import type { Node, Path } from './helpers'

export interface RuntimeModel {
  id: string
  // Model label exactly as in the input (absent stays absent); UI shows `label ?? id`.
  label?: string
  nodes: Node[]
  paths: Path[]
  // optimization.parameterTypes exactly as in the input (absent stays absent)
  parameterTypes?: Record<string, any>
  // The editor-owned view keys of `visualization` (viewport, activeLayer,
  // offLayerVisibility) exactly as loaded (absent stays absent). Not updated by
  // zoom / pan / layer changes: the live view is merged in only at explicit
  // serialization points (see withVisualization).
  visualization?: RuntimeVisualization
  // Input keys the editor does not own (see OWNED_MODEL_KEYS: meta, extensions,
  // provenance, visualization, optimization minus parameterTypes, ...).
  // Opaque: never read or edited by UI code.
  passthrough?: Record<string, any>
}

/** The `visualization` keys the editor owns: the saved view. */
export type RuntimeVisualization = Pick<ModelVisualization, 'viewport' | 'activeLayer' | 'offLayerVisibility'>

export interface RuntimeToSchemaOptions {
  forAutoLayout?: boolean
}

export function modelToSchemaModel(model: RuntimeModel, options: RuntimeToSchemaOptions = {}): Model {
  const { forAutoLayout = false } = options
  const idToLabel: Record<string, string> = {}
  model.nodes.forEach((n) => {
    idToLabel[n.id] = n.label
  })

  if (forAutoLayout) {
    return {
      label: model.label,
      nodes: model.nodes.map((n) => ({
        label: n.label,
        type: n.type,
        visual: {
          ...(n.x !== undefined ? { x: n.x } : {}),
          ...(n.y !== undefined ? { y: n.y } : {}),
        },
      })),
      paths: model.paths.map((p) => ({
        from: idToLabel[p.from] ?? p.from,
        to: idToLabel[p.to] ?? p.to,
        numberOfArrows: p.twoSided ? 2 : 1,
        ...(p.freeParameter !== undefined ? { freeParameter: p.freeParameter } : {}),
        ...(p.value !== undefined ? { value: p.value } : {}),
      })),
    }
  }

  const endpointLabel = (id: string) =>
    idToLabel[id] ?? (id.startsWith(DANGLING_ENDPOINT_PREFIX) ? id.slice(DANGLING_ENDPOINT_PREFIX.length) : id)

  // Owned keys are written from runtime state and omitted when undefined; every
  // other key of the loaded object comes back from `passthrough` (see helpers.ts).
  const nodes = model.nodes.map((n) =>
    mergeOwned(
      n.passthrough,
      {
        label: n.label,
        type: n.type,
        description: n.description,
        tags: n.tags,
        variableCharacteristics: n.variableCharacteristics,
        bindingMappings: n.bindingMappings,
        datasetSource: n.datasetSource,
      },
      { visual: { x: n.x, y: n.y, width: n.width, height: n.height } }
    )
  )

  const paths = model.paths.map((p) =>
    mergeOwned(
      p.passthrough,
      {
        from: endpointLabel(p.from),
        to: endpointLabel(p.to),
        type: p.type,
        // required on every non-data path, forbidden on data paths
        numberOfArrows: p.type !== 'data' ? (p.twoSided ? 2 : 1) : undefined,
        label: p.label,
        value: p.value,
        freeParameter: p.freeParameter,
        parameterType: p.parameterType,
        optimization: p.optimization,
      },
      { visual: { loopSide: p.side, midpointOffset: p.visual?.midpointOffset } }
    )
  )

  return mergeOwned(
    model.passthrough,
    { label: model.label, nodes, paths },
    {
      optimization: { parameterTypes: model.parameterTypes },
      visualization: {
        viewport: model.visualization?.viewport,
        activeLayer: model.visualization?.activeLayer,
        offLayerVisibility: model.visualization?.offLayerVisibility,
      },
    }
  ) as Model
}

export function modelToSchema(model: RuntimeModel, options: RuntimeToSchemaOptions = {}): GraphSchema {
  return {
    schemaVersion: 0,
    models: {
      [model.id]: modelToSchemaModel(model, options),
    },
  }
}

/**
 * Serialize every runtime model into one schema document. `docPassthrough`
 * carries the document-level keys the editor does not own (`schemaVersion`,
 * `meta`), as captured at load by `docPassthroughOf`.
 */
export function modelsToSchema(models: RuntimeModel[], docPassthrough: Record<string, any> = {}): GraphSchema {
  return {
    ...docPassthrough,
    schemaVersion: docPassthrough.schemaVersion ?? 0,
    models: Object.fromEntries(models.map((m) => [m.id, modelToSchemaModel(m)])),
  } as GraphSchema
}

/**
 * `models` with the view of model `modelId` replaced by `view` (the editor's
 * live viewport and layer state), for the serialization points that store the
 * view: standalone Save and the addin's Done. Other models are unchanged.
 */
export function withVisualization(models: RuntimeModel[], modelId: string | null, view: RuntimeVisualization): RuntimeModel[] {
  return models.map((m) => (m.id === modelId ? { ...m, visualization: { ...m.visualization, ...view } } : m))
}
