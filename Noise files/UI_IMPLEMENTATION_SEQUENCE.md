# UI Implementation Sequence for Composition Models

## Context
This document outlines the UI features needed to display coordinate-based composition models clearly and unambiguously. The primary use case is the multilevel growth curve with measurement model (see `examples/multilevel-growth-with-measurement.example.json`).

**Model Structure:**
- **Base models**: measurement_single_timepoint, growth_curve
- **Composition model**: multilevel_growth_with_measurement
  - measurement lifted across [time]
  - growth at individual level
  - Cross-level paths connecting them with time-parameterized loading

---

## Priority Ordering

| Priority | Feature | Complexity | Dependency |
|----------|---------|-----------|-----------|
| **P0** | Hierarchy View | Medium | None |
| **P0** | Lifting Badges | Low | Hierarchy View |
| **P0** | Cross-Level Path Styling | Low | Hierarchy View |
| **P1** | Expand/Collapse View | High | All P0 features |
| **P1** | Time-Parameterized Display | Medium | P0 + Path details |
| **P1** | Data Binding Inspector | Medium | Hierarchy View |
| **P2** | Information Panels | Medium | Basic rendering |
| **P2** | Data Preview | Low | Data Binding Inspector |
| **P2** | Legend/Key | Low | All visual elements |

---

## P0: Hierarchy View

### Purpose
Display composition structure as a tree showing composition levels, their base models, and lifting coordinates.

### Specification

```
Composition Model: multilevel_growth_with_measurement
├─ Level 1: measurement_by_time
│  ├─ Base: measurement_single_timepoint
│  ├─ Lifted by: [time]
│  ├─ Data pattern: data/individual_{individual_id}_measures.csv
│  └─ Status: Ready
│
├─ Level 2: growth_individual
│  ├─ Base: growth_curve
│  ├─ Coordinates: (none - individual level)
│  └─ Status: Ready
│
└─ Cross-level paths: 2
   ├─ growth_individual.I → measurement_by_time.F (fixed, weight=1.0)
   └─ growth_individual.S → measurement_by_time.F (time-parameterized)
```

### Implementation Details
- **Component**: Tree/outline view in left sidebar or collapsible panel
- **Data source**: `composition.levels` array from model JSON
- **Display rules**:
  - For each level, show `id`, `name`, `model` (base), `coordinates`
  - Coordinates: show as `[coord1, coord2, ...]` or "(none)" if empty
  - Count and list cross-level paths at bottom
- **Interactivity**:
  - Click level → highlight in main canvas
  - Show/hide data bindings info on demand
  - Expand/collapse coordinates list if long

### Example React Structure
```typescript
<CompositionHierarchy model={compositionModel}>
  <CompositionLevel level={levels[0]} isLifted={true}>
    <BaseModelRef model="measurement_single_timepoint" />
    <CoordinatesList coords={["time"]} />
    <DataBindingInfo pattern="data/individual_{individual_id}_measures.csv" />
  </CompositionLevel>
  <CompositionLevel level={levels[1]} isLifted={false}>
    <BaseModelRef model="growth_curve" />
    <CoordinatesList coords={[]} />
  </CompositionLevel>
  <CrossLevelPathsList paths={crossLevelPaths} />
</CompositionHierarchy>
```

### Success Criteria
- ✅ All composition levels visible and correctly labeled
- ✅ Base models linked to their source definitions
- ✅ Coordinates clearly shown (or marked as "none")
- ✅ Cross-level paths counted and accessible
- ✅ Clicking elements updates main canvas selection

---

## P0: Lifting Badges

### Purpose
Visually indicate which models/nodes are auto-lifted across a coordinate dimension.

### Specification

For lifted composition levels:
- Display badge: `×[coordinate1, coordinate2, ...]` or `×time`
- Placement: Next to component/level name
- Styling: Distinct color (e.g., blue background, white text)

For nodes in lifted models:
- When displaying F, Y1, Y2, Y3 in measurement_by_time: show as "F[time]", "Y1[time]", etc.
- Or use icon badge: ⊕ next to node name indicating "this is lifted"

For paths in lifted models:
- Similarly mark lifted paths: "L1[time]", "var_F[time]", etc.

### Example Visual
```
measurement_by_time  ×time
├─ F[time]  ⊕
├─ Y1[time] ⊕
├─ Y2[time] ⊕
├─ Y3[time] ⊕
└─ Paths:
   ├─ L1[time]     ⊕
   ├─ L2[time]     ⊕
   ├─ var_F[time]  ⊕
```

### Implementation Details
- **Badge component**: `<LiftingBadge coords={["time"]} />`
- **Data source**: `level.coordinates` from composition level
- **Rendering**:
  - In hierarchy view: badge next to level name
  - In canvas: badge next to each node/path
  - Hover effect: highlight all instances of this lifted element
- **Color scheme**: Establish standard color for lifted elements (suggest: azure/blue)

### Success Criteria
- ✅ Lifted levels clearly marked with coordinate badges
- ✅ Lifted nodes/paths marked with ⊕ or [coordinate] notation
- ✅ Non-lifted elements (growth_individual level) unmarked
- ✅ Hovering badge highlights all related instances

---

## P0: Cross-Level Path Styling

### Purpose
Visually distinguish paths that connect different composition levels from within-level paths.

### Specification

**Visual Styling:**
- **Color**: Different from within-level paths (suggest: dashed orange or purple)
- **Line style**: Dashed or dotted to show "special" connection
- **Label format**: Show as `{component}.{node} → {component}.{node}`
  - Example: `growth_individual.S → measurement_by_time.F[time]`
- **Arrow type**: Thicker or highlighted to stand out

**In Hierarchy View:**
```
Cross-level paths: 2
├─ 🔗 growth_individual.I → measurement_by_time.F (fixed, weight=1.0)
└─ 🔗 growth_individual.S → measurement_by_time.F (time-parameterized)
```

**In Canvas View:**
- Render cross-level paths as dashed lines
- Color: distinct from regular paths
- Tooltip on hover: "Cross-level path: S [growth] → F [measurement] at each time"

### Implementation Details
- **Detection**: Path `fromLabel` or `toLabel` contains "." (component reference)
- **Styling**: CSS class or styled-component for cross-level path rendering
- **Tooltip**: Show full path reference and interpretation
- **Interactivity**: 
  - Click → shows path properties panel
  - Hover → highlight source and target nodes

### Example Path Object
```json
{
  "id": "slope_to_latent_factor",
  "fromLabel": "growth_component.S",
  "toLabel": "measurement_by_time.F",
  "numberOfArrows": 1,
  "type": "cross-level",
  "value": null,
  "free": "fixed",
  "parameterizedByTime": true
}
```

### Success Criteria
- ✅ Cross-level paths visually distinct from within-level paths
- ✅ Component references (component.node) clearly visible
- ✅ Dashed/special line style applied
- ✅ Paths are interactive (hover/click)

---

## P1: Expand/Collapse View

### Purpose
Toggle between schematic view (composition structure) and instantiated view (actual lifted nodes/paths for all coordinate values).

### Specification

**Schematic View (Collapsed):**
- Show composition levels as abstract blocks
- measurement_by_time shown as single block labeled "×time"
- growth_individual shown as single block
- Cross-level paths shown as connectors between blocks
- No time instances shown

**Instantiated View (Expanded):**
- measurement_by_time expands to show:
  - F[T0], F[T1], F[T2], F[T3] nodes
  - Y1[T0], Y1[T1], ..., Y3[T3] nodes
  - Paths for each time: L1[T0], L1[T1], etc.
- growth_individual remains as single block (no lifting)
- Cross-level paths duplicated:
  - I → F[T0], I → F[T1], I → F[T2], I → F[T3]
  - S → F[T0], S → F[T1], S → F[T2], S → F[T3]

### Interaction
- Button/toggle: "Expand coordinates" / "Collapse"
- Keyboard shortcut: Ctrl+E or Cmd+E
- State persists during session

### Implementation Details
- **State management**: `isExpanded` boolean in composition view state
- **Rendering logic**: 
  - Collapsed: render component-level blocks
  - Expanded: iterate over coordinate values, render lifted nodes/paths
- **Data requirements**: Need actual coordinate values (from data discovery or explicit specification)
- **Layout**: Expanded view may need larger canvas or grid layout for many instances

### Canvas Layout Strategy
**Schematic (Collapsed):**
```
        growth_individual
        (I, S at individual level)
                ↓
        measurement_by_time ×time
        (F, Y1, Y2, Y3 at each time)
```

**Instantiated (Expanded):**
```
growth_individual: I, S (one row)
        ↓ ↓ ↓ ↓ (paths to each time)
T0:     F[T0] Y1[T0] Y2[T0] Y3[T0]
T1:     F[T1] Y1[T1] Y2[T1] Y3[T1]
T2:     F[T2] Y1[T2] Y2[T2] Y3[T2]
T3:     F[T3] Y1[T3] Y2[T3] Y3[T3]
```

### Success Criteria
- ✅ Toggle button functional and clearly labeled
- ✅ Schematic view shows composition structure clearly
- ✅ Expanded view shows all lifted instances correctly
- ✅ Cross-level paths replicated appropriately in expanded view
- ✅ Layout remains understandable in both modes
- ✅ State persists across interactions

---

## P1: Time-Parameterized Display

### Purpose
Show how parameter values vary with time (or other coordinate dimensions).

### Specification

For the slope loading path (`growth_individual.S → measurement_by_time.F`):
- Base value is computed from time index: weight = 0 at T0, 1 at T1, 2 at T2, etc.
- Display in properties panel or as inline annotation:

```
Path: slope_to_latent_factor
├─ From: growth_individual.S (Slope)
├─ To: measurement_by_time.F (Latent Factor)
├─ Type: Cross-level regression loading
├─ Time parameterization:
│  ├─ T0: weight = 0
│  ├─ T1: weight = 1
│  ├─ T2: weight = 2
│  └─ T3: weight = 3
├─ Formula: weight(t) = t
└─ Visualization: [Sparkline showing 0→1→2→3 trend]
```

### Visual Representation
- **Sparkline chart**: Small inline chart showing parameter value across coordinate dimension
- **Table**: Tabular display of coordinate value → parameter value
- **Formula**: Display the parameterization rule (e.g., "weight = time_index")

### Implementation Details
- **Data source**: Path object's `parameterizedByTime` flag and/or special `parameterization` field
- **Sparkline library**: Use existing chart library (D3, Recharts, or custom SVG)
- **Responsive**: Show table on small screens, sparkline on larger screens
- **Interaction**: Click on sparkline point to see full path properties for that instance

### Example Data Structure
```json
{
  "id": "slope_to_latent_factor",
  "fromLabel": "growth_component.S",
  "toLabel": "measurement_by_time.F",
  "parameterizedByTime": true,
  "parameterizationFormula": "weight = time_index",
  "computedValues": {
    "T0": 0,
    "T1": 1,
    "T2": 2,
    "T3": 3
  }
}
```

### Success Criteria
- ✅ Time-parameterized paths identified correctly
- ✅ Parameter values computed and displayed for each time
- ✅ Sparkline or chart clearly shows trend
- ✅ Formula explained in text
- ✅ User understands why/how values vary

---

## P1: Data Binding Inspector

### Purpose
Show how coordinate values are bound to actual data files via filename patterns.

### Specification

Display data binding information for each composition level with `dataBindings`:

```
Data Bindings for: measurement_by_time
├─ Pattern: data/individual_{individual_id}_measures.csv
├─ Coordinates resolved:
│  └─ individual_id: [001, 002, 003, 004, 005, ...]
├─ Discovered files: 5
│  ├─ data/individual_001_measures.csv (4 rows, columns: time, Y1, Y2, Y3)
│  ├─ data/individual_002_measures.csv (4 rows, columns: time, Y1, Y2, Y3)
│  ├─ data/individual_003_measures.csv (4 rows, columns: time, Y1, Y2, Y3)
│  ├─ data/individual_004_measures.csv (4 rows, columns: time, Y1, Y2, Y3)
│  └─ data/individual_005_measures.csv (4 rows, columns: time, Y1, Y2, Y3)
├─ Status: ✅ All files found and validated
└─ Actions: [Refresh] [Preview] [Edit pattern]
```

### Implementation Details
- **Data source**: `composition.levels[i].dataBindings.pattern`
- **File discovery**: Parse pattern, find matching files on filesystem
- **Validation**: 
  - Check all files exist
  - Verify column names match expected variables
  - Check row counts reasonable
  - Flag missing or extra files
- **UI panel**: Expandable section in hierarchy view or separate inspector panel
- **Interactivity**:
  - Click file → show preview of first few rows
  - Edit pattern → update binding (with validation)
  - Refresh → re-scan filesystem

### Success Criteria
- ✅ Pattern clearly displayed
- ✅ All matching files listed
- ✅ File validation status shown
- ✅ Users can preview data
- ✅ Errors/warnings flagged clearly

---

## P2: Information Panels

### Purpose
Show detailed properties of selected model elements (composition level, node, path).

### Specification

### Panel A: Composition Level Properties

```
Selected: measurement_by_time

Level Details:
├─ ID: measurement_by_time
├─ Name: Measurement Model (cascaded across timepoints)
├─ Base Model: measurement_single_timepoint
├─ Lifting Coordinates: [time]
├─ Data Pattern: data/individual_{individual_id}_measures.csv

Lifted Structure:
├─ Nodes in lifted model: 4
│  ├─ F[time]    (latent)
│  ├─ Y1[time]   (observed)
│  ├─ Y2[time]   (observed)
│  └─ Y3[time]   (observed)
├─ Paths in lifted model: 7
│  ├─ L1[time]    (factor loading)
│  ├─ L2[time]    (factor loading)
│  ├─ L3[time]    (factor loading)
│  ├─ var_F[time] (variance)
│  ├─ var_Y1[time] (error variance)
│  ├─ var_Y2[time] (error variance)
│  └─ var_Y3[time] (error variance)
└─ Instances per coordinate value: 8 (assuming 8 timepoints)
```

### Panel B: Path Properties

```
Selected: slope_to_latent_factor

Path Details:
├─ ID: slope_to_latent_factor
├─ From: growth_component.S (Slope)
├─ To: measurement_by_time.F[time] (Latent Factor at each timepoint)
├─ Type: Cross-level regression
├─ Free/Fixed: fixed
├─ Value computation: time_index
├─ Parameterization: Time-indexed loading

Values across time:
│ T0  T1  T2  T3
│ 0 ─ 1 ─ 2 ─ 3  [sparkline]

Interpretation:
└─ Slope parameter loads onto latent factor with increasing weight.
   At T0, slope contributes 0 (baseline = intercept only).
   At T1, slope contributes 1× the slope effect.
   At T2, slope contributes 2× the slope effect.
   This parameterization captures linear growth trajectory.
```

### Panel C: Node Properties

```
Selected: F[time]

Node Details:
├─ ID: F
├─ Label: Latent Factor
├─ Type: latent
├─ Base Model: measurement_single_timepoint
├─ Lifting Coordinates: [time]
├─ Instances: 8 (one per timepoint)

Incoming Paths:
├─ L1[T0-T7] from F (measurement loadings)
├─ S → F[time] (cross-level slope loading)
└─ I → F[time] (cross-level intercept loading)

Outgoing Paths:
├─ var_F[T0-T7] (variance)
└─ Y1[T0-T7], Y2[T0-T7], Y3[T0-T7] (measurement)
```

### Implementation Details
- **Triggered by**: Click on hierarchy level, node, or path
- **Location**: Right sidebar or modal panel
- **Content**: Dynamically populated based on selection type
- **Updates**: Real-time as user navigates
- **Export**: Option to copy path details as JSON or text

### Success Criteria
- ✅ All element types have property panels
- ✅ Cross-level references clearly shown
- ✅ Lifting information evident
- ✅ Parameter values and interpretations provided
- ✅ Panels update correctly on selection change

---

## P2: Data Preview

### Purpose
Show actual data structure and content to user for verification and understanding.

### Specification

**Tall Format Data Preview:**

```
Data File: data/individual_001_measures.csv

Header:  individual_id  time  Y1    Y2    Y3
Row 1:   001            0     2.1   1.9   2.3
Row 2:   001            1     2.8   2.5   3.0
Row 3:   001            2     3.4   3.1   3.7
Row 4:   001            3     4.0   3.7   4.3

[Show 4/4 rows]

Columns: 4
├─ individual_id (numeric) [001]
├─ time (numeric) [0, 1, 2, 3]
├─ Y1 (numeric) [2.1, 2.8, 3.4, 4.0]
├─ Y2 (numeric) [1.9, 2.5, 3.1, 3.7]
└─ Y3 (numeric) [2.3, 3.0, 3.7, 4.3]

Inferred structure:
├─ Individual: 001 (constant across rows)
├─ Time points: [0, 1, 2, 3] (varying)
└─ Measures: Y1, Y2, Y3 (varying by time)
```

### Implementation Details
- **Trigger**: Click "Preview" button in data binding inspector
- **Display**: Modal or collapsible section
- **Data source**: Read actual CSV file (or sample first N rows)
- **Parsing**: Use CSV parser to identify columns and types
- **Summary**: Show row count, column count, data types
- **Validation**: Flag any issues (missing values, unexpected columns, etc.)

### Success Criteria
- ✅ Data clearly visible and readable
- ✅ Format matches expected tall format
- ✅ All expected columns present
- ✅ Data summary helpful (row/column count, types)
- ✅ Easy to dismiss/close

---

## P2: Legend/Key

### Purpose
Explain visual elements and conventions used in the UI for composition models.

### Specification

```
Visual Legend for Composition Models

Model Types:
├─ ⊞ Simple Model         Base model with nodes and paths
├─ ⊙ Lifting             Automatically replicated across coordinate dimension
├─ ⟳ Composition         Combines multiple models with cross-level connections

Coordinate Indicators:
├─ ×[time]               Model lifted across this coordinate
├─ node[time]            This node is instantiated for each time value
├─ [T0] [T1] [T2]        Specific coordinate values

Path Types:
├─ ——→                   Within-level path (standard)
├─ - - →                 Cross-level path (connects different composition levels)
├─ ≈≈≈→                  Time-parameterized path (value varies by coordinate)

Color Coding:
├─ Blue background       Lifted element (auto-replicated)
├─ Orange dashed line    Cross-level path
├─ Purple node           Latent variable
├─ Gray node             Observed/manifest variable

Data Binding:
├─ 📁 Pattern            Filename pattern for data files
├─ ✓ Validated           Files found and structure correct
├─ ⚠ Warning             Some files missing or structure mismatch
├─ ✗ Error               Critical data binding issues

Other:
├─ ⊕                     Indicates lifting (shorthand badge)
├─ 🔗                    Cross-level path marker
└─ ≈                     Time-parameterized marker
```

### Placement
- **Location**: Floating panel or collapsible help section
- **Accessibility**: Keyboard shortcut (?) to toggle
- **Responsive**: Adapt legend size for small screens

### Implementation Details
- **Static content**: Defined once, reused
- **Interactive**: Click legend items to highlight matching elements in canvas
- **Customizable**: Users can enable/disable legend items they understand

### Success Criteria
- ✅ All visual elements explained
- ✅ Conventions documented
- ✅ Easy to access and understand
- ✅ Helps new users navigate complex models

---

## Implementation Notes

### Data Flow

1. **Model Loading**:
   - Parse composition model JSON
   - Identify base models and lifting coordinates
   - Resolve base model definitions

2. **Hierarchy Construction**:
   - Build composition level tree
   - List lifted nodes/paths for each level
   - Identify cross-level paths

3. **Data Discovery** (optional):
   - Scan filesystem for data binding patterns
   - Verify file existence and structure
   - Infer coordinate values from discovered files

4. **Instantiation** (if expanded):
   - Get actual coordinate values (from data or specification)
   - Generate lifted node/path instances
   - Assign indexed names: `F[T0]`, `F[T1]`, etc.

5. **Rendering**:
   - Render hierarchy in left panel
   - Render canvas (schematic or expanded)
   - Populate information panels on selection

### Key Data Structures

```typescript
// Composition model structure
interface CompositionModel {
  type: 'combination';
  composition: {
    levels: CompositionLevel[];
    description?: string;
  };
  nodes: NodeDef[];
  paths: PathDef[];
}

// Composition level
interface CompositionLevel {
  id: string;
  name: string;
  coordinates: string[];
  model: string; // base model ID
  dataBindings?: {
    pattern: string; // e.g., "data/individual_{individual_id}_measures.csv"
  };
  overrides?: {
    nodes?: NodeDef[];
    paths?: PathDef[];
  };
}

// Cross-level path reference
interface CrossLevelPathRef {
  from: `${string}.${string}`; // e.g., "growth_component.S"
  to: `${string}.${string}`;
  parameterizedByTime?: boolean;
  parameterizationFormula?: string;
}
```

### Testing Checklist

- [ ] Composition model loads correctly
- [ ] Hierarchy view displays all levels accurately
- [ ] Lifting badges appear on lifted elements
- [ ] Cross-level paths styled distinctly
- [ ] Expand/collapse toggle works
- [ ] Expanded view shows correct number of instances
- [ ] Data binding inspector finds files
- [ ] Time-parameterized paths show values
- [ ] Information panels populate correctly
- [ ] Legend is helpful and accurate

---

## Example: Complete Workflow

**User loads multilevel growth model:**

1. ✅ Hierarchy view shows:
   - measurement_by_time ×time (blue badge)
   - growth_individual (no badge)
   - 2 cross-level paths

2. ✅ User sees measurement_by_time marked as lifted
   - Nodes: F[time], Y1[time], Y2[time], Y3[time]
   - Paths: L1[time], L2[time], L3[time], var_F[time], ...

3. ✅ User clicks "Expand" toggle
   - Canvas now shows F[T0], F[T1], F[T2], F[T3]
   - Growth level remains I, S
   - Cross-level paths duplicated: I→F[T0], I→F[T1], etc.

4. ✅ User clicks cross-level path S→F[T1]
   - Properties panel shows time-parameterized loading
   - Sparkline shows weight: 0→1→2→3
   - Interpretation explains: slope effect scales with time

5. ✅ User hovers over data binding badge
   - Inspector shows files discovered: individual_001.csv, individual_002.csv, etc.
   - Status: ✓ All files found
   - User can preview file contents

6. ✅ User checks Legend
   - Understands: ⊕ = lifted, - - → = cross-level, ≈ = time-parameterized
   - Clicks legend item → highlights all similar elements in canvas

**User now understands the complete model structure and data binding.**

