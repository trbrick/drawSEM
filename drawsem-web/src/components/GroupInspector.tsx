/**
 * GroupInspector.tsx
 *
 * Inspector panel for a selected repeat group.
 * Shown in the floating popup when the user clicks a group box.
 *
 * Fields:
 *   - Coordinate dimension name
 *   - Instance count (manual, disabled when data-driven)
 *   - Data source (dataset + column picker) — visual only in this prototype
 *   - View toggle (expanded / collapsed)
 *   - Layout axis (horizontal active; vertical disabled with tooltip)
 */

import React from 'react'
import { RuntimeRepeatGroup } from '../utils/helpers'

interface GroupInspectorProps {
  group: RuntimeRepeatGroup
  /** Available dataset node labels for data-source picker */
  datasetNodeLabels: string[]
  /** Called when any group property changes */
  onChange: (groupId: string, updates: Partial<RuntimeRepeatGroup>) => void
  /** Called when the user clicks Delete */
  onDelete: (groupId: string) => void
  /** Called when popup close button is clicked */
  onClose: () => void
}

export default function GroupInspector({
  group,
  datasetNodeLabels,
  onChange,
  onDelete,
  onClose,
}: GroupInspectorProps): JSX.Element {
  const isDataDriven = group.dataSource != null

  return (
    <div className="text-xs space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-semibold text-slate-800">
          Repeat Group
        </div>
        <div className="flex items-center gap-2">
          <button
            title="Delete group (ungroups nodes)"
            className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"
            onClick={() => onDelete(group.id)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M9 6V4h6v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            title="Close"
            className="p-1 rounded hover:bg-slate-100"
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#333" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Coordinate dimension name */}
      <div>
        <label className="font-medium block mb-1">Coordinate dimension</label>
        <input
          type="text"
          value={group.coordinateDimension}
          onChange={(e) =>
            onChange(group.id, { coordinateDimension: e.target.value.trim() || group.coordinateDimension })
          }
          placeholder="e.g. student_id"
          className="w-full px-2 py-1 border rounded text-xs bg-white font-mono"
        />
        <div className="text-slate-500 mt-1">
          Stored in <code>parametrization.coordinates[0]</code>
        </div>
      </div>

      {/* Instance count */}
      <div>
        <label className="font-medium block mb-1">Instances</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={50}
            value={isDataDriven ? group.instanceCount : group.instanceCount}
            disabled={isDataDriven}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              if (!isNaN(n) && n >= 1) {
                onChange(group.id, { instanceCount: n })
              }
            }}
            className={`w-20 px-2 py-1 border rounded text-xs bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
              isDataDriven ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          />
          {isDataDriven && (
            <span className="text-slate-500 italic">determined by data</span>
          )}
        </div>
        {isDataDriven && (
          <div className="text-slate-500 mt-1">
            Hint: {group.instanceCount} (overridden by dataset column distinct values)
          </div>
        )}
      </div>

      {/* Data source (visual only — wiring deferred) */}
      <div className="border-t pt-3">
        <label className="font-medium block mb-1">
          Data source{' '}
          <span className="text-slate-400 font-normal">(visual only in prototype)</span>
        </label>
        <select
          value={group.dataSource?.datasetNodeLabel ?? ''}
          onChange={(e) => {
            const label = e.target.value
            if (!label) {
              onChange(group.id, { dataSource: null })
            } else {
              onChange(group.id, {
                dataSource: {
                  datasetNodeLabel: label,
                  column: group.dataSource?.column ?? '',
                },
              })
            }
          }}
          className="w-full px-2 py-1 border rounded text-xs bg-white"
        >
          <option value="">— none (manual count) —</option>
          {datasetNodeLabels.map((lbl) => (
            <option key={lbl} value={lbl}>
              {lbl}
            </option>
          ))}
        </select>
        {group.dataSource && (
          <div className="mt-2">
            <label className="font-medium block mb-1">Column</label>
            <input
              type="text"
              value={group.dataSource.column}
              onChange={(e) =>
                onChange(group.id, {
                  dataSource: {
                    ...group.dataSource!,
                    column: e.target.value,
                  },
                })
              }
              placeholder="e.g. student_id"
              className="w-full px-2 py-1 border rounded text-xs bg-white font-mono"
            />
          </div>
        )}
      </div>

      {/* View state toggle */}
      <div className="border-t pt-3">
        <label className="font-medium block mb-1">View</label>
        <div className="flex gap-2">
          {(['expanded', 'collapsed'] as const).map((v) => (
            <button
              key={v}
              onClick={() => onChange(group.id, { viewState: v })}
              className={`px-3 py-1 rounded border text-xs ${
                group.viewState === v
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white border-slate-300 hover:bg-slate-50'
              }`}
            >
              {v === 'expanded' ? '⊞ Expanded' : '⊟ Collapsed'}
            </button>
          ))}
        </div>
      </div>

      {/* Layout axis */}
      <div className="border-t pt-3">
        <label className="font-medium block mb-1">Layout axis</label>
        <div className="flex gap-2">
          <button
            onClick={() =>
              onChange(group.id, {
                visual: { ...group.visual, axis: 'horizontal' },
              })
            }
            className={`px-3 py-1 rounded border text-xs ${
              group.visual.axis === 'horizontal'
                ? 'bg-sky-600 text-white border-sky-600'
                : 'bg-white border-slate-300 hover:bg-slate-50'
            }`}
          >
            ↔ Horizontal
          </button>
          <button
            disabled
            title="Vertical axis is out of scope for this prototype"
            className="px-3 py-1 rounded border text-xs bg-white border-slate-200 text-slate-400 cursor-not-allowed"
          >
            ↕ Vertical
          </button>
        </div>
        <div className="text-slate-400 mt-1">
          Vertical axis deferred (prototype limitation)
        </div>
      </div>

      {/* Node membership summary */}
      <div className="border-t pt-3">
        <label className="font-medium block mb-1">
          Nodes in group ({group.nodeIds.length})
        </label>
        <div className="text-slate-600 font-mono text-[11px] leading-relaxed">
          {group.nodeIds.slice(0, 8).join(', ')}
          {group.nodeIds.length > 8 && (
            <span className="text-slate-400"> +{group.nodeIds.length - 8} more</span>
          )}
        </div>
      </div>
    </div>
  )
}
