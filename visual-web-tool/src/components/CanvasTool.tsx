import React, { useRef, useState } from 'react'

type NodeType = 'manifest' | 'latent' | 'constant'

type Node = {
  id: string
  x: number
  y: number
  label: string
  type: NodeType
  // optional size for manifest nodes
  width?: number
  height?: number
}

type Path = {
  id: string
  from: string
  to: string
  twoSided: boolean
  // optional side for self-loop attachment: 'top', 'right', 'bottom', 'left'
  side?: 'top' | 'right' | 'bottom' | 'left'
}

type Mode =
  | 'select'
  | 'add-manifest'
  | 'add-latent'
  | 'add-constant'
  | 'add-one-path'
  | 'add-two-path'

function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// visual constants
const LATENT_RADIUS = 36
const MANIFEST_DEFAULT_W = 60
const MANIFEST_DEFAULT_H = 60

export default function CanvasTool(): JSX.Element {
  const [nodes, setNodes] = useState<Node[]>([
    { id: 'n_latent', x: 220, y: 100, label: 'F1', type: 'latent' },
    { id: 'n_x1', x: 100, y: 250, label: 'x1', type: 'manifest'},
    { id: 'n_x2', x: 220, y: 250, label: 'x2', type: 'manifest'},
    { id: 'n_x3', x: 340, y: 250, label: 'x3', type: 'manifest'},
    { id: 'n_const', x: 220, y: 400, label: '1', type: 'constant' },
    { id: 'n_err_x1', x: 100, y: 350, label: 'σx₁', type: 'latent' },
    { id: 'n_err_x3', x: 340, y: 350, label: 'σx₃', type: 'latent' }
  ])
  const [paths, setPaths] = useState<Path[]>([
    // variance for latent F1 (self-loop)
    { id: 'p_var_f1', from: 'n_latent', to: 'n_latent', twoSided: true, side: 'top' },
    // variance for error variables
    { id: 'p_var_err_x1', from: 'n_err_x1', to: 'n_err_x1', twoSided: true, side: 'left' },
    { id: 'p_var_err_x3', from: 'n_err_x3', to: 'n_err_x3', twoSided: true, side: 'right' },
    // covariance between error variables
    { id: 'p_cov_err', from: 'n_err_x1', to: 'n_err_x3', twoSided: true },
    // variance for x2 manifest (self-loop)
    { id: 'p_var_x2', from: 'n_x2', to: 'n_x2', twoSided: true },
    // factor loadings: latent to each manifest
    { id: 'p_l1', from: 'n_latent', to: 'n_x1', twoSided: false },
    { id: 'p_l2', from: 'n_latent', to: 'n_x2', twoSided: false },
    { id: 'p_l3', from: 'n_latent', to: 'n_x3', twoSided: false },
    // means: constant to each manifest
    { id: 'p_m1', from: 'n_const', to: 'n_x1', twoSided: false },
    { id: 'p_m2', from: 'n_const', to: 'n_x2', twoSided: false },
    { id: 'p_m3', from: 'n_const', to: 'n_x3', twoSided: false },
    // error loadings: error variables to manifests
    { id: 'p_err_x1', from: 'n_err_x1', to: 'n_x1', twoSided: false },
    { id: 'p_err_x3', from: 'n_err_x3', to: 'n_x3', twoSided: false }
  ])
  const [mode, setMode] = useState<Mode>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pathSource, setPathSource] = useState<string | null>(null)
  const [showPathLabels, setShowPathLabels] = useState<boolean>(true)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  // pending drag holds initial press until movement threshold is reached
  const pendingDragRef = useRef<{ id: string; startClientX: number; startClientY: number; offsetX: number; offsetY: number } | null>(null)
  // track which node the cursor is hovering over (for path drop target)
  const hoverNodeRef = useRef<string | null>(null)
  const [tempLine, setTempLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

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
      const twoSided = (mode as any) === 'add-two-path'

      // do not create a one-headed self-path; self-paths should be two-headed (variance)
      if (src === dst && !twoSided) {
        setTempLine(null)
        setPathSource(null)
        setMode('select')
        return
      }

      // enforce uniqueness: only one one-headed path from one shape to another
      if (!twoSided) {
        const exists = paths.find((pp) => pp.from === src && pp.to === dst && pp.twoSided === false)
        if (exists) {
          // clear temp and return to select
          setTempLine(null)
          setPathSource(null)
          setMode('select')
          return
        }
      }

      const np: Path = { id: uid('p_'), from: src as string, to: dst as string, twoSided }
      setPaths((ps) => [...ps, np])
      setTempLine(null)
      setPathSource(null)
      setMode('select')
      return
    }

    // if we were creating a path but released on background, cancel and revert to select
    if (pathSource) {
      setPathSource(null)
      setTempLine(null)
      setMode('select')
    }
  }

  function onCanvasClick(e: React.MouseEvent) {
    const p = clientToSvg(e)
    if (mode === 'add-manifest' || mode === 'add-latent' || mode === 'add-constant') {
      const type: NodeType = mode === 'add-manifest' ? 'manifest' : mode === 'add-latent' ? 'latent' : 'constant'
      const n: Node = { id: uid('n_'), x: p.x, y: p.y, label: type === 'constant' ? '1' : `${type[0].toUpperCase()}${nodes.length + 1}`, type }
      if (type === 'manifest') {
        n.width = MANIFEST_DEFAULT_W
        n.height = MANIFEST_DEFAULT_H
      }
      setNodes((s) => [...s, n])
      setSelectedId(n.id)

      // add variance path automatically for manifest & latent
      if (type !== 'constant') {
        const variance: Path = { id: uid('p_'), from: n.id, to: n.id, twoSided: true }
        setPaths((ps) => [...ps, variance])
      }

      setMode('select')
      return
    }

    // clicking background reverts to select/drag mode and clears selection
    setSelectedId(null)
    setPathSource(null)
    setMode('select')
  }

  function onNodeMouseDown(e: React.MouseEvent, n: Node) {
    e.stopPropagation()
    hoverNodeRef.current = n.id
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
    setSelectedId(n.id)
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
      const twoSided = (mode as any) === 'add-two-path'

      // do not create a one-headed self-path; self-paths should be two-headed (variance)
      if (src === dst && !twoSided) {
        setTempLine(null)
        setPathSource(null)
        setMode('select')
        return
      }

      // enforce uniqueness: only one one-headed path from one shape to another
      if (!twoSided) {
        const exists = paths.find((pp) => pp.from === src && pp.to === dst && pp.twoSided === false)
        if (exists) {
          // clear temp and return to select
          setTempLine(null)
          setPathSource(null)
          setMode('select')
          return
        }
      }

      const p: Path = { id: uid('p_'), from: src, to: dst, twoSided }
      setPaths((ps) => [...ps, p])
      setTempLine(null)
      setPathSource(null)
      setMode('select')
      return
    }

    // if we were creating a path but released on background, cancel and revert to select
    if (pathSource) {
      setPathSource(null)
      setTempLine(null)
      setMode('select')
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

    if (n.type === 'latent') {
      const r = LATENT_RADIUS
      return { x: cx + (dx * (r / dist)), y: cy + (dy * (r / dist)) }
    }

    if (n.type === 'manifest') {
      const halfW = (n.width ?? MANIFEST_DEFAULT_W) / 2
      const halfH = (n.height ?? MANIFEST_DEFAULT_H) / 2
      // if dx or dy is 0, avoid division by zero
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
    if (from.type === 'manifest') {
      const w = from.width ?? MANIFEST_DEFAULT_W
      const h = from.height ?? MANIFEST_DEFAULT_H
      nodeRadAlongSide = side === 'left' || side === 'right' ? w / 2 : h / 2
    }
    if (from.type === 'constant') nodeRadAlongSide = 22
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
    const from = nodes.find((n) => n.id === p.from)
    const to = nodes.find((n) => n.id === p.to)
    if (!from || !to) return ''
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
    const from = nodes.find((n) => n.id === p.from)
    const to = nodes.find((n) => n.id === p.to)
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

  return (
    <div className="flex canvas-container">
      <aside className="w-48 border-r p-3 space-y-3">
        <div className="space-y-2">
          <div className="text-sm font-medium">Tools</div>
          <div className="grid grid-cols-1 gap-2">
            <button
              className={`py-2 rounded ${mode === 'add-manifest' ? 'bg-sky-600 text-white' : 'bg-white border'}`}
              onClick={() => setMode('add-manifest')}
            >
              Add Manifest (square)
            </button>
            <button
              className={`py-2 rounded ${mode === 'add-latent' ? 'bg-sky-600 text-white' : 'bg-white border'}`}
              onClick={() => setMode('add-latent')}
            >
              Add Latent (circle)
            </button>
            <button
              className={`py-2 rounded ${mode === 'add-constant' ? 'bg-sky-600 text-white' : 'bg-white border'}`}
              onClick={() => setMode('add-constant')}
            >
              Add Constant (triangle)
            </button>
            <button
              className={`py-2 rounded ${mode === 'add-one-path' ? 'bg-sky-600 text-white' : 'bg-white border'}`}
              onClick={() => {
                setMode('add-one-path')
                setPathSource(null)
              }}
            >
              Add One-headed Path
            </button>
            <button
              className={`py-2 rounded ${mode === 'add-two-path' ? 'bg-sky-600 text-white' : 'bg-white border'}`}
              onClick={() => {
                setMode('add-two-path')
                setPathSource(null)
              }}
            >
              Add Two-headed Path
            </button>
          </div>
          <div className="pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showPathLabels} onChange={(e) => setShowPathLabels(e.target.checked)} />
              <span>Show path labels</span>
            </label>
          </div>
          <div className="text-xs text-slate-500">Mode: {mode}{pathSource ? ` (source selected)` : ''}</div>
        </div>
        <div className="pt-2 border-t">
          <div className="text-xs">Nodes: {nodes.length}</div>
          <div className="text-xs">Paths: {paths.length}</div>
        </div>
      </aside>

      <div className="flex-1 p-4">
        <svg
          ref={svgRef}
          className="w-full h-[600px] bg-white border rounded"
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onClick={onCanvasClick}
        >
          <defs>
            <marker id="arrow-end" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto">
              <path d="M0,0 L10,4 L0,8 z" fill="#000" />
            </marker>
            <marker id="arrow-start" markerWidth="10" markerHeight="8" refX="0" refY="4" orient="auto">
              <path d="M10,0 L0,4 L10,8 z" fill="#000" />
            </marker>
          </defs>

          {/* draw paths */}
          {paths.map((p) => (
            <path
              key={p.id}
              d={pathD(p)}
              fill="none"
              stroke="#000"
              strokeWidth={1.6}
              markerEnd={!p.twoSided ? 'url(#arrow-end)' : 'url(#arrow-end)'}
              markerStart={p.twoSided ? 'url(#arrow-start)' : undefined}
            />
          ))}

          {/* path labels */}
          {showPathLabels &&
            paths.map((p) => {
              const pos = pathLabelPos(p)
              if (!pos) return null
              const fontSize = 12
              const padding = 6
              // approximate char width for monospace-ish label: ~0.6 * fontSize
              const approxCharW = fontSize * 0.6
              const width = Math.max(24, approxCharW * p.id.length + padding * 2)
              const height = fontSize + padding
              const rx = 4
              return (
                <g key={`${p.id}-label`} transform={`translate(${pos.x}, ${pos.y})`} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={-width / 2}
                    y={-height / 2}
                    width={width}
                    height={height}
                    rx={rx}
                    fill="#fff"
                    stroke="none"
                    opacity={0.95}
                  />
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={fontSize}
                    fill="#000"
                    style={{ userSelect: 'none' }}
                  >
                    {p.id}
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

          {/* draw nodes */}
          {nodes.map((n) => {
            const isSelected = n.id === selectedId
            const common = { fill: '#fff', stroke: '#000', strokeWidth: 1.5 }
            if (n.type === 'manifest') {
                      const w = n.width ?? 60
                      const h = n.height ?? 60
                      const halfW = w / 2
                      const halfH = h / 2
                      return (
                        <g key={n.id} transform={`translate(${n.x - halfW}, ${n.y - halfH})`}>
                          <rect
                            width={w}
                            height={h}
                            rx={4}
                            {...common}
                            fill="#fff"
                            pointerEvents="auto"
                            onMouseDown={(e) => onNodeMouseDown(e, n)}
                            onMouseEnter={() => (hoverNodeRef.current = n.id)}
                            onMouseLeave={() => (hoverNodeRef.current = null)}
                            style={{ cursor: 'grab' }}
                          />
                          <text x={w / 2} y={h / 2 + 6} textAnchor="middle" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                            {n.label}
                          </text>
                        </g>
                      )
            }
            if (n.type === 'latent') {
              return (
                <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                  <circle r={LATENT_RADIUS} {...common} cx={0} cy={0} fill="#fff" pointerEvents="auto" onMouseDown={(e) => onNodeMouseDown(e, n)} onMouseEnter={() => (hoverNodeRef.current = n.id)} onMouseLeave={() => (hoverNodeRef.current = null)} style={{ cursor: 'grab' }} />
                  <text x={0} y={6} textAnchor="middle" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {n.label}
                  </text>
                </g>
              )
            }
            // constant triangle
            return (
              <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                <polygon
                  points="0,-22 19,11 -19,11"
                  {...common}
                  fill="#fff"
                  pointerEvents="auto"
                  onMouseDown={(e) => onNodeMouseDown(e, n)}
                  onMouseEnter={() => (hoverNodeRef.current = n.id)}
                  onMouseLeave={() => (hoverNodeRef.current = null)}
                  style={{ cursor: 'grab' }}
                />
                <text x={0} y={6} textAnchor="middle" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {n.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
 
