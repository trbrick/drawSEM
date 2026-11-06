/**
 * The data mapping row of a variable's inspector: one row per data path into
 * it (its dataset and the column it maps) with a "Same as variable name"
 * checkbox (a runtime-only link, see utils/dataMapping.ts), how the link is
 * set (load, R pushes, column drops), renames following it, and the
 * missing-column warning (inspector and cable label).
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, fireEvent, act, within } from '@testing-library/react'
import CanvasTool from '../../src/components/CanvasTool'
import { AdapterContext } from '../../src/context/AdapterContext'
import type { GraphAdapter, GraphSchema, ModelUpdateKind } from '../../src/core/types'
import { convertToUnicode } from '../../src/utils/converters'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  cleanup()
})

/*
 * F -> x1, x2, x3; dataset D (embedded, columns x1, x2, col_b) at (0, 350)
 * feeds x1 (column x1), x2 (column col_b) and x3 (column gone: missing).
 */
function fixture(extra: { nodes?: any[]; paths?: any[] } = {}): GraphSchema {
  return {
    schemaVersion: 0,
    models: {
      m: {
        nodes: [
          { label: 'F', type: 'variable', visual: { x: 0, y: 0 } },
          { label: 'x1', type: 'variable', visual: { x: -100, y: 150 } },
          { label: 'x2', type: 'variable', visual: { x: 0, y: 150 } },
          { label: 'x3', type: 'variable', visual: { x: 100, y: 150 } },
          {
            label: 'D', type: 'dataset', visual: { x: 0, y: 350 },
            datasetSource: { type: 'embedded', columnTypes: { x1: 'number', x2: 'number', col_b: 'number' }, object: [{ x1: 1, x2: 2, col_b: 3 }] },
          },
          ...(extra.nodes ?? []),
        ],
        paths: [
          { from: 'F', to: 'x1', numberOfArrows: 1 },
          { from: 'F', to: 'x2', numberOfArrows: 1 },
          { from: 'F', to: 'x3', numberOfArrows: 1 },
          { from: 'D', to: 'x1', type: 'data', label: 'x1' },
          { from: 'D', to: 'x2', type: 'data', label: 'col_b' },
          { from: 'D', to: 'x3', type: 'data', label: 'gone' },
          ...(extra.paths ?? []),
        ],
      },
    },
  } as unknown as GraphSchema
}

type Receive = (s: GraphSchema, u?: { kind?: ModelUpdateKind }) => void

async function setup(schema: GraphSchema = fixture()) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response))
  let receive: Receive | null = null
  const onModelChange = vi.fn()
  const adapter: GraphAdapter = {
    load: vi.fn(async () => { throw new Error('unused') }),
    save: vi.fn(async () => {}),
    export: vi.fn(async () => 'mock'),
    onModelReceived: (cb) => { receive = cb },
  }
  const utils = render(
    <AdapterContext.Provider value={adapter}>
      <CanvasTool initialSchema={schema} onModelChange={onModelChange} viewMode="shiny" />
    </AdapterContext.Provider>
  )
  await waitFor(() => expect(onModelChange).toHaveBeenCalled())
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  const svg = utils.container.querySelector('svg.w-full') as any
  // jsdom has no SVG geometry: identity screen transform (client = svg coords)
  svg.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y } } })
  svg.getScreenCTM = () => ({ a: 1, inverse: () => ({}) })
  const root = utils.container.querySelector('.canvas-container') as HTMLElement
  const push = (s: GraphSchema, kind: ModelUpdateKind) => act(() => receive!(s, { kind }))
  return { ...utils, svg: svg as SVGSVGElement, root, onModelChange, push }
}

type Ctx = Awaited<ReturnType<typeof setup>>

const nextTask = () => act(async () => { await Promise.resolve() })

function lastModel(ctx: Ctx): any {
  const calls = ctx.onModelChange.mock.calls
  return Object.values(calls[calls.length - 1][0].models)[0]
}
const dataPathTo = (ctx: Ctx, label: string) => lastModel(ctx).paths.find((p: any) => p.type === 'data' && p.to === label)

/** The <g> of the node labelled `label` (nodes are drawn after the path labels). */
function nodeGroup(ctx: Ctx, label: string): Element {
  const g = Array.from(ctx.container.querySelectorAll('svg.w-full g')).reverse().find((el) => el.querySelector(':scope > text')?.textContent === convertToUnicode(label))
  if (!g) throw new Error(`no node ${label}`)
  return g
}
async function clickNode(ctx: Ctx, label: string) {
  fireEvent.mouseDown(nodeGroup(ctx, label).firstElementChild!, { button: 0 })
  fireEvent.mouseUp(ctx.svg, { button: 0 })
  await nextTask()
}
const linkBox = () => screen.getByLabelText('Same as variable name') as HTMLInputElement
const columnField = () => screen.getByLabelText('Column of D') as HTMLInputElement
const labelField = (ctx: Ctx) => {
  const label = Array.from(ctx.container.querySelectorAll('span.font-medium')).find((s) => s.textContent === 'Label:')!
  return label.parentElement!.querySelector('input') as HTMLInputElement
}
const undo = (ctx: Ctx) => fireEvent.keyDown(ctx.root, { key: 'z', ctrlKey: true })

describe('the data mapping row', () => {
  it('after load: linked (ticked, field greyed out showing the variable name) where the names match', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'x1')
    expect(screen.getAllByTestId('data-mapping-row')).toHaveLength(1)
    expect(linkBox().checked).toBe(true)
    expect(columnField().disabled).toBe(true)
    expect(columnField().value).toBe('x1')
    await clickNode(ctx, 'x2')
    expect(linkBox().checked).toBe(false)
    expect(columnField().disabled).toBe(false)
    expect(columnField().value).toBe('col_b')
    // a latent variable has no row
    await clickNode(ctx, 'F')
    expect(screen.queryByTestId('data-mapping-row')).toBeNull()
  })

  it('renaming a linked variable in the inspector renames its mapping, as one undo step', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'x1')
    fireEvent.change(labelField(ctx), { target: { value: 'y1' } })
    await waitFor(() => expect(dataPathTo(ctx, 'y1')).toMatchObject({ from: 'D', label: 'y1' }))
    expect(columnField().value).toBe('y1')
    expect(linkBox().checked).toBe(true)
    labelField(ctx).blur()
    undo(ctx)
    await waitFor(() => expect(dataPathTo(ctx, 'x1')).toMatchObject({ label: 'x1' }))
    expect(lastModel(ctx).nodes.map((n: any) => n.label)).toContain('x1')
  })

  it('renaming a linked variable inline (double-click its name) renames its mapping', async () => {
    const ctx = await setup()
    fireEvent.doubleClick(nodeGroup(ctx, 'x1').querySelector(':scope > text')!)
    const input = await waitFor(() => {
      const el = ctx.container.querySelector('input[style*="absolute"]') as HTMLInputElement
      expect(el).toBeTruthy()
      return el
    })
    fireEvent.change(input, { target: { value: 'z1' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(dataPathTo(ctx, 'z1')).toMatchObject({ label: 'z1' }))
  })

  it('unticking frees the field; edits map another column; renames no longer follow; ticking maps the name again', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'x1')
    fireEvent.click(linkBox())
    await nextTask()
    expect(linkBox().checked).toBe(false)
    expect(columnField().disabled).toBe(false)
    expect(dataPathTo(ctx, 'x1').label).toBe('x1') // unticking alone changes nothing in the model

    fireEvent.change(columnField(), { target: { value: 'col_b' } })
    await waitFor(() => expect(dataPathTo(ctx, 'x1').label).toBe('col_b'))
    fireEvent.change(labelField(ctx), { target: { value: 'y1' } })
    await waitFor(() => expect(dataPathTo(ctx, 'y1').label).toBe('col_b'))
    // a column named like the variable does not tick the box again
    fireEvent.change(columnField(), { target: { value: 'y1' } })
    await waitFor(() => expect(dataPathTo(ctx, 'y1').label).toBe('y1'))
    expect(linkBox().checked).toBe(false)
    fireEvent.change(columnField(), { target: { value: 'col_b' } })
    await waitFor(() => expect(dataPathTo(ctx, 'y1').label).toBe('col_b'))

    columnField().blur()
    fireEvent.click(linkBox())
    await waitFor(() => expect(dataPathTo(ctx, 'y1').label).toBe('y1'))
    expect(linkBox().checked).toBe(true)
    expect(columnField().disabled).toBe(true)
    // undo restores the mapping and the unticked box
    undo(ctx)
    await waitFor(() => expect(dataPathTo(ctx, 'y1').label).toBe('col_b'))
    expect(linkBox().checked).toBe(false)
  })

  it('the link never reaches the schema', async () => {
    const ctx = await setup()
    expect(JSON.stringify(ctx.onModelChange.mock.calls[ctx.onModelChange.mock.calls.length - 1][0])).not.toContain('mappingLinked')
  })
})

describe('disconnecting', () => {
  it('Disconnect in a mapping row removes that data path, as one undo step', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'x2')
    expect(screen.getAllByTestId('data-mapping-row')).toHaveLength(1)
    fireEvent.click(within(screen.getByTestId('data-mapping-row')).getByRole('button', { name: 'Disconnect' }))
    await waitFor(() => expect(dataPathTo(ctx, 'x2')).toBeUndefined())
    expect(screen.queryByTestId('data-mapping-row')).toBeNull()
    expect(dataPathTo(ctx, 'x1')).toBeTruthy()   // other mappings stay
    undo(ctx)
    await waitFor(() => expect(dataPathTo(ctx, 'x2')).toMatchObject({ from: 'D', label: 'col_b' }))
  })
})

describe('path labels', () => {
  const pathEl = (ctx: Ctx, from: string, to: string, data = false) => {
    const model = lastModel(ctx)
    const i = model.paths.findIndex((p: any) => p.from === from && p.to === to && (p.type === 'data') === data)
    return ctx.container.querySelectorAll('path[data-path-id]')[i]
  }

  it('are stored as typed (no Unicode conversion); only the displayed name is converted', async () => {
    const ctx = await setup()
    fireEvent.click(screen.getByText('Complete Graph'))
    await nextTask()
    // a structural path, from the inspector
    fireEvent.click(pathEl(ctx, 'F', 'x1')!, { button: 0 })
    await nextTask()
    fireEvent.change(labelField(ctx), { target: { value: 'lam_1' } })
    await waitFor(() => expect(lastModel(ctx).paths.find((p: any) => p.from === 'F' && p.to === 'x1').label).toBe('lam_1'))
    expect(screen.getByText(`Path: ${convertToUnicode('lam_1')}`)).toBeTruthy()
    // a data path: the column name keeps its underscore
    fireEvent.click(pathEl(ctx, 'D', 'x2', true)!, { button: 0 })
    await nextTask()
    fireEvent.change(labelField(ctx), { target: { value: 'x_2' } })
    await waitFor(() => expect(dataPathTo(ctx, 'x2').label).toBe('x_2'))
    // cleared: back to the generated endpoint name
    fireEvent.change(labelField(ctx), { target: { value: '' } })
    await waitFor(() => expect(dataPathTo(ctx, 'x2').label).toBeNull())
  })
})

describe('setting the link', () => {
  it('R pushes that keep the history (data, fit) keep the links; new matching data paths are linked; load resets', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'x1')
    fireEvent.click(linkBox()) // untick x1
    await nextTask()
    // R adds x4 with a data path named like it
    const more = fixture({
      nodes: [{ label: 'x4', type: 'variable', visual: { x: 200, y: 150 } }],
      paths: [{ from: 'D', to: 'x4', type: 'data', label: 'x4' }],
    })
    for (const kind of ['data', 'fit'] as const) {
      await ctx.push(more, kind)
      await clickNode(ctx, 'x1')
      expect(linkBox().checked).toBe(false)
      await clickNode(ctx, 'x4')
      expect(linkBox().checked).toBe(true)
    }
    await ctx.push(more, 'load')
    await clickNode(ctx, 'x1')
    expect(linkBox().checked).toBe(true)
  })

  it('a column dropped on the canvas makes a variable named for it, linked', async () => {
    const ctx = await setup()
    fireEvent.click(screen.getByText('Complete Graph'))
    await clickNode(ctx, 'D')
    const row = (name: string) => screen.getAllByText(name).map((el) => el.closest('tr')).find(Boolean)!
    // jsdom's drag events carry no coordinates: set them on plain events
    const dragEvent = (type: string, x: number, y: number) => {
      const ev = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(ev, { clientX: { value: x }, clientY: { value: y }, dataTransfer: { value: { dropEffect: 'none' } } })
      return ev
    }
    const drop = (name: string, x: number, y: number) => {
      fireEvent.dragStart(row(name))
      fireEvent(ctx.svg, dragEvent('dragover', x, y))
      fireEvent(ctx.svg, dragEvent('drop', x, y))
    }
    drop('col_b', 300, -200)
    await waitFor(() => expect(dataPathTo(ctx, 'col_b')).toMatchObject({ from: 'D', label: 'col_b' }))
    expect(lastModel(ctx).nodes.find((n: any) => n.label === 'col_b').visual).toMatchObject({ x: 300, y: -200 })
    await clickNode(ctx, 'col_b')
    expect(linkBox().checked).toBe(true)

    // onto an existing node: linked only when it is named like the column; the node keeps its label
    await clickNode(ctx, 'D')
    drop('x2', 100, 150) // onto x3
    await waitFor(() => expect(dataPathTo(ctx, 'x3').label).toBe('x2'))
    await clickNode(ctx, 'x3')
    expect(linkBox().checked).toBe(false)
    expect(lastModel(ctx).nodes.map((n: any) => n.label)).toContain('x3')

    await clickNode(ctx, 'x2')
    expect(linkBox().checked).toBe(false) // col_b
    await clickNode(ctx, 'D')
    drop('x2', 0, 150) // onto x2
    await waitFor(() => expect(dataPathTo(ctx, 'x2').label).toBe('x2'))
    await clickNode(ctx, 'x2')
    expect(linkBox().checked).toBe(true)
  })
})

describe('missing columns', () => {
  it('the inspector row and the cable label warn when the loaded dataset has no such column', async () => {
    const ctx = await setup()
    await clickNode(ctx, 'x3')
    expect(screen.getByTestId('missing-column-warning').textContent).toContain('D has no column "gone"')
    await clickNode(ctx, 'x2')
    expect(screen.queryByTestId('missing-column-warning')).toBeNull()
    const warned = Array.from(ctx.container.querySelectorAll('[data-missing-column="true"]'))
    expect(warned).toHaveLength(1)
    expect(warned[0].textContent).toContain('gone')
    // fixing the mapping clears it
    await clickNode(ctx, 'x3')
    fireEvent.change(columnField(), { target: { value: 'col_b' } })
    await waitFor(() => expect(ctx.container.querySelector('[data-missing-column]')).toBeNull())
    expect(screen.queryByTestId('missing-column-warning')).toBeNull()
  })
})

describe('unnamed free paths', () => {
  // F <-> F free, no label or name (unnamed); x1 <-> x1 free, labelled
  const schema = () => fixture({
    paths: [
      { from: 'F', to: 'F', numberOfArrows: 2, freeParameter: true },
      { from: 'x1', to: 'x1', numberOfArrows: 2, freeParameter: true, label: 'e1' },
    ],
  })
  const pathEl = (ctx: Ctx, from: string, to: string) => {
    const i = lastModel(ctx).paths.findIndex((p: any) => p.from === from && p.to === to)
    return ctx.container.querySelectorAll('path[data-path-id]')[i] as SVGPathElement
  }

  it('are drawn dashed, labelled "≈value", and warned about in the inspector', async () => {
    const ctx = await setup(schema())
    const unnamed = pathEl(ctx, 'F', 'F')
    expect(unnamed.getAttribute('data-unnamed-free')).toBe('true')
    expect(unnamed.getAttribute('stroke-dasharray')).toBe('6 4')
    expect(pathEl(ctx, 'x1', 'x1').getAttribute('stroke-dasharray')).toBeNull()
    expect(screen.getByText('≈1.00')).toBeTruthy()

    fireEvent.click(unnamed, { button: 0 })
    await nextTask()
    expect(screen.getByTestId('unnamed-free-warning')).toBeTruthy()
    // a label clears the flag
    fireEvent.change(labelField(ctx), { target: { value: 'vF' } })
    await waitFor(() => expect(screen.queryByTestId('unnamed-free-warning')).toBeNull())
    expect(pathEl(ctx, 'F', 'F').getAttribute('stroke-dasharray')).toBeNull()
  })
})

describe('duplicate path names', () => {
  it('a label typed in the inspector that repeats another path\'s is flagged there and on the canvas', async () => {
    const ctx = await setup(fixture({ paths: [{ from: 'x1', to: 'x1', numberOfArrows: 2, freeParameter: true, label: 'e1' }] }))
    const idx = (from: string, to: string) => lastModel(ctx).paths.findIndex((p: any) => p.from === from && p.to === to)
    const el = () => ctx.container.querySelectorAll('path[data-path-id]')[idx('F', 'x2')]
    fireEvent.click(el(), { button: 0 })
    await nextTask()
    expect(screen.queryByTestId('name-clash-warning')).toBeNull()
    fireEvent.change(labelField(ctx), { target: { value: 'e1' } })
    await waitFor(() => expect(screen.getByTestId('name-clash-warning').textContent).toContain('"e1"'))
    expect(ctx.container.querySelectorAll('[data-name-clash="true"]')).toHaveLength(2)
    fireEvent.change(labelField(ctx), { target: { value: 'e2' } })
    await waitFor(() => expect(screen.queryByTestId('name-clash-warning')).toBeNull())
    expect(ctx.container.querySelectorAll('[data-name-clash="true"]')).toHaveLength(0)
  })
})

// The SEM layer hides dataset nodes, so the sidebar's Data pane lists them;
// expanding one shows the dataset popup's details, column drags and hovers included.
describe('sidebar Data pane', () => {
  const pane = () => screen.getByTestId('data-pane')
  const paneButton = () => within(pane()).getByRole('button', { name: /D$/ })
  const paneRow = (name: string) => within(pane()).getAllByText(name).map((el) => el.closest('tr')).find(Boolean)!
  const columnToggle = (name: string) => within(pane()).getByTitle(new RegExp(`summary of ${name}$`))
  const cells = (name: string) => Array.from(paneRow(name).cells).map((td) => td.textContent)

  it('lists datasets in the SEM layer only; expanding one shows its columns without a fixed wider sidebar', async () => {
    const ctx = await setup()
    const aside = ctx.container.querySelector('aside')!
    expect(paneButton().getAttribute('aria-expanded')).toBe('false')
    expect(within(pane()).queryByText('Mapped to')).toBeNull()
    // sized to its content (only the column table can widen it), never a fixed wider class
    const width = aside.className
    expect(width).toContain('w-max')

    fireEvent.click(paneButton())
    expect(paneButton().getAttribute('aria-expanded')).toBe('true')
    expect(within(pane()).getByText('Mapped to')).toBeTruthy()
    expect(paneRow('col_b')).toBeTruthy()
    expect(aside.className).toBe(width)

    fireEvent.click(paneButton())
    expect(within(pane()).queryByText('Mapped to')).toBeNull()

    fireEvent.click(screen.getByText('Complete Graph'))
    expect(screen.queryByTestId('data-pane')).toBeNull()
  })

  it('the header gives where the data lives and its size; its status icon shows errors on hover', async () => {
    const schema = fixture()
    await setup(schema)
    fireEvent.click(paneButton())
    expect(screen.getByTestId('dataset-header').textContent).toContain('Embedded · 1 row × 3 cols')
    expect(screen.getByTestId('dataset-header').textContent).not.toContain('MD5')
    // x3 maps a column D lacks: an error, explained on hover
    const status = screen.getByTestId('dataset-status')
    expect(status.getAttribute('aria-label')).toBe('Error')
    expect(status.getAttribute('title')).toContain('x3 maps column "gone", which this dataset does not have')
    cleanup()

    // all clear: connected (an MD5 the editor did not check says so on hover)
    const clean = fixture()
    clean.models.m.paths = clean.models.m.paths.filter((p: any) => p.label !== 'gone')
    ;(clean.models.m.nodes.find((n: any) => n.type === 'dataset') as any).datasetSource.md5 = 'abc123'
    await setup(clean)
    fireEvent.click(paneButton())
    const ok = screen.getByTestId('dataset-status')
    expect(ok.getAttribute('aria-label')).toBe('Connected')
    expect(ok.getAttribute('title')).toBe('Connected\nMD5 recorded; not checked here')
  })

  it('"Add all as nodes" adds a mapped variable for each column not on the canvas, as one undo step', async () => {
    const ctx = await setup()
    fireEvent.click(paneButton())
    // D maps x1 and col_b; x2 is not on the canvas (x2 the variable maps col_b)
    expect(within(pane()).getByText('1 not on the canvas')).toBeTruthy()
    fireEvent.click(within(pane()).getByRole('button', { name: 'Add all as nodes' }))
    await waitFor(() => expect(lastModel(ctx).paths).toContainEqual(expect.objectContaining({ from: 'D', type: 'data', label: 'x2', to: 'x2_2' })))
    expect(lastModel(ctx).paths).toContainEqual(expect.objectContaining({ from: 'x2_2', to: 'x2_2', numberOfArrows: 2, freeParameter: true }))
    expect(within(pane()).queryByText(/not on the canvas/)).toBeNull()
    undo(ctx)
    await waitFor(() => expect(lastModel(ctx).nodes.map((n: any) => n.label)).not.toContain('x2_2'))
    expect(within(pane()).getByText('1 not on the canvas')).toBeTruthy()
  })

  it('each row shows its column, the variables mapping it, and its missing count', async () => {
    const schema = fixture()
    const ds = schema.models.m.nodes.find((n: any) => n.type === 'dataset') as any
    ds.datasetSource.object = [{ x1: 1, x2: 2, col_b: 3 }, { x1: null, x2: 4, col_b: '' }]
    await setup(schema)
    fireEvent.click(paneButton())
    expect(cells('x1')).toEqual(['▸x1', 'x1', '1'])
    expect(cells('col_b')).toEqual(['▸col_b', 'x2', '1'])
    expect(cells('x2')).toEqual(['▸x2', '—', '0'])   // D maps col_b, not x2, to x2
  })

  it('clicking a column name expands its summary; clicking again collapses it', async () => {
    const schema = fixture()
    const ds = schema.models.m.nodes.find((n: any) => n.type === 'dataset') as any
    ds.datasetSource.object = [
      { x1: -2.2146998871775, x2: 3, col_b: 'a' }, { x1: 1.5953, x2: 1, col_b: 'b' }, { x1: null, x2: 1, col_b: 5 },
    ]
    await setup(schema)
    fireEvent.click(paneButton())
    expect(screen.queryByTestId('column-summary')).toBeNull()
    const summaryText = () => Array.from(screen.getByTestId('column-summary').querySelectorAll('dt, dd')).map((el) => el.textContent)

    fireEvent.click(columnToggle('x1'))
    expect(columnToggle('x1').getAttribute('aria-expanded')).toBe('true')
    // at most two decimals; one column in the narrow pane
    expect(summaryText()).toEqual(['Type', 'Numeric', 'Missing', '1 (33%)', 'Mean (SD)', '-0.31 (2.69)', 'Range', '[-2.21, 1.6]'])

    // one column at a time
    fireEvent.click(columnToggle('x2'))
    expect(screen.getAllByTestId('column-summary')).toHaveLength(1)
    expect(summaryText()).toEqual(['Type', 'Numeric', 'Missing', '0', 'Mean (SD)', '1.67 (1.15)', 'Range', '[1, 3]'])

    // partly numeric columns say so
    fireEvent.keyDown(columnToggle('col_b'), { key: 'Enter' })
    expect(summaryText()).toEqual(['Type', 'Mixed (1 of 3 numeric)', 'Missing', '0', 'Mean (SD)', '5', 'Range', '[5, 5]'])

    fireEvent.click(columnToggle('col_b'))
    expect(screen.queryByTestId('column-summary')).toBeNull()
  })

  it('a column dragged from the pane maps a new variable; hovering a row highlights its variable', async () => {
    const ctx = await setup()
    fireEvent.click(paneButton())
    fireEvent.mouseEnter(paneRow('col_b'))
    const x2Text = nodeGroup(ctx, 'x2').querySelector(':scope > text') as SVGTextElement
    expect(x2Text.getAttribute('font-weight')).toBe('bold')
    fireEvent.mouseLeave(paneRow('col_b'))
    expect(x2Text.getAttribute('font-weight')).toBe('normal')

    const dragEvent = (type: string, x: number, y: number) => {
      const ev = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(ev, { clientX: { value: x }, clientY: { value: y }, dataTransfer: { value: { dropEffect: 'none' } } })
      return ev
    }
    fireEvent.dragStart(paneRow('x2'))
    fireEvent(ctx.svg, dragEvent('dragover', 300, -200))
    fireEvent(ctx.svg, dragEvent('drop', 300, -200))
    await waitFor(() => expect(lastModel(ctx).paths).toContainEqual(expect.objectContaining({ from: 'D', type: 'data', label: 'x2', to: 'x2_2' })))
  })
})
