/**
 * DataTablePanel.tsx
 *
 * Floating panel shown in "Table" data-viz mode (Exploratory Features).
 * Lists all columns for each dataset node, indicates which variable node
 * each column is connected to, and supports:
 *   - Drag-to-canvas (same semantics as the dataset inspector column drag)
 *   - Hover highlight (synced with canvas via hoveredColumnName)
 *   - "Add all unconnected as nodes" button
 *
 * One tab per dataset node. Unconnected columns are shown at reduced
 * opacity with a broken-link icon instead of a node name.
 */

import React from 'react'
import { Node, Path } from '../utils/helpers'

interface DataTablePanelProps {
  /** All dataset nodes in the current model (may or may not have .dataset loaded) */
  datasetNodes: Node[]
  /** All paths in the model (used to resolve column→node connections) */
  paths: Path[]
  /** All nodes (used to look up display names of connected variables) */
  allNodes: Node[]
  /** Id of the currently active dataset tab */
  activeTabId: string | null
  onTabChange: (datasetNodeId: string) => void
  draggedColumnName: string | null
  hoveredColumnName: string | null
  onDragStart: (col: string) => void
  onDragEnd: () => void
  onHover: (col: string | null) => void
  /** Called when user clicks "Add all unconnected as nodes" */
  onAddUnconnected: (datasetNodeId: string) => void
  /** Called when the panel's close button is clicked */
  onClose: () => void
}

/** Broken-link SVG icon for unconnected columns */
function UnlinkIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      className="inline-block align-middle"
      aria-label="Not connected"
    >
      <path
        d="M8 12H4a4 4 0 000 8h4m4-8h4a4 4 0 000-8h-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line x1="8" y1="8" x2="8" y2="5"  stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="8" y1="19" x2="8" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="16" y1="8" x2="16" y2="5"  stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="16" y1="19" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

export default function DataTablePanel({
  datasetNodes,
  paths,
  allNodes,
  activeTabId,
  onTabChange,
  draggedColumnName,
  hoveredColumnName,
  onDragStart,
  onDragEnd,
  onHover,
  onAddUnconnected,
  onClose,
}: DataTablePanelProps): JSX.Element | null {
  if (datasetNodes.length === 0) return null

  // Resolve active dataset, defaulting to first
  const activeDataset =
    datasetNodes.find((n) => n.id === activeTabId) ?? datasetNodes[0]

  // Build column → connected variable display-name map for the active dataset
  const connectionMap = React.useMemo(() => {
    const map = new Map<string, string>()
    paths
      .filter(
        (p) =>
          p.from === activeDataset.id &&
          p.type === 'data' &&
          typeof p.label === 'string' &&
          p.label.length > 0
      )
      .forEach((p) => {
        const target = allNodes.find((n) => n.id === p.to)
        if (target && p.label) {
          map.set(p.label, target.displayName ?? target.label)
        }
      })
    return map
  }, [paths, allNodes, activeDataset.id])

  // Resolve column list: prefer loaded CSV headers, fall back to schema columnTypes keys
  const columns: string[] = React.useMemo(() => {
    if (activeDataset.dataset?.headers?.length) {
      return activeDataset.dataset.headers
    }
    if (activeDataset.datasetSource?.columnTypes) {
      return Object.keys(activeDataset.datasetSource.columnTypes)
    }
    return []
  }, [activeDataset])

  const unconnectedCount = columns.filter((col) => !connectionMap.has(col)).length
  const hasData = columns.length > 0

  return (
    <div className="absolute top-4 right-4 z-40 w-72 bg-white border rounded shadow-lg flex flex-col max-h-[72vh] select-none">

      {/* ---- Header ---- */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50 rounded-t shrink-0">
        <div className="text-xs font-semibold text-slate-700">Data Columns</div>
        <button
          onClick={onClose}
          title="Close (switch to Paths view)"
          className="text-slate-400 hover:text-slate-600 text-base leading-none px-1"
        >
          ✕
        </button>
      </div>

      {/* ---- Dataset tabs (only when >1 dataset) ---- */}
      {datasetNodes.length > 1 && (
        <div className="flex border-b overflow-x-auto shrink-0 bg-white">
          {datasetNodes.map((ds) => (
            <button
              key={ds.id}
              onClick={() => onTabChange(ds.id)}
              className={`px-3 py-1.5 text-xs whitespace-nowrap border-b-2 transition-colors ${
                ds.id === activeDataset.id
                  ? 'border-sky-500 text-sky-700 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {ds.label}
            </button>
          ))}
        </div>
      )}

      {/* ---- Column table ---- */}
      <div className="overflow-y-auto flex-1">
        {!hasData ? (
          <div className="text-xs text-slate-400 p-3 italic">
            No columns loaded.
            {activeDataset.datasetSource?.location && (
              <span> Expected: <code className="font-mono">{activeDataset.datasetSource.location}</code></span>
            )}
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b">
                <th className="text-left px-3 py-1.5 text-slate-500 font-medium w-1/2">Column</th>
                <th className="text-left px-3 py-1.5 text-slate-500 font-medium w-1/2">Connected node</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => {
                const connectedLabel = connectionMap.get(col)
                const isConnected = connectedLabel !== undefined
                const isHovered = hoveredColumnName === col
                const isDragging = draggedColumnName === col

                return (
                  <tr
                    key={col}
                    draggable
                    onDragStart={() => onDragStart(col)}
                    onDragEnd={onDragEnd}
                    onMouseEnter={() => onHover(col)}
                    onMouseLeave={() => onHover(null)}
                    className={[
                      'cursor-move border-b border-slate-50 transition-colors',
                      isDragging  ? 'opacity-40' :
                      isHovered   ? 'bg-blue-50' :
                      !isConnected ? 'opacity-55 hover:bg-slate-50' :
                                    'hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <td className="px-3 py-1.5 font-mono truncate max-w-0 w-1/2">
                      {col}
                    </td>
                    <td className="px-3 py-1.5 w-1/2">
                      {isConnected ? (
                        <span className="text-slate-700 truncate block">{connectedLabel}</span>
                      ) : (
                        <span className="text-slate-400" title="No node connected">
                          <UnlinkIcon />
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- Footer: unconnected count + add-all button ---- */}
      {hasData && (
        <div className="border-t px-3 py-2 flex items-center justify-between bg-slate-50 rounded-b shrink-0">
          <span className="text-xs text-slate-500">
            {unconnectedCount === 0
              ? 'All columns connected'
              : `${unconnectedCount} unconnected`}
          </span>
          {unconnectedCount > 0 && (
            <button
              onClick={() => onAddUnconnected(activeDataset.id)}
              title="Add a variable node for every unconnected column, arranged in a grid"
              className="text-xs px-2 py-1 bg-sky-600 text-white rounded hover:bg-sky-700 transition-colors"
            >
              Add all as nodes
            </button>
          )}
        </div>
      )}

    </div>
  )
}
