# Multi-Instance Code Integration Guide

Complete, copy-paste-ready code snippets for integrating multi-instance visualization into CanvasTool.tsx.

## 1. State Declarations (Add to CanvasTool component)

Add these state hooks after the existing state declarations (around line 200 in CanvasTool):

```typescript
// Multi-instance visualization state
const [multiInstanceMode, setMultiInstanceMode] = useState(false)
const [instances, setInstances] = useState<ModelInstance[]>([])
const [multiInstanceModel, setMultiInstanceModel] = useState<MultiInstanceModel | null>(null)
const [instanceLayoutMode, setInstanceLayoutMode] = useState<'horizontal' | 'vertical' | 'grid'>('horizontal')
```

## 2. Create Multi-Instance Model Function

Add this function in the component (before the return statement):

```typescript
/**
 * Create a multi-instance model from the current nodes/paths
 * @param instanceIds Array of instance identifiers (e.g., ['T0', 'T1'])
 * @param baseModelId Identifier for the base model (default 'base')
 */
function createMultiInstanceModel(
  instanceIds: string[],
  baseModelId: string = 'base'
): void {
  try {
    // Create instance definitions
    const newInstances: ModelInstance[] = instanceIds.map((id, idx) => ({
      instanceId: id,
      baseModelId,
      coordinateValues: { time: String(idx) },
      offsetX: 0,
      offsetY: 0,
      scale: 1.0,
      isVisible: true
    }))
    
    // Apply layout based on number of instances
    const spacing = instanceIds.length === 1 ? 0 : instanceIds.length <= 4 ? 350 : 400
    if (instanceIds.length <= 4) {
      layoutHorizontalInstances(newInstances, spacing)
      setInstanceLayoutMode('horizontal')
    } else if (instanceIds.length <= 12) {
      layoutVerticalInstances(newInstances, spacing)
      setInstanceLayoutMode('vertical')
    }
    
    // Expand nodes and paths
    const instNodes = expandModelInstances(nodes, newInstances)
    const instPaths = expandPathInstances(paths, newInstances, nodes)
    
    console.log(`[Multi-Instance] Created model with ${instanceIds.length} instances:`)
    console.log(`  - Instanced nodes: ${instNodes.length}`)
    console.log(`  - Instanced paths: ${instPaths.length}`)
    
    // Update state
    setInstances(newInstances)
    setMultiInstanceModel({
      instances: newInstances,
      nodes: instNodes,
      paths: instPaths,
      layoutMode: instanceIds.length <= 4 ? 'horizontal' : 'vertical',
      spacing: spacing
    })
    setMultiInstanceMode(true)
    deselectAll()
  } catch (err) {
    console.error('[Multi-Instance] Error creating model:', err)
    setErrorMessage(`Failed to create multi-instance model: ${err}`)
  }
}

/**
 * Disable multi-instance mode and return to single model view
 */
function disableMultiInstanceMode(): void {
  setMultiInstanceMode(false)
  setMultiInstanceModel(null)
  setInstances([])
  deselectAll()
  console.log('[Multi-Instance] Disabled multi-instance mode')
}

/**
 * Toggle multi-instance mode on/off
 */
function toggleMultiInstanceMode(): void {
  if (multiInstanceMode) {
    disableMultiInstanceMode()
  } else {
    // Create default 2-instance model (T0, T1)
    createMultiInstanceModel(['T0', 'T1'])
  }
}
```

## 3. Rendering Functions for Instanced Elements

Add these functions before the return statement:

```typescript
/**
 * Render a single instanced node with badge and visual styling
 */
function renderSingleInstancedNode(iNode: InstancedNode, isSelected: boolean, instance: ModelInstance): JSX.Element | null {
  const node = iNode.originalNode
  
  if (node.type === 'variable') {
    const renderType = getVariableRenderType(node.id)
    
    if (renderType === 'latent') {
      return (
        <g
          key={iNode.displayId}
          transform={`translate(${iNode.x}, ${iNode.y})`}
          style={{ cursor: 'pointer' }}
        >
          {/* Latent variable circle */}
          <circle
            r={LATENT_RADIUS}
            cx={0}
            cy={0}
            fill={DISPLAY_COLORS.fill}
            stroke={isSelected ? DISPLAY_COLORS.selectedStroke : DISPLAY_COLORS.stroke}
            strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : DISPLAY_COLORS.defaultStrokeWidth}
            pointerEvents="auto"
            onMouseDown={(e) => {
              e.stopPropagation()
              selectElement(iNode.displayId, 'node')
            }}
            onMouseEnter={() => (hoverNodeRef.current = iNode.displayId)}
            onMouseLeave={() => (hoverNodeRef.current = null)}
          />
          
          {/* Node label */}
          <text
            x={0}
            y={6}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fill={DISPLAY_COLORS.stroke}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              startEditing('node', iNode.displayId, node.label, { x: iNode.x, y: iNode.y })
            }}
          >
            {node.label}
          </text>
          
          {/* Instance badge */}
          <g>
            <rect
              x={LATENT_RADIUS - 10}
              y={-LATENT_RADIUS - 10}
              width={20}
              height={16}
              rx={3}
              fill="#3b82f6"
              stroke="#1e40af"
              strokeWidth={1}
              pointerEvents="auto"
              onClick={(e) => {
                e.stopPropagation()
                selectElement(iNode.displayId, 'node')
              }}
              style={{ cursor: 'pointer' }}
            />
            <text
              x={LATENT_RADIUS}
              y={-LATENT_RADIUS - 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fontWeight="bold"
              fill="white"
              pointerEvents="none"
              style={{ userSelect: 'none' }}
            >
              {instance.instanceId}
            </text>
          </g>
        </g>
      )
    } else if (renderType === 'manifest') {
      const w = node.width ?? MANIFEST_DEFAULT_W
      const h = node.height ?? MANIFEST_DEFAULT_H
      const halfW = w / 2
      const halfH = h / 2
      
      return (
        <g
          key={iNode.displayId}
          transform={`translate(${iNode.x - halfW}, ${iNode.y - halfH})`}
          style={{ cursor: 'pointer' }}
        >
          {/* Manifest variable rectangle */}
          <rect
            width={w}
            height={h}
            rx={4}
            fill={DISPLAY_COLORS.fill}
            stroke={isSelected ? DISPLAY_COLORS.selectedStroke : DISPLAY_COLORS.stroke}
            strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : DISPLAY_COLORS.defaultStrokeWidth}
            pointerEvents="auto"
            onMouseDown={(e) => {
              e.stopPropagation()
              selectElement(iNode.displayId, 'node')
            }}
            onMouseEnter={() => (hoverNodeRef.current = iNode.displayId)}
            onMouseLeave={() => (hoverNodeRef.current = null)}
          />
          
          {/* Node label */}
          <text
            x={w / 2}
            y={h / 2 + 6}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fill={DISPLAY_COLORS.stroke}
            style={{ userSelect: 'none', pointerEvents: 'auto', cursor: 'text' }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              startEditing('node', iNode.displayId, node.label, { x: iNode.x, y: iNode.y })
            }}
          >
            {node.label}
          </text>
          
          {/* Instance badge for manifest */}
          <g>
            <rect
              x={w - 18}
              y={-10}
              width={16}
              height={14}
              rx={2}
              fill="#3b82f6"
              stroke="#1e40af"
              strokeWidth={1}
              pointerEvents="auto"
              onClick={(e) => {
                e.stopPropagation()
                selectElement(iNode.displayId, 'node')
              }}
              style={{ cursor: 'pointer' }}
            />
            <text
              x={w - 10}
              y={-3}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9}
              fontWeight="bold"
              fill="white"
              pointerEvents="none"
              style={{ userSelect: 'none' }}
            >
              {instance.instanceId}
            </text>
          </g>
        </g>
      )
    }
  } else if (node.type === 'constant') {
    return (
      <g
        key={iNode.displayId}
        transform={`translate(${iNode.x}, ${iNode.y})`}
        style={{ cursor: 'pointer' }}
      >
        <polygon
          points="0,-22 19,11 -19,11"
          fill={DISPLAY_COLORS.fill}
          stroke={isSelected ? DISPLAY_COLORS.selectedStroke : DISPLAY_COLORS.stroke}
          strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : DISPLAY_COLORS.defaultStrokeWidth}
          pointerEvents="auto"
          onMouseDown={(e) => {
            e.stopPropagation()
            selectElement(iNode.displayId, 'node')
          }}
          onMouseEnter={() => (hoverNodeRef.current = iNode.displayId)}
          onMouseLeave={() => (hoverNodeRef.current = null)}
        />
        <text
          x={0}
          y={6}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fill={DISPLAY_COLORS.stroke}
          style={{ userSelect: 'none', pointerEvents: 'auto', cursor: 'text' }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            startEditing('node', iNode.displayId, node.label, { x: iNode.x, y: iNode.y })
          }}
        >
          {node.label}
        </text>
      </g>
    )
  }
  
  return null
}

/**
 * Render all instanced nodes in multi-instance model
 */
function renderInstancedNodes(model: MultiInstanceModel): JSX.Element[] {
  return model.nodes.map((iNode) => {
    const instance = model.instances.find(i => i.instanceId === iNode.instanceId)
    if (!instance || !instance.isVisible) return null
    
    const isSelected = selectedType === 'node' && selectedId === iNode.displayId
    return renderSingleInstancedNode(iNode, isSelected, instance)
  }).filter((e) => e !== null)
}

/**
 * Render a single instanced path
 */
function renderSingleInstancedPath(iPath: InstancedPath, isSelected: boolean, model: MultiInstanceModel): JSX.Element | null {
  const fromNode = model.nodes.find(n => n.displayId === iPath.fromDisplayId)
  const toNode = model.nodes.find(n => n.displayId === iPath.toDisplayId)
  
  if (!fromNode || !toNode) return null
  
  // Compute path direction
  const dx = toNode.x - fromNode.x
  const dy = toNode.y - fromNode.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  
  if (dist === 0) {
    // Self-loop - draw curved path to self
    const baseNode = fromNode.originalNode
    const radius = baseNode.type === 'variable' && getVariableRenderType(baseNode.id) === 'latent' ? LATENT_RADIUS + 40 : 50
    const angle = 45 * (Math.PI / 180) // 45 degrees
    const controlX = fromNode.x + Math.cos(angle) * radius * 1.5
    const controlY = fromNode.y + Math.sin(angle) * radius * 1.5
    
    return (
      <path
        key={iPath.displayId}
        d={`M ${fromNode.x} ${fromNode.y} Q ${controlX} ${controlY} ${fromNode.x} ${fromNode.y}`}
        fill="none"
        stroke={isSelected ? DISPLAY_COLORS.selectedStroke : DISPLAY_COLORS.stroke}
        strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : 1.6}
        strokeDasharray={iPath.isCrossInstance ? '6 4' : undefined}
        markerEnd={iPath.twoSided ? 'url(#arrow-start)' : 'url(#arrow-end)'}
        markerStart={iPath.twoSided ? 'url(#arrow-start)' : undefined}
        pointerEvents="stroke"
        onClick={(e) => {
          e.stopPropagation()
          selectElement(iPath.displayId, 'path')
        }}
        style={{ cursor: 'pointer' }}
      />
    )
  }
  
  // Regular path (not self-loop)
  const stroke = iPath.isCrossInstance ? '#ff8c42' : DISPLAY_COLORS.stroke
  const opacity = iPath.isCrossInstance ? 0.8 : 1
  
  return (
    <path
      key={iPath.displayId}
      d={`M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`}
      fill="none"
      stroke={isSelected ? DISPLAY_COLORS.selectedStroke : stroke}
      strokeWidth={isSelected ? DISPLAY_COLORS.selectedStrokeWidth : 1.6}
      strokeDasharray={iPath.isCrossInstance ? '6 4' : undefined}
      opacity={opacity}
      markerEnd={!iPath.twoSided ? (isSelected ? 'url(#arrow-end-selected)' : 'url(#arrow-end)') : undefined}
      markerStart={iPath.twoSided ? (isSelected ? 'url(#arrow-start-selected)' : 'url(#arrow-start)') : undefined}
      pointerEvents="stroke"
      onClick={(e) => {
        e.stopPropagation()
        selectElement(iPath.displayId, 'path')
      }}
      style={{ cursor: 'pointer' }}
    />
  )
}

/**
 * Render all instanced paths in multi-instance model
 */
function renderInstancedPaths(model: MultiInstanceModel): JSX.Element[] {
  return model.paths.map((iPath) => {
    const isSelected = selectedType === 'path' && selectedId === iPath.displayId
    return renderSingleInstancedPath(iPath, isSelected, model)
  }).filter((e) => e !== null)
}
```

## 4. UI Control Button

Add this button in the toolbar area (find the buttons for Add Variable, Add Constant, etc.):

```typescript
{/* Multi-Instance Mode Toggle */}
<button
  onClick={toggleMultiInstanceMode}
  title={multiInstanceMode ? 'Disable multi-instance view' : 'Enable multi-instance view (T0, T1)'}
  className={`px-3 py-2 rounded text-xs font-medium transition ${
    multiInstanceMode
      ? 'bg-blue-100 border border-blue-400 text-blue-900 font-semibold'
      : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200'
  }`}
>
  {multiInstanceMode ? '✓ Multi-Instance' : 'Multi-Instance'}
</button>
```

## 5. Conditional Rendering in SVG

Replace the SVG rendering section in the return statement. Find where `paths.map()` and `nodes.map()` are rendered and replace with:

```typescript
{/* Conditionally render multi-instance or single model */}
{multiInstanceMode && multiInstanceModel ? (
  <>
    {/* Render instanced paths (before nodes so they appear behind) */}
    {renderInstancedPaths(multiInstanceModel)}
    
    {/* Render instanced nodes (on top of paths) */}
    {renderInstancedNodes(multiInstanceModel)}
  </>
) : (
  <>
    {/* Original single-model rendering */}
    {paths.map((p) => {
      // ... existing path rendering code ...
    })}
    
    {/* ... existing node rendering code ... */}
    {nodes.map((n) => {
      // ... existing node rendering code ...
    })}
  </>
)}
```

## 6. CSS Styling (Add to component or global styles)

```css
/* Instance badge styling */
.instance-badge {
  background-color: #3b82f6;
  border: 1px solid #1e40af;
  border-radius: 3px;
  color: white;
  font-weight: bold;
  font-size: 10px;
  padding: 2px 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

/* Cross-instance path styling */
.path-cross-instance {
  stroke: #ff8c42;
  stroke-dasharray: 6 4;
  opacity: 0.8;
  stroke-width: 1.6;
}

.path-cross-instance.selected {
  stroke: #ff0000;
  stroke-width: 2.5;
  opacity: 1;
}

/* Instanced node containers */
.instance-container {
  position: relative;
}

.instance-container.highlighted {
  opacity: 1;
}

.instance-container.faded {
  opacity: 0.3;
}

/* Instance label styling */
.instance-label {
  font-weight: bold;
  font-size: 12px;
  fill: white;
  user-select: none;
}
```

## 7. Status Bar Update

Update the status display to show multi-instance info:

```typescript
<div className="text-xs text-slate-600">
  <div>Nodes: {multiInstanceMode && multiInstanceModel ? multiInstanceModel.nodes.length : nodes.length}</div>
  <div>Paths: {multiInstanceMode && multiInstanceModel ? multiInstanceModel.paths.length : paths.length}</div>
  {multiInstanceMode && multiInstanceModel && (
    <div className="text-blue-600 font-medium mt-1">
      Multi-Instance: {multiInstanceModel.instances.length} × {multiInstanceModel.instances[0]?.baseModelId || 'model'}
    </div>
  )}
</div>
```

## 8. Testing the Implementation

To test the implementation:

1. **Load example data:**
   ```
   Import: examples/factor-model-two-timepoints.example.json
   ```

2. **Verify single model rendering:**
   - Should show 8 nodes (2 latent, 6 manifest)
   - Should show 14 paths (6 loadings, 8 variances)

3. **Enable multi-instance:**
   - Click "Multi-Instance" button
   - Should create T0 and T1 instances

4. **Check visual output:**
   - Two sets of factors side-by-side
   - Blue instance badges [T0] and [T1]
   - 300px horizontal spacing

5. **Test selection:**
   - Click T0 latent factor → red highlight
   - Click T1 latent factor → separate red highlight
   - Selection panel shows instance info

## Integration Checklist

- [ ] Add type definitions (ModelInstance, InstancedNode, etc.) → lines 44-93
- [ ] Add helper functions (expandModelInstances, layoutHorizontalInstances, etc.) → lines 101-156
- [ ] Add state declarations (multiInstanceMode, instances, etc.) → after line 200
- [ ] Add createMultiInstanceModel function
- [ ] Add disableMultiInstanceMode function
- [ ] Add toggleMultiInstanceMode function
- [ ] Add renderSingleInstancedNode function
- [ ] Add renderInstancedNodes function
- [ ] Add renderSingleInstancedPath function
- [ ] Add renderInstancedPaths function
- [ ] Add multi-instance toggle button to toolbar
- [ ] Update SVG rendering to use conditional logic
- [ ] Add CSS styling rules
- [ ] Update status bar to show instance info
- [ ] Test with factor-model-two-timepoints.example.json
- [ ] Verify visual output matches walkthrough document
- [ ] Test selection and interaction

## File Locations

- **CanvasTool.tsx**: `/src/components/CanvasTool.tsx`
- **Example data**: `/examples/factor-model-two-timepoints.example.json`
- **Implementation guide**: `/MULTI_INSTANCE_IMPLEMENTATION.md`
- **Visual walkthrough**: `/MULTI_INSTANCE_VISUAL_WALKTHROUGH.md`
- **This file**: `/MULTI_INSTANCE_CODE_INTEGRATION.md`

## Next Steps

After implementing basic multi-instance rendering:

1. **Add instance controls:**
   - Toggle layout mode (horizontal/vertical)
   - Add/remove instances dynamically
   - Adjust spacing

2. **Add advanced features:**
   - Cross-instance path creation/editing
   - Instance-specific constraints
   - Time-parameterized path labels

3. **Composition model support:**
   - Auto-expand multilevel-growth-with-measurement.example.json
   - Render cross-level paths separately
   - Handle nested instances (levels with instances)

