import type { GraphSchema, Model, RepeatGroup } from '../core/types'
import type { Node, Path, RuntimeRepeatGroup } from './helpers'

export interface RuntimeModel {
  id: string
  label: string
  nodes: Node[]
  paths: Path[]
  parameterTypes: Record<string, any>
  // Coordinate-expansion prototype — not core schema content. Serialized to
  // extensions.toolPrivate.drawSEM.repeatGroups; no other tool interprets it.
  repeatGroups?: RuntimeRepeatGroup[]
}

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
        visual: { x: n.x, y: n.y },
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

  return {
    label: model.label,
    nodes: model.nodes.map((n) => ({
      label: n.label,
      type: n.type,
      ...(n.description ? { description: n.description } : {}),
      ...(n.tags ? { tags: n.tags } : {}),
      ...(n.variableCharacteristics ? { variableCharacteristics: n.variableCharacteristics } : {}),
      ...(n.bindingMappings ? { bindingMappings: n.bindingMappings } : {}),
      ...(n.datasetSource ? { datasetSource: n.datasetSource } : {}),
      visual: {
        x: n.x,
        y: n.y,
        ...(n.width ? { width: n.width } : {}),
        ...(n.height ? { height: n.height } : {}),
      },
    })),
    paths: model.paths.map((p) => ({
      from: idToLabel[p.from] ?? p.from,
      to: idToLabel[p.to] ?? p.to,
      ...(p.type ? { type: p.type } : {}),
      ...(p.type !== 'data' ? { numberOfArrows: p.twoSided ? 2 : 1 } : {}),
      ...(p.label !== undefined ? { label: p.label } : {}),
      ...(p.value !== undefined ? { value: p.value } : {}),
      ...(p.freeParameter !== undefined ? { freeParameter: p.freeParameter } : {}),
      ...(p.parameterType ? { parameterType: p.parameterType } : {}),
      ...(p.optimization ? { optimization: p.optimization } : {}),
      ...(p.side || p.visual?.midpointOffset
        ? {
            visual: {
              ...(p.side ? { loopSide: p.side } : {}),
              ...(p.visual?.midpointOffset ? { midpointOffset: p.visual.midpointOffset } : {}),
            },
          }
        : {}),
    })),
    ...(model.parameterTypes && Object.keys(model.parameterTypes).length > 0
      ? { optimization: { parameterTypes: model.parameterTypes } }
      : {}),
    ...(model.repeatGroups && model.repeatGroups.length > 0
      ? {
          extensions: {
            toolPrivate: {
              drawSEM: {
                repeatGroups: model.repeatGroups.map((g): RepeatGroup => ({
                  id: g.id,
                  coordinateDimension: g.coordinateDimension,
                  instanceCount: g.instanceCount,
                  ...(g.dataSource ? { dataSource: g.dataSource } : {}),
                  viewState: g.viewState,
                  nodeLabels: g.nodeIds.map((id) => idToLabel[id] ?? id),
                  visual: g.visual,
                })),
              },
            },
          },
        }
      : {}),
  }
}

export function modelToSchema(model: RuntimeModel, options: RuntimeToSchemaOptions = {}): GraphSchema {
  return {
    schemaVersion: 0,
    models: {
      [model.id]: modelToSchemaModel(model, options),
    },
  }
}
