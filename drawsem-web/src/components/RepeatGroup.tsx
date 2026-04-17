/**
 * RepeatGroup.tsx
 *
 * SVG rendering for a coordinate repeat group — both expanded and collapsed views.
 *
 * Expanded view:  a tinted background rect spanning all instances, with
 *                 a dimension label, a right-edge drag handle, and a
 *                 collapse toggle button.
 *
 * Collapsed view: a stacked-deck visual (2 offset shadow rects behind the
 *                 front copy), a count badge, a drag handle, a data-path
 *                 target port, and an expand toggle button.
 *
 * This component renders only the group chrome (box, handle, badge, toggle).
 * The actual nodes and paths inside instances are rendered by CanvasTool
 * from the expanded node/path lists computed by coordinateExpansion.ts.
 */

import React from 'react'
import { RuntimeRepeatGroup } from '../utils/helpers'
import { BBox, groupHandleX } from '../utils/coordinateExpansion'

// Visual constants for group rendering
const GROUP_FILL_EXPANDED = 'rgba(99, 179, 237, 0.08)'   // light blue tint
const GROUP_STROKE_EXPANDED = '#63b3ed'                   // blue border
const GROUP_FILL_COLLAPSED = 'rgba(99, 179, 237, 0.12)'
const GROUP_STROKE_COLLAPSED = '#4299e1'
const HANDLE_W = 16
const HANDLE_H = 40
const BADGE_FONT = 11
const STACK_OFFSET = 6    // px offset for each shadow layer behind the front
const STACK_LAYERS = 2    // number of shadow layers
const TOGGLE_R = 10       // radius of the toggle circle button
const PORT_SIZE = 12      // size of the data-path target port square

interface RepeatGroupProps {
  group: RuntimeRepeatGroup
  /** Pre-computed bbox of the template nodes, in canvas space */
  templateBBox: BBox
  /** Whether this group is currently selected */
  isSelected: boolean
  /** Called when the user clicks the expand/collapse toggle */
  onToggleView: (groupId: string) => void
  /** Called when the user starts dragging the expand handle */
  onHandleDragStart: (groupId: string, e: React.MouseEvent) => void
  /** Called when the user starts dragging the group body (to move it) */
  onBodyDragStart: (groupId: string, e: React.MouseEvent) => void
  /** Called when the user clicks the group box background (to select it) */
  onSelect: (groupId: string) => void
}

export default function RepeatGroup({
  group,
  templateBBox,
  isSelected,
  onToggleView,
  onHandleDragStart,
  onBodyDragStart,
  onSelect,
}: RepeatGroupProps): JSX.Element {
  const { viewState, instanceCount } = group
  const {
    templateX,
    templateY,
    instanceWidth,
    instanceHeight,
    instanceSpacing,
    axis,
  } = group.visual

  // Full bounding box of all instances (expanded), or just the template (collapsed)
  const totalWidth =
    viewState === 'expanded' && axis === 'horizontal'
      ? instanceCount * (instanceWidth + instanceSpacing) - instanceSpacing
      : instanceWidth

  const totalHeight =
    viewState === 'expanded' && axis === 'vertical'
      ? instanceCount * (instanceHeight + instanceSpacing) - instanceSpacing
      : instanceHeight

  const boxX = templateX
  const boxY = templateY
  const stroke = isSelected
    ? '#2b6cb0'
    : viewState === 'expanded'
    ? GROUP_STROKE_EXPANDED
    : GROUP_STROKE_COLLAPSED
  const strokeWidth = isSelected ? 2 : 1.5

  // Handle position: right edge of full box
  const handleX = boxX + totalWidth
  const handleY = boxY + totalHeight / 2

  // Toggle button position: top-right corner of the box
  const toggleX = boxX + totalWidth - TOGGLE_R - 4
  const toggleY = boxY + TOGGLE_R + 4

  return (
    <g className="repeat-group" data-group-id={group.id}>

      {/* ---- Collapsed view: stacked deck shadow layers ---- */}
      {viewState === 'collapsed' &&
        Array.from({ length: STACK_LAYERS }, (_, i) => {
          const offset = (STACK_LAYERS - i) * STACK_OFFSET
          return (
            <rect
              key={`stack-${i}`}
              x={boxX + offset}
              y={boxY + offset}
              width={instanceWidth}
              height={instanceHeight}
              rx={6}
              fill={GROUP_FILL_COLLAPSED}
              stroke={GROUP_STROKE_COLLAPSED}
              strokeWidth={1}
              opacity={0.5 - i * 0.1}
              style={{ pointerEvents: 'none' }}
            />
          )
        })}

      {/* ---- Main group box (front layer / expanded background) ---- */}
      <rect
        x={boxX}
        y={boxY}
        width={viewState === 'expanded' ? totalWidth : instanceWidth}
        height={viewState === 'expanded' ? totalHeight : instanceHeight}
        rx={6}
        fill={viewState === 'expanded' ? GROUP_FILL_EXPANDED : GROUP_FILL_COLLAPSED}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={viewState === 'expanded' ? '6 3' : undefined}
        style={{ cursor: 'move' }}
        onMouseDown={(e) => {
          e.stopPropagation()
          onBodyDragStart(group.id, e)
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(group.id)
        }}
      />

      {/* ---- Dimension label (top-left of box) ---- */}
      <text
        x={boxX + 8}
        y={boxY + 14}
        fontSize={10}
        fill={stroke}
        fontWeight="600"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {group.coordinateDimension}
      </text>

      {/* ---- Count badge (collapsed) or instance count label (expanded) ---- */}
      {viewState === 'collapsed' ? (
        <g style={{ pointerEvents: 'none' }}>
          <rect
            x={boxX + instanceWidth - 28}
            y={boxY + instanceHeight - 18}
            width={26}
            height={16}
            rx={8}
            fill={GROUP_STROKE_COLLAPSED}
            opacity={0.9}
          />
          <text
            x={boxX + instanceWidth - 15}
            y={boxY + instanceHeight - 7}
            fontSize={BADGE_FONT}
            fill="white"
            textAnchor="middle"
            fontWeight="bold"
            dominantBaseline="central"
          >
            ×{group.dataSource ? 'N' : instanceCount}
          </text>
        </g>
      ) : (
        // In expanded view, show subscript labels above each instance
        Array.from({ length: instanceCount }, (_, k) => {
          const ix =
            axis === 'horizontal'
              ? boxX + k * (instanceWidth + instanceSpacing) + instanceWidth / 2
              : boxX + instanceWidth / 2
          const iy =
            axis === 'vertical'
              ? boxY + k * (instanceHeight + instanceSpacing) + 10
              : boxY + 10
          return (
            <text
              key={`inst-label-${k}`}
              x={ix}
              y={iy}
              fontSize={9}
              fill={GROUP_STROKE_EXPANDED}
              textAnchor="middle"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              [{k}]
            </text>
          )
        })
      )}

      {/* ---- Right-edge drag handle ---- */}
      <g
        style={{ cursor: group.dataSource ? 'not-allowed' : 'ew-resize' }}
        onMouseDown={(e) => {
          if (group.dataSource) return  // data-driven: handle disabled
          e.stopPropagation()
          onHandleDragStart(group.id, e)
        }}
      >
        <rect
          x={handleX - HANDLE_W / 2}
          y={handleY - HANDLE_H / 2}
          width={HANDLE_W}
          height={HANDLE_H}
          rx={4}
          fill={group.dataSource ? '#a0aec0' : GROUP_STROKE_EXPANDED}
          opacity={group.dataSource ? 0.4 : 0.85}
        />
        {/* Grip lines */}
        {[-4, 0, 4].map((dy) => (
          <line
            key={dy}
            x1={handleX - 3}
            y1={handleY + dy}
            x2={handleX + 3}
            y2={handleY + dy}
            stroke="white"
            strokeWidth={1.5}
            strokeLinecap="round"
            style={{ pointerEvents: 'none' }}
          />
        ))}
      </g>

      {/* ---- Data-path target port (collapsed view only) ---- */}
      {viewState === 'collapsed' && (
        <g style={{ pointerEvents: 'auto' }}>
          <rect
            x={boxX - PORT_SIZE / 2}
            y={boxY + instanceHeight / 2 - PORT_SIZE / 2}
            width={PORT_SIZE}
            height={PORT_SIZE}
            rx={3}
            fill="white"
            stroke={GROUP_STROKE_COLLAPSED}
            strokeWidth={1.5}
            strokeDasharray="3 2"
            style={{ cursor: 'crosshair' }}
          />
          <text
            x={boxX}
            y={boxY + instanceHeight / 2 + 1}
            fontSize={7}
            fill={GROUP_STROKE_COLLAPSED}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            data
          </text>
        </g>
      )}

      {/* ---- Expand / Collapse toggle button ---- */}
      <g
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          onToggleView(group.id)
        }}
      >
        <circle
          cx={toggleX}
          cy={toggleY}
          r={TOGGLE_R}
          fill="white"
          stroke={stroke}
          strokeWidth={1.5}
        />
        <text
          x={toggleX}
          y={toggleY + 1}
          fontSize={10}
          textAnchor="middle"
          dominantBaseline="central"
          fill={stroke}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {viewState === 'expanded' ? '⊟' : '⊞'}
        </text>
      </g>

    </g>
  )
}
