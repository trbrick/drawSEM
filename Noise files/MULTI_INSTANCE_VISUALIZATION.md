# Multi-Instance Model Visualization

## Overview
This document specifies the data structures and UI patterns for displaying multiple instances of the same model (e.g., two timepoints of a factor model) on a single canvas.

## Internal Data Structures

### ModelInstance
Represents a single instantiation of a model with coordinate indices.

```typescript
interface ModelInstance {
  instanceId: string;           // Unique ID for this instance, e.g., "T0", "T1"
  baseModelId: string;          // Reference to base model definition
  coordinateValues: Record<string, string>;  // e.g., { "time": "T0" }
  offsetX: number;              // X offset for layout
  offsetY: number;              // Y offset for layout
  scale: number;                // Scale factor for this instance (default 1.0)
  isVisible: boolean;            // Whether to display
}

interface InstancedNode {
  baseNodeId: string;           // Original node ID from base model
  instanceId: string;           // Which instance this belongs to
  displayId: string;            // Unique display ID: `${baseNodeId}[${instanceId}]` (e.g., "F[T0]")
  
  // Visual properties (inherited from base, can be overridden)
  x: number;                    // Absolute position in canvas
  y: number;                    // Absolute position in canvas
  label: string;                // e.g., "Latent Factor [T0]"
  type: NodeType;
  width?: number;
  height?: number;
  
  // Metadata
  baseLabel: string;            // Original label from base model
  instance: ModelInstance;      // Reference to parent instance
}

interface InstancedPath {
  basePathId: string;           // Original path ID from base model
  instanceId: string;           // Which instance this belongs to
  displayId: string;            // Unique display ID: `${basePathId}[${instanceId}]`
  
  from: string;                 // displayId of source node
  to: string;                   // displayId of target node
  label?: string | null;
  value?: number | null;
  free?: 'free' | 'fixed';
  
  // Metadata
  instance: ModelInstance;      // Reference to parent instance
}

interface MultiInstanceModel {
  instances: ModelInstance[];
  nodes: InstancedNode[];
  paths: InstancedPath[];
  
  // Layout metadata
  layoutMode: 'horizontal' | 'vertical' | 'grid';
  instanceSpacing: number;      // Pixels between instances
  showInstanceLabels: boolean;
  instanceLabelPosition: 'top' | 'side';
}
```

## Visual Representation

### Layout Modes

**Horizontal (Default for 2-4 instances):**
```
[Base Model T0]    [Base Model T1]
     F[T0]              F[T1]
    / | \              / | \
  Y1 Y2 Y3            Y1 Y2 Y3
```
- Instances arranged left-to-right
- Each instance shows nodes and internal paths
- Cross-instance paths shown as connectors between columns

**Vertical (Good for many timepoints):**
```
[T0] ┌─────┐
     │ F   │
     │Y1Y2Y3
     └─────┘
       │
[T1] ┌─────┐
     │ F   │
     │Y1Y2Y3
     └─────┘
```

**Grid (For 2D coordinates, e.g., time × group):**
```
         Group1      Group2
T0   [  Model  ]  [  Model  ]
     
T1   [  Model  ]  [  Model  ]
```

### Visual Styling for Instances

**Instance Labels:**
- Position: Top-left corner of instance box (or side label)
- Format: `[T0]`, `[T1]`, etc.
- Styling: Light blue background with rounded corners
- Font: Smaller, monospaced, gray color

**Instance Boundaries:**
- Optional light gray box around instance
- Dashed border to indicate visual grouping
- Opacity: 0.3 to avoid obscuring content

**Node Display with Instance:**
- Node label: Shows base label only (e.g., "Latent Factor")
- Instance indicator: Badge with coordinate value (e.g., `[T0]`)
- Badge position: Top-right corner of node
- Badge styling: Small, blue background, white text

**Path Labels with Instance:**
- Path label: Base label (e.g., "Loading")
- Instance indicator: Optional small `[T0]` if needed for clarity
- Show only if disambiguation necessary

**Cross-Instance Paths (Optional):**
- Styled differently (e.g., dashed, thinner, different color)
- Represent connections between instances (e.g., I → F[T0], I → F[T1])
- Color: Orange or purple to distinguish
- Opacity: Slightly reduced to keep focus on instance contents

## Layout Algorithm

### Horizontal Layout
```
function layoutHorizontalInstances(instances: ModelInstance[], baseModel: Model) {
  const baseWidth = computeBoundingBox(baseModel.nodes).width;
  const spacing = 150; // pixels
  
  let currentX = 100; // starting offset
  
  for (const instance of instances) {
    instance.offsetX = currentX;
    instance.offsetY = 100;
    
    // Position all nodes in this instance
    for (const node of baseModel.nodes) {
      const iNode = createInstancedNode(node, instance);
      iNode.x = instance.offsetX + node.x;  // Offset base x by instance offset
      iNode.y = instance.offsetY + node.y;
    }
    
    currentX += baseWidth + spacing;
  }
}
```

### Grid Layout (Time × Group)
```
function layoutGridInstances(
  timeValues: string[],
  groupValues: string[],
  baseModel: Model
) {
  const baseWidth = computeBoundingBox(baseModel.nodes).width;
  const baseHeight = computeBoundingBox(baseModel.nodes).height;
  const hSpacing = 150;
  const vSpacing = 150;
  
  let row = 0;
  for (const timeVal of timeValues) {
    let col = 0;
    for (const groupVal of groupValues) {
      const instance = {
        instanceId: `T${timeVal}_G${groupVal}`,
        offsetX: col * (baseWidth + hSpacing),
        offsetY: row * (baseHeight + vSpacing),
      };
      // ... position nodes in instance
      col++;
    }
    row++;
  }
}
```

## Rendering in Canvas

### SVG Structure
```html
<svg>
  <!-- Grid background (optional) -->
  <defs>
    <pattern id="grid" ...>
  </defs>
  
  <!-- Instance containers -->
  <g id="instance-T0">
    <!-- Instance label badge -->
    <rect x="..." y="..." width="..." height="..." class="instance-badge" />
    <text>[T0]</text>
    
    <!-- Instance boundary (optional) -->
    <rect x="..." y="..." width="..." height="..." class="instance-box" />
    
    <!-- Nodes in this instance -->
    <g id="node-F[T0]">
      <circle class="node-latent" />
      <text>Latent Factor</text>
      <badge>[T0]</badge>
    </g>
    <!-- ... more nodes ... -->
    
    <!-- Paths within this instance -->
    <path id="path-L1[T0]" class="path-loading" />
    <!-- ... more paths ... -->
  </g>
  
  <!-- Cross-instance paths (drawn last, on top) -->
  <g id="cross-instance-paths">
    <path id="path-I-to-F[T0]" class="path-cross-instance" />
    <path id="path-I-to-F[T1]" class="path-cross-instance" />
  </g>
</svg>
```

### CSS Classes for Styling

```css
/* Instance styling */
.instance-badge {
  fill: #e3f2fd;
  stroke: #2196F3;
  stroke-width: 1;
  rx: 4;
}

.instance-badge text {
  font-size: 12px;
  font-weight: bold;
  fill: #1976D2;
  font-family: monospace;
}

.instance-box {
  fill: none;
  stroke: #cccccc;
  stroke-dasharray: 5,5;
  stroke-width: 1;
  opacity: 0.3;
  pointer-events: none;
}

/* Node instance badges */
.node-instance-badge {
  fill: #2196F3;
  stroke: none;
  rx: 3;
}

.node-instance-badge text {
  font-size: 10px;
  fill: white;
  font-family: monospace;
  font-weight: bold;
}

/* Cross-instance paths */
.path-cross-instance {
  stroke: #FF9800;
  stroke-width: 1.5;
  stroke-dasharray: 4,4;
  fill: none;
  opacity: 0.7;
}

.path-cross-instance:hover {
  stroke: #F57C00;
  stroke-width: 2;
  opacity: 1;
}
```

## Interaction Patterns

### Selection
- Clicking a node in instance T0 → highlights that node only (not its counterpart in T1)
- Shift-click → multi-select nodes from different instances
- Ctrl-click → select all instances of a node (e.g., all "F" nodes)

### Editing
- Double-click node label → edit that specific instance's label (or globally if same for all)
- Edit path label → applies to all instances of that path (option to override per-instance)

### Navigation
- Pan/zoom as normal
- Double-click instance box → zoom to fit that instance
- Instance dropdown selector → quickly navigate to instance

### Cross-Instance Path Editing
- Draw path from I → click on any F[T*] → creates cross-instance path
- UI offers option: "Connect to all instances of F?" → creates paths for T0, T1, T2, etc.

## Data Flow for Two Timepoints

**Input:** Base factor model (F, Y1, Y2, Y3 with paths)

**Step 1: Create instances**
```json
{
  "instances": [
    { "instanceId": "T0", "coordinateValues": { "time": "T0" } },
    { "instanceId": "T1", "coordinateValues": { "time": "T1" } }
  ]
}
```

**Step 2: Expand nodes**
- Base: F, Y1, Y2, Y3 (4 nodes)
- Expanded: F[T0], Y1[T0], Y2[T0], Y3[T0], F[T1], Y1[T1], Y2[T1], Y3[T1] (8 nodes)

**Step 3: Expand paths**
- Base: L1, L2, L3, var_F, var_Y1, var_Y2, var_Y3 (7 paths)
- Expanded: L1[T0], L1[T1], L2[T0], L2[T1], ... (14 paths)

**Step 4: Layout**
- Compute positions for each instanced node
- Horizontal: F[T0] at (100, 100), F[T1] at (400, 100), etc.

**Step 5: Render**
- Draw all instanced nodes and paths
- Add instance badges and boundaries
- Apply CSS styling

## React Component Structure

```typescript
// Main multi-instance canvas component
function MultiInstanceCanvas({
  baseModel: Model,
  instances: ModelInstance[],
  layoutMode: 'horizontal' | 'vertical' | 'grid'
}) {
  const [expandedInstances, setExpandedInstances] = useState<InstancedNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<InstancedPath[]>([]);
  
  useEffect(() => {
    // Expand base model for all instances
    const nodes = expandModelInstances(baseModel, instances);
    const paths = expandPathInstances(baseModel, instances);
    
    // Layout based on mode
    const layouted = layoutInstances(nodes, instances, layoutMode);
    
    setExpandedInstances(layouted);
    setExpandedPaths(paths);
  }, [baseModel, instances, layoutMode]);
  
  return (
    <svg>
      {/* Instance containers */}
      {instances.map(instance => (
        <InstanceGroup 
          key={instance.instanceId}
          instance={instance}
          nodes={expandedInstances.filter(n => n.instanceId === instance.instanceId)}
          paths={expandedPaths.filter(p => p.instanceId === instance.instanceId)}
        />
      ))}
      
      {/* Cross-instance paths */}
      {renderCrossInstancePaths()}
    </svg>
  );
}

// Instance group component
function InstanceGroup({ instance, nodes, paths }) {
  return (
    <g id={`instance-${instance.instanceId}`}>
      {/* Instance badge */}
      <InstanceBadge instance={instance} />
      
      {/* Instance boundary box */}
      <InstanceBox instance={instance} nodes={nodes} />
      
      {/* Nodes */}
      {nodes.map(node => (
        <NodeElement key={node.displayId} node={node} />
      ))}
      
      {/* Paths */}
      {paths.map(path => (
        <PathElement key={path.displayId} path={path} />
      ))}
    </g>
  );
}
```

## Implementation Checklist

- [ ] Add `ModelInstance`, `InstancedNode`, `InstancedPath` types to CanvasTool
- [ ] Implement `expandModelInstances()` function to create instanced nodes
- [ ] Implement `expandPathInstances()` function to create instanced paths
- [ ] Implement layout algorithms (horizontal, vertical, grid)
- [ ] Add CSS classes for instance styling
- [ ] Create `<InstanceGroup>` React component
- [ ] Create `<InstanceBadge>` and `<InstanceBox>` components
- [ ] Update rendering logic to use instanced nodes/paths
- [ ] Add selection/interaction for instanced elements
- [ ] Test with two timepoints of factor model
- [ ] Add cross-instance path support (optional first version)
- [ ] Add layout mode toggle UI

