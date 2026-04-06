import { describe, it, expect } from 'vitest';
import { validateGraph } from '../../src/validateGraph';
import { loadFixture } from '../utils/test-helpers';

describe('Schema Validation', () => {
  it('should validate the basic example graph', () => {
    const graph = loadFixture('../../examples/graph.example.json');
    const result = validateGraph(graph);
    expect(result.ok).toBe(true);
  });

  it('should reject graphs without schemaVersion', () => {
    const invalidGraph = {
      models: {
        model1: {
          nodes: [],
          paths: [],
        },
      },
    };
    
    const result = validateGraph(invalidGraph);
    expect(result.ok).toBe(false);
  });

  it('should reject graphs without models', () => {
    const invalidGraph = {
      schemaVersion: 1,
    };
    
    const result = validateGraph(invalidGraph);
    expect(result.ok).toBe(false);
  });

  it('should require at least one model', () => {
    const invalidGraph = {
      schemaVersion: 1,
      models: {},
    };
    
    const result = validateGraph(invalidGraph);
    expect(result.ok).toBe(false);
  });

  it('should validate nodes with required fields', () => {
    const validGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [
            {
              label: 'X',
              type: 'variable',
              visual: { x: 100, y: 100 },
            },
          ],
          paths: [],
        },
      },
    };
    
    const result = validateGraph(validGraph);
    expect(result.ok).toBe(true);
  });

  it('should reject nodes without label', () => {
    const invalidGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [
            {
              type: 'variable',
              visual: { x: 100, y: 100 },
            },
          ],
          paths: [],
        },
      },
    };
    
    const result = validateGraph(invalidGraph);
    expect(result.ok).toBe(false);
  });

  it('should reject invalid node types', () => {
    const invalidGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [
            {
              label: 'X',
              type: 'invalid_type',
              visual: { x: 100, y: 100 },
            },
          ],
          paths: [],
        },
      },
    };
    
    const result = validateGraph(invalidGraph);
    expect(result.ok).toBe(false);
  });

  it('should accept all valid node types', () => {
    const validGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [
            { label: 'X', type: 'variable', visual: { x: 0, y: 0 } },
            { label: '1', type: 'constant', visual: { x: 0, y: 100 } },
            { label: 'data', type: 'dataset', visual: { x: 100, y: 0 } },
          ],
          paths: [],
        },
      },
    };
    
    const result = validateGraph(validGraph);
    expect(result.ok).toBe(true);
  });

  it('should validate paths with required fields', () => {
    const validGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [
            { label: 'X', type: 'variable', visual: { x: 0, y: 0 } },
            { label: 'Y', type: 'variable', visual: { x: 100, y: 0 } },
          ],
          paths: [
            {
              from: 'X',
              to: 'Y',
              numberOfArrows: 1,
              value: 0.5,
              free: 'free',
            },
          ],
        },
      },
    };
    
    const result = validateGraph(validGraph);
    expect(result.ok).toBe(true);
  });

  it('should reject paths without from', () => {
    const invalidGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [
            { label: 'X', type: 'variable', visual: { x: 0, y: 0 } },
            { label: 'Y', type: 'variable', visual: { x: 100, y: 0 } },
          ],
          paths: [
            {
              to: 'Y',
              numberOfArrows: 1,
            },
          ],
        },
      },
    };
    
    const result = validateGraph(invalidGraph);
    expect(result.ok).toBe(false);
  });

  it('should validate numberOfArrows range', () => {
    const validGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [
            { label: 'X', type: 'variable', visual: { x: 0, y: 0 } },
          ],
          paths: [
            { from: 'X', to: 'X', numberOfArrows: 0 },
            { from: 'X', to: 'X', numberOfArrows: 1 },
            { from: 'X', to: 'X', numberOfArrows: 2 },
          ],
        },
      },
    };
    
    const result = validateGraph(validGraph);
    expect(result.ok).toBe(true);
  });

  it('should reject numberOfArrows outside valid range', () => {
    const invalidGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [{ label: 'X', type: 'variable', visual: { x: 0, y: 0 } }],
          paths: [
            { from: 'X', to: 'X', numberOfArrows: 3 },
          ],
        },
      },
    };
    
    const result = validateGraph(invalidGraph);
    expect(result.ok).toBe(false);
  });

  it('should validate free parameter options', () => {
    const validGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [
            { label: 'X', type: 'variable', visual: { x: 0, y: 0 } },
            { label: 'Y', type: 'variable', visual: { x: 100, y: 0 } },
          ],
          paths: [
            { from: 'X', to: 'Y', numberOfArrows: 1, free: 'free' },
            { from: 'Y', to: 'X', numberOfArrows: 1, free: 'fixed' },
          ],
        },
      },
    };
    
    const result = validateGraph(validGraph);
    expect(result.ok).toBe(true);
  });

  it('should support parameter types in optimization', () => {
    const validGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [
            { label: 'F', type: 'variable', visual: { x: 0, y: 0 } },
            { label: 'X', type: 'variable', visual: { x: 100, y: 0 } },
          ],
          paths: [
            { from: 'F', to: 'X', numberOfArrows: 1, parameterType: 'loading' },
          ],
          optimization: {
            parameterTypes: {
              loading: {
                prior: { distribution: 'normal', mean: 0, sd: 1 },
                bounds: [null, null],
                start: 'auto',
              },
            },
          },
        },
      },
    };
    
    const result = validateGraph(validGraph);
    expect(result.ok).toBe(true);
  });

  it('should validate loopSide options for self-loops', () => {
    const validGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [{ label: 'X', type: 'variable', visual: { x: 0, y: 0 } }],
          paths: [
            {
              from: 'X',
              to: 'X',
              numberOfArrows: 2,
              visual: { loopSide: 'top' },
            },
            {
              from: 'X',
              to: 'X',
              numberOfArrows: 2,
              visual: { loopSide: 'right' },
            },
            {
              from: 'X',
              to: 'X',
              numberOfArrows: 2,
              visual: { loopSide: 'bottom' },
            },
            {
              from: 'X',
              to: 'X',
              numberOfArrows: 2,
              visual: { loopSide: 'left' },
            },
          ],
        },
      },
    };
    
    const result = validateGraph(validGraph);
    expect(result.ok).toBe(true);
  });

  it('should support dataset nodes with file metadata', () => {
    const validGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [
            {
              label: 'data',
              type: 'dataset',
              visual: { x: 0, y: 0 },
              datasetFile: {
                fileName: 'sample.csv',
                md5: 'd865e2fa67544050da562cdfb55ec1bd',
                rowCount: 100,
                columnCount: 3,
                columns: ['x1', 'x2', 'x3'],
              },
              mappings: {
                x1: 'X1',
                x2: 'X2',
              },
            },
          ],
          paths: [],
        },
      },
    };
    
    const result = validateGraph(validGraph);
    expect(result.ok).toBe(true);
  });

  it('should support multilevel nodes with levelOfMeasurement', () => {
    const validGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [
            {
              label: 'X_within',
              type: 'variable',
              levelOfMeasurement: 'within',
              visual: { x: 0, y: 0 },
            },
            {
              label: 'X_between',
              type: 'variable',
              levelOfMeasurement: 'between',
              visual: { x: 100, y: 0 },
            },
          ],
          paths: [],
        },
      },
    };
    
    const result = validateGraph(validGraph);
    expect(result.ok).toBe(true);
  });

  it('should support node and path tags', () => {
    const validGraph = {
      schemaVersion: 1,
      models: {
        model1: {
          nodes: [
            {
              label: 'F',
              type: 'variable',
              tags: ['factor', 'latent'],
              visual: { x: 0, y: 0 },
            },
          ],
          paths: [
            {
              from: 'F',
              to: 'F',
              numberOfArrows: 2,
              tags: ['covariance'],
            },
          ],
        },
      },
    };
    
    const result = validateGraph(validGraph);
    expect(result.ok).toBe(true);
  });
});
