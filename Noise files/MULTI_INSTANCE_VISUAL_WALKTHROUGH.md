# Multi-Instance Visualization: Visual Walkthrough

## Display Overview

When multi-instance mode is enabled with two timepoints (T0, T1), the canvas shows:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CanvasTool with Multi-Instance                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│              TIMEPOINT 0 (T0)        TIMEPOINT 1 (T1)             │
│              ────────────────        ────────────────              │
│                                                                     │
│                    ┌──────┐                      ┌──────┐          │
│                    │ [T0] │                      │ [T1] │          │
│                    │  F   │                      │  F   │          │
│                    └──────┘                      └──────┘          │
│                   /   |    \                    /   |    \         │
│                  /    |     \                  /    |     \        │
│              Y1 ●  Y2 ●  Y3 ●              Y1 ●  Y2 ●  Y3 ●      │
│                                                                     │
│            [ F[T0] ↔ F[T0] ]      [ F[T1] ↔ F[T1] ]              │
│            [ Y1 ↔ Y1 ] [ Y2 ↔ Y2 ] [ Y1 ↔ Y1 ] [ Y2 ↔ Y2 ]       │
│                                                                     │
│                   ← 300px horizontal spacing →                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Node Types and Visual Representation

### Latent Variables (Circles with Instance Badge)

```
Standard latent variable (single timepoint):
          ┌─────┐
          │ [T0]│
       ●──┤  F  ├──●
         │ └─────┘ │
       (label centered)

With instance badge:
       ┌─────────┐
       │[T0]     │
    ●──┤  F      ├──●
      │└─────────┘│
   (badge positioned top-left, blue background)
```

### Manifest Variables (Rectangles)

```
┌─────────┐
│[Measure]│
│  Y1     │
└─────────┘
  (blue badge top-right corner)
```

### Dataset Nodes (Cylinders)

```
    ╔═════════╗
    ║[Dataset]║
    ║  CSV    ║
    ╠═════════╠
    ║ data.   ║
    ╚═════════╝
```

## Path Types and Styling

### Within-Instance Paths (Same Timepoint)

```
One-headed (regression):
       F[T0]
         |
         ↓ (value or label)
       Y1[T0]

Two-headed (variance/covariance):
       F[T0]
       ↙     ↖
      ↗       ↙
   (self-loop with curved arrow)
```

**Styling:**
- Stroke: black (#000)
- Stroke width: 1.6px
- Label: white background, centered on path
- Selected: red stroke, 2.5px width

### Cross-Instance Paths (Different Timepoints)

```
     F[T0]              F[T1]
       |                  |
       │ (orange, dashed)
       └──────────────────┘
   (between-timepoint growth path)

Visual style:
- Stroke: orange (#ff8c42)
- Stroke dasharray: 6 4 (dashed)
- Opacity: 0.8
- Selected: red stroke, 2.5px width
```

## Instance Badges

All instanced nodes display small badges showing the instance identifier:

```
Latent Factor at T0:        Latent Factor at T1:
┌───┐                       ┌───┐
│[T0] - blue badge          │[T1] - blue badge
│ F  - node label           │ F  - node label
└───┘                       └───┘
```

**Badge styling:**
- Background: blue (#3b82f6)
- Border: darker blue (#1e40af), 1px
- Text color: white
- Font size: 10px
- Font weight: bold
- Border radius: 3px
- Padding: 2px 4px
- Position: top-left corner of latent circle, top-right of manifest rectangle

## Layout Modes

### Horizontal Layout (Default for 2-4 instances)

```
Spacing: 350px (configurable)

┌──────────────────────┐
│ Timepoint 0          │ Timepoint 1
│    (T0)              │    (T1)
│                      │
│    ●                 │    ●
│   /|\                │   /|\
│  Y Y Y               │  Y Y Y
│                      │
│   <-- 350px space -->
│                      │
└──────────────────────┘

Coordinate mapping:
T0: offsetX=0,   offsetY=0
T1: offsetX=350, offsetY=0
T2: offsetX=700, offsetY=0
(if present)
```

### Vertical Layout (For many instances, 5+)

```
Spacing: 400px (configurable)

┌──────────────┐
│ Timepoint 0  │
│    (T0)      │
│              │
│    ●         │
│   /|\        │
│  Y Y Y       │
│              │
│   ↓ 400px    │
│              │
├──────────────┤
│ Timepoint 1  │
│    (T1)      │
│              │
│    ●         │
│   /|\        │
│  Y Y Y       │
│              │
└──────────────┘
```

### Grid Layout (For 2D coordinates)

```
If model has coordinates like:
  ["time", "group"]

Values: time=[0,1], group=[A,B]

┌───────────────────────────┐
│ T0,A      │ T0,B          │
│  ●        │  ●            │
│ /|\       │ /|\           │
│─────────────────────────  │
│ T1,A      │ T1,B          │
│  ●        │  ●            │
│ /|\       │ /|\           │
└───────────────────────────┘
```

## Interaction Patterns

### Selection

```
Click on T0 latent factor:
  ●  ← red highlight, stroke width 2.5px
 /|\
Y Y Y

Other instances remain black (unchanged)
```

### Multi-Selection (Hold Shift + Click)

```
Shift+Click T0 latent, then Shift+Click T1 latent:

  ●  (red highlight)    ●  (red highlight)
 /|\                   /|\
Y Y Y                 Y Y Y

Both instances selected simultaneously
```

### Selection Info Panel

```
┌─────────────────────────────────────────┐
│ Node: F                                 │
│ Type: latent                            │
│                                         │
│ ID: F                                   │
│ Position: (100.0, 100.0)               │
│ Instance: T0                            │
│ Coordinates: time=0                     │
│                                         │
│ [Delete] [X]                            │
└─────────────────────────────────────────┘
```

### Double-Click Instance Badge

```
Double-click [T0] badge on latent factor:
  → Zoom/pan canvas to focus on T0 instance
  → Highlight all T0 nodes and paths
  → Expand to show T0-specific information panel
```

## Complete Factor Model Example

### Base Model (Before Multi-Instance)

```
           F
          / | \
         /  |  \
       Y1  Y2  Y3

 F ↔ F   (variance)
Y1 ↔ Y1  (error variance)
Y2 ↔ Y2  (error variance)
Y3 ↔ Y3  (error variance)
```

### Two-Timepoint Model (After Multi-Instance)

```
TIMEPOINT 0              TIMEPOINT 1
─────────────            ────────────

    [T0]                     [T1]
     F                        F
    /|\                      /|\
   / | \                    / | \
 Y1 Y2 Y3                 Y1 Y2 Y3

F↔F Y1↔Y1 Y2↔Y2 Y3↔Y3  F↔F Y1↔Y1 Y2↔Y2 Y3↔Y3

(12 nodes total: 3 latent, 9 manifest)
(28 paths total: 6 loadings + 8 variances, × 2 timepoints)
```

### With Cross-Instance Stability Constraint (Optional)

If adding a stability constraint (fixed loading equality across timepoints):

```
TIMEPOINT 0              TIMEPOINT 1
─────────────            ────────────

     F                        F
    /|\                      /|\
   / | \                    / | \
 Y1 Y2 Y3                 Y1 Y2 Y3

(loadings marked "fixed" across instances)

Note: This would be shown with:
  - Path constraint indicators (e.g., "fixed" label)
  - Highlighting equality constraints between instances
  - Different styling for constrained vs free paths
```

## Measurement Level Layers

Multi-instance mode respects existing layer filtering:

```
Layer Button:  "Complete Graph" ← active

Visible elements:
  ✓ Latent factors (F[T0], F[T1])
  ✓ Manifest variables (Y1[T0], Y1[T1], etc.)
  ✓ Paths (all)

Change to "SEM" layer:
  ✓ F[T0], F[T1], Y1[T0], Y1[T1], etc.
  ✓ SEM paths only
  ✗ Dataset connections (hidden/transparent)

Change to specific measurement level:
  ✓ Elements tagged with that level
  ✗ Elements tagged with other levels
```

## Coordinate Value Display

When instances have meaningful coordinates (e.g., time=0, time=1):

```
Instance info in popup when selected:

┌──────────────────────────────────────┐
│ Instance: T0                         │
│ Coordinates:                         │
│  • time: 0                           │
│  • group: (none)                     │
│                                      │
│ Model offset: X=0, Y=0               │
│ Visible: Yes                         │
└──────────────────────────────────────┘
```

## Expansion Stats

When loading a model with 2 timepoints:

```
Original model:
  Nodes: 4 (1 latent, 3 manifest)
  Paths: 7 (3 loadings, 4 variances)

After multi-instance expansion (T0, T1):
  Nodes: 8 (2 latent, 6 manifest)
  Paths: 14 (6 loadings, 8 variances)

Status display:
  "Nodes: 8 | Paths: 14 | Multi-Instance: 2 × Factor Model"
```

## CSS Classes Applied

### To latent factor nodes:
```html
<circle class="instanced-node latent-variable instance-t0"></circle>
```

### To instance badges:
```html
<g class="instance-badge">
  <rect class="badge-background"></rect>
  <text class="badge-text">T0</text>
</g>
```

### To cross-instance paths:
```html
<path class="instanced-path path-cross-instance t0-to-t1"></path>
```

### To instance containers (optional):
```html
<g class="instance-container instance-t0">
  <!-- all T0 nodes and paths -->
</g>
```

## Accessibility

### Keyboard Navigation (Optional Phase)

```
Tab key:           Cycle through instances
Shift+Tab:         Reverse cycle
Arrow Keys:        Navigate within instance
Enter:             Select focused element
Space:             Toggle instance visibility
Delete:            Remove selected element
D:                 Duplicate instance
I:                 Inspect instance properties
```

### Screen Reader Support

```
Node: "F (latent factor) at timepoint T0, position 100, 100"
Path: "Loading path from F[T0] to Y1[T0], value 1.0, fixed"
Badge: "Instance badge for timepoint T0"
```

## Loading Animation

When expanding a large multi-timepoint model:

```
(1) User clicks "Multi-Instance" button
(2) Progress indicator appears:
    "Expanding base model with 2 timepoints...
     Computing positions... ✓
     Creating node instances (8/8)... ✓
     Creating path instances (14/14)... ✓
     Layout complete!"

(3) Canvas updates with new visualization
(4) Status bar shows: "Nodes: 8 | Paths: 14 | Multi-Instance ✓"
```

## Performance Characteristics

For factor model with 2 timepoints:

```
Rendering:
  - 8 nodes rendered (~instant)
  - 14 paths rendered (~instant)
  - Instance badges rendered (~instant)
  - Total: < 50ms

Memory usage:
  - Original model: ~2KB (4 nodes, 7 paths)
  - Instanced model: ~4KB (8 nodes, 14 paths)
  - Instances array: <1KB

Scaling (estimated):
  - 5 timepoints × 4 nodes = 20 nodes → still interactive
  - 10 timepoints × 10 nodes = 100 nodes → slight lag (~100-200ms)
  - 20 timepoints × 20 nodes = 400 nodes → noticeable lag (~500ms+)

Recommendation: Use grid layout for >10 timepoints to reduce visible elements
```

## Next Visualization Steps

### Phase 1: Hierarchy View (P0)

```
┌─────────────────────────────────┐
│ Model: Growth with Measurement  │
├─────────────────────────────────┤
│ ⊟ Composition (multilevel)      │
│   ├─ Level 1: measurement_by_time
│   │  ├─ F (factor)
│   │  └─ Y1, Y2, Y3 (measures)
│   │  └─ 7 paths
│   │
│   └─ Level 2: growth_individual
│      ├─ I (intercept)
│      ├─ S (slope)
│      └─ 5 paths
│
│ Cross-level paths:
│   • I → F[time]
│   • S → F[time] (time-parameterized)
└─────────────────────────────────┘
```

### Phase 2: Expand/Collapse View (P1)

```
┌─────────────────────────────────┐
│ ▼ measurement_by_time (T0, T1)  │
│   [Show/hide instance details]  │
│   ▼ T0 expansion                │
│     [8 nodes, 14 paths]         │
│   ▼ T1 expansion                │
│     [8 nodes, 14 paths]         │
│                                 │
│ ▼ growth_individual             │
│   [2 nodes, 5 paths]            │
│                                 │
│ ▼ Cross-level connections       │
│   • I → F[T0] (growth loading)  │
│   • S → F[T0] (time-param)      │
│   • I → F[T1]                   │
│   • S → F[T1]                   │
└─────────────────────────────────┘
```

