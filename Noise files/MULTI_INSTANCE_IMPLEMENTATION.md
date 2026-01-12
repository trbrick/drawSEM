# Multi-Instance Visualization Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing multi-instance model visualization in CanvasTool. This enables displaying multiple versions of the same model (e.g., two timepoints) on a single canvas with instance badges, boundaries, and cross-instance path support.

## Type Definitions (Already Added to CanvasTool.tsx)

The following TypeScript types have been added to support multi-instance visualization:

```typescript
type ModelInstance = {
  instanceId: string // e.g., 'T0', 'T1', 'T2'
  baseModelId: string // reference to base model
  coordinateValues: Record<string, string> // e.g., { "time": "0" }
  offsetX: number // horizontal offset for layout
  offsetY: number // vertical offset for layout
  scale: number // scaling factor (default 1.0)
  isVisible: boolean // render visibility
}

type InstancedNode = {
  baseNodeId: string // original node id
  instanceId: string // which instance
  displayId: string // unique display id (e.g., 'F_T0')
  x: number // computed x position
  y: number // computed y position
  label: string // display label
  type: NodeType
  originalNode: Node // reference to original
}

type InstancedPath = {
  basePathId: string // original path id
  fromInstanceId: string
  toInstanceId: string
  displayId: string // unique display id
  fromDisplayId: string // source node display id
  toDisplayId: string // target node display id
  twoSided: boolean
  label?: string | null
  value?: number | null
  free?: 'free' | 'fixed'
  parameterType?: string
  isCrossInstance: boolean // true if from/to instances differ
}

type MultiInstanceModel = {
  instances: ModelInstance[]
  nodes: InstancedNode[]
  paths: InstancedPath[]
  layoutMode: 'horizontal' | 'vertical' | 'grid'
  spacing: number // pixels between instances
}
```

## Helper Functions (Already Added to CanvasTool.tsx)

### `expandModelInstances(baseNodes: Node[], instances: ModelInstance[]): InstancedNode[]`

Creates instanced nodes by duplicating each base node for each instance and applying coordinate-based offsets.

**Example:**
```typescript
const baseNodes = [
  { id: 'F', x: 100, y: 100, label: 'Latent Factor', type: 'variable' },
  { id: 'Y1', x: 20, y: 200, label: 'Measure 1', type: 'variable' }
]

const instances = [
  { instanceId: 'T0', offsetX: 0, offsetY: 0, coordinateValues: { time: '0' } },
  { instanceId: 'T1', offsetX: 300, offsetY: 0, coordinateValues: { time: '1' } }
]

const instanced = expandModelInstances(baseNodes, instances)
// Result:
// [
//   { baseNodeId: 'F', instanceId: 'T0', displayId: 'F[T0]', x: 100, y: 100, ... },
//   { baseNodeId: 'Y1', instanceId: 'T0', displayId: 'Y1[T0]', x: 20, y: 200, ... },
//   { baseNodeId: 'F', instanceId: 'T1', displayId: 'F[T1]', x: 400, y: 100, ... },
//   { baseNodeId: 'Y1', instanceId: 'T1', displayId: 'Y1[T1]', x: 320, y: 200, ... }
// ]
```

### `expandPathInstances(basePaths: Path[], instances: ModelInstance[], baseNodes: Node[]): InstancedPath[]`

Creates instanced paths by duplicating each base path for each instance.

**Example:**
```typescript
const basePaths = [
  { id: 'L1', from: 'F', to: 'Y1', twoSided: false, label: 'Loading 1' },
  { id: 'var_F', from: 'F', to: 'F', twoSided: true, label: 'Variance' }
]

const instanced = expandPathInstances(basePaths, instances, baseNodes)
// Result:
// [
//   { basePathId: 'L1', fromInstanceId: 'T0', toInstanceId: 'T0', displayId: 'L1[T0]', ... },
//   { basePathId: 'var_F', fromInstanceId: 'T0', toInstanceId: 'T0', displayId: 'var_F[T0]', ... },
//   { basePathId: 'L1', fromInstanceId: 'T1', toInstanceId: 'T1', displayId: 'L1[T1]', ... },
//   { basePathId: 'var_F', fromInstanceId: 'T1', toInstanceId: 'T1', displayId: 'var_F[T1]', ... }
// ]
```

### `layoutHorizontalInstances(instances: ModelInstance[], spacing: number): void`

Arranges instances horizontally (left to right). Default for 2-4 instances.

**Example:**
```typescript
const instances = [
  { instanceId: 'T0', offsetX: 0, offsetY: 0, ... },
  { instanceId: 'T1', offsetX: 0, offsetY: 0, ... }
]

layoutHorizontalInstances(instances, 300) // 300px spacing

// After layout:
// T0: offsetX=0, offsetY=0
// T1: offsetX=300, offsetY=0
```

### `layoutVerticalInstances(instances: ModelInstance[], spacing: number): void`

Arranges instances vertically (top to bottom). For many instances (5+).

**Example:**
```typescript
layoutVerticalInstances(instances, 400) // 400px spacing

// After layout:
// T0: offsetX=0, offsetY=0
// T1: offsetX=0, offsetY=400
// T2: offsetX=0, offsetY=800
```

## Implementation Steps

### Step 1: Add State for Multi-Instance Mode

Add to component state (inside `export default function CanvasTool()`):

```typescript
const [multiInstanceMode, setMultiInstanceMode] = useState(false)
const [instances, setInstances] = useState<ModelInstance[]>([])
const [multiInstanceModel, setMultiInstanceModel] = useState<MultiInstanceModel | null>(null)
```

### Step 2: Create Instance Creation Function

```typescript
function createMultiInstanceModel(
  instanceIds: string[],
  baseModelId: string = 'base'
): void {
  const newInstances: ModelInstance[] = instanceIds.map((id, idx) => ({
    instanceId: id,
    baseModelId,
    coordinateValues: { time: String(idx) },
    offsetX: 0,
    offsetY: 0,
    scale: 1.0,
    isVisible: true
  }))
  
  // Apply layout
  layoutHorizontalInstances(newInstances, 350) // 350px horizontal spacing
  
  // Expand nodes and paths
  const instNodes = expandModelInstances(nodes, newInstances)
  const instPaths = expandPathInstances(paths, newInstances, nodes)
  
  setInstances(newInstances)
  setMultiInstanceModel({
    instances: newInstances,
    nodes: instNodes,
    paths: instPaths,
    layoutMode: 'horizontal',
    spacing: 350
  })
  setMultiInstanceMode(true)
}
```

### Step 3: Add Multi-Instance Rendering Functions

#### Render Instanced Nodes

```typescript
function renderInstancedNodes(model: MultiInstanceModel): JSX.Element[] {
  return model.nodes.map((iNode) => {
    const isSelected = selectedType === 'node' && selectedId === iNode.displayId
    const node = iNode.originalNode
    const instance = model.instances.find(i => i.instanceId === iNode.instanceId)
    
    if (!instance) return null
    
    // Render similar to regular nodes but with instance badge
    if (node.type === 'variable') {
      const renderType = getVariableRenderType(node.id)
      if (renderType === 'latent') {
        return (
          <g key={iNode.displayId} transform={`translate(${iNode.x}, ${iNode.y})`}>
            {/* Circle for latent variable */}
            <circle
              r={LATENT_RADIUS}
              cx={0}
              cy={0}
              fill={DISPLAY_COLORS.fill}
              stroke={isSelected ? DISPLAY_COLORS.selectedStroke : DISPLAY_COLORS.stroke}
              strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : DISPLAY_COLORS.defaultStrokeWidth}
              pointerEvents="auto"
              onClick={() => selectElement(iNode.displayId, 'node')}
              style={{ cursor: 'pointer' }}
            />
            {/* Node label */}
            <text
              x={0}
              y={6}
              textAnchor="middle"
              fontSize={12}
              pointerEvents="none"
            >
              {node.label}
            </text>
            {/* Instance badge */}
            <rect
              x={LATENT_RADIUS - 8}
              y={-LATENT_RADIUS - 8}
              width={16}
              height={14}
              rx={3}
              fill="#3b82f6"
              stroke="#1e40af"
              strokeWidth={1}
            />
            <text
              x={LATENT_RADIUS}
              y={-LATENT_RADIUS - 2}
              textAnchor="middle"
              fontSize={10}
              fill="white"
              fontWeight="bold"
              pointerEvents="none"
            >
              {instance.instanceId}
            </text>
          </g>
        )
      }
    }
    
    return null
  })
}
```

#### Render Instanced Paths

```typescript
function renderInstancedPaths(model: MultiInstanceModel): JSX.Element[] {
  return model.paths.map((iPath) => {
    const isSelected = selectedType === 'path' && selectedId === iPath.displayId
    const fromNode = model.nodes.find(n => n.displayId === iPath.fromDisplayId)
    const toNode = model.nodes.find(n => n.displayId === iPath.toDisplayId)
    
    if (!fromNode || !toNode) return null
    
    const stroke = iPath.isCrossInstance ? '#ff8c42' : DISPLAY_COLORS.stroke
    const strokeDasharray = iPath.isCrossInstance ? '6 4' : undefined
    
    return (
      <path
        key={iPath.displayId}
        d={pathD({ // reuse existing pathD function
          from: fromNode.baseNodeId,
          to: toNode.baseNodeId,
          twoSided: iPath.twoSided
        })}
        fill="none"
        stroke={isSelected ? DISPLAY_COLORS.selectedStroke : stroke}
        strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : 1.6}
        strokeDasharray={strokeDasharray}
        markerEnd={!iPath.twoSided ? 'url(#arrow-end)' : undefined}
        markerStart={iPath.twoSided ? 'url(#arrow-start)' : undefined}
        onClick={(e) => {
          e.stopPropagation()
          selectElement(iPath.displayId, 'path')
        }}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
      />
    )
  })
}
```

### Step 4: Add UI Controls

Add button to enable multi-instance mode:

```typescript
<button
  onClick={() => {
    if (!multiInstanceMode) {
      createMultiInstanceModel(['T0', 'T1'])
    } else {
      setMultiInstanceMode(false)
      setInstances([])
      setMultiInstanceModel(null)
    }
  }}
  className={`px-3 py-2 rounded text-xs transition ${
    multiInstanceMode
      ? 'bg-blue-100 border border-blue-400 text-blue-900 font-medium'
      : 'bg-slate-100 border border-slate-300 hover:bg-slate-200'
  }`}
>
  {multiInstanceMode ? '✓ Multi-Instance' : 'Multi-Instance'}
</button>
```

### Step 5: Conditionally Render Multi-Instance or Single Mode

In SVG rendering section:

```typescript
{multiInstanceMode && multiInstanceModel ? (
  <>
    {/* Render instanced nodes */}
    {renderInstancedNodes(multiInstanceModel)}
    {/* Render instanced paths */}
    {renderInstancedPaths(multiInstanceModel)}
  </>
) : (
  <>
    {/* Render regular nodes and paths (existing code) */}
    {paths.map((p) => { /* ... */ })}
    {nodes.map((n) => { /* ... */ })}
  </>
)}
```

## CSS Styling for Instanced Elements

Add to component or global styles:

```css
/* Instance badges (blue background with white text) */
.instance-badge {
  background-color: #3b82f6;
  border: 1px solid #1e40af;
  border-radius: 3px;
  color: white;
  font-weight: bold;
  font-size: 10px;
  padding: 2px 4px;
}

/* Instance boundary boxes (optional dashed outline) */
.instance-box {
  fill: none;
  stroke: #d1d5db;
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
  opacity: 0.5;
}

/* Cross-instance paths (dashed, orange/purple) */
.path-cross-instance {
  stroke: #ff8c42;
  stroke-dasharray: 6 4;
  opacity: 0.8;
}

.path-cross-instance.selected {
  stroke: #ff0000;
  stroke-width: 2.5;
}

/* Node instance badge positioning */
.node-instance-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

## Example: Factor Model with Two Timepoints

### Input Data

Base model (single timepoint):
```
Nodes:
- F (Latent Factor) at (100, 100)
- Y1 (Measure 1) at (20, 200)
- Y2 (Measure 2) at (100, 200)
- Y3 (Measure 3) at (180, 200)

Paths:
- F → Y1 (loading 1, fixed)
- F → Y2 (loading 2, free)
- F → Y3 (loading 3, free)
- F ↔ F (variance)
- Y1 ↔ Y1 (error variance)
- Y2 ↔ Y2 (error variance)
- Y3 ↔ Y3 (error variance)
```

### Creating Multi-Instance Model

```typescript
// In CanvasTool component
const [multiInstanceMode, setMultiInstanceMode] = useState(false)

function onMultiInstanceClick() {
  createMultiInstanceModel(['T0', 'T1'], 'base-factor-model')
}
```

### Result

After calling `createMultiInstanceModel(['T0', 'T1'])`:

**Timepoint 0 (T0):**
- F[T0] at (100, 100)
- Y1[T0] at (20, 200)
- Y2[T0] at (100, 200)
- Y3[T0] at (180, 200)
- F[T0] → Y1[T0], F[T0] → Y2[T0], F[T0] → Y3[T0], etc.

**Timepoint 1 (T1):**
- F[T1] at (400, 100) [offset by 300px]
- Y1[T1] at (320, 200) [offset by 300px]
- Y2[T1] at (400, 200) [offset by 300px]
- Y3[T1] at (480, 200) [offset by 300px]
- F[T1] → Y1[T1], F[T1] → Y2[T1], F[T1] → Y3[T1], etc.

### Visual Characteristics

- **Instance badges**: Blue [T0] and [T1] labels at top-right of each latent factor
- **Within-instance paths**: Regular black lines
- **Horizontal layout**: 300px spacing between timepoints
- **Selection**: Click any node/path to select; red highlight on selection
- **Instance box** (optional): Light gray dashed boundaries around each instance

## Testing Checklist

- [ ] Load factor-model-two-timepoints.example.json
- [ ] Click "Multi-Instance" button
- [ ] Verify two sets of nodes appear (side by side with 300px spacing)
- [ ] Verify instance badges [T0] and [T1] appear on latent factors
- [ ] Click on T0 latent factor → should highlight red
- [ ] Click on T1 latent factor → different node, highlight separately
- [ ] Verify all paths (loading, variance, covariances) appear in both instances
- [ ] Toggle multi-instance mode off → should return to single view
- [ ] Toggle back on → should preserve instance configuration

## Next Steps

1. **Basic Rendering** (Phase 1)
   - [ ] Implement renderInstancedNodes()
   - [ ] Implement renderInstancedPaths()
   - [ ] Add multi-instance mode toggle button
   - [ ] Test with factor-model-two-timepoints.example.json

2. **Visual Enhancements** (Phase 2)
   - [ ] Add instance badges with coordinate values
   - [ ] Add optional instance boundary boxes
   - [ ] Cross-instance path styling (orange/dashed)
   - [ ] Layout mode toggle (horizontal/vertical)

3. **Interaction & Editing** (Phase 3)
   - [ ] Select nodes/paths across instances
   - [ ] Shift-click for multi-instance selection
   - [ ] Double-click instance badge to zoom/focus
   - [ ] Create/edit cross-instance paths (for composition models)

4. **Data Binding & Composition** (Phase 4)
   - [ ] Load multilevel-growth-with-measurement.example.json
   - [ ] Auto-expand composition models with coordinate lifting
   - [ ] Data binding inspector for CSV mappings
   - [ ] Cross-level path editor (I → F[time])

## File References

- **Types & Helpers**: [src/components/CanvasTool.tsx](src/components/CanvasTool.tsx#L35-L100)
- **Example Data**: [examples/factor-model-two-timepoints.example.json](examples/factor-model-two-timepoints.example.json)
- **Example Data**: [examples/multilevel-growth-with-measurement.example.json](examples/multilevel-growth-with-measurement.example.json)
- **Implementation Spec**: [MULTI_INSTANCE_VISUALIZATION.md](MULTI_INSTANCE_VISUALIZATION.md)

## References

- Existing path computation: `pathD(path)` function
- Node rendering: Latent (circle), Manifest (rect), Constant (triangle), Dataset (cylinder)
- Selection state: `selectedType` ('node' | 'path'), `selectedId` (string)
