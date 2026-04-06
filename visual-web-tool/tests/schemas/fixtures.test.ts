import { describe, it, expect } from 'vitest';
import { validateGraph } from '../../src/validateGraph';
import { loadFixturesFromDir } from '../utils/test-helpers';

describe('Fixture Validation', () => {
  it('should load and validate all model fixtures', () => {
    const fixtures = loadFixturesFromDir('models');
    
    expect(fixtures.length).toBeGreaterThan(0);
    
    fixtures.forEach(({ name, data }) => {
      const result = validateGraph(data);
      expect(result.ok).toBe(true);
    });
  });

  it('should have multiple diverse fixtures', () => {
    const fixtures = loadFixturesFromDir('models');
    const fixtureNames = fixtures.map(f => f.name);
    
    // Ensure we have variety of SEM structures
    expect(fixtureNames).toContain('cfa-model');
    expect(fixtureNames).toContain('mediation-model');
    expect(fixtureNames).toContain('multilevel-model');
  });

  it('should have complete node information in each fixture', () => {
    const fixtures = loadFixturesFromDir('models');
    
    fixtures.forEach(({ name, data }) => {
      for (const [modelId, model] of Object.entries(data.models)) {
        expect((model as any).nodes.length).toBeGreaterThan(0);
        
        (model as any).nodes.forEach((node: any) => {
          expect(node.label).toBeDefined();
          expect(node.type).toMatch(/variable|constant|dataset/);
          if (node.visual) {
            expect(node.visual.x).toBeDefined();
            expect(node.visual.y).toBeDefined();
          }
        });
      }
    });
  });

  it('should reference nodes in paths correctly', () => {
    const fixtures = loadFixturesFromDir('models');
    
    fixtures.forEach(({ name, data }) => {
      for (const [modelId, model] of Object.entries(data.models)) {
        const nodeLabels = new Set((model as any).nodes.map((n: any) => n.label));
        
        (model as any).paths.forEach((path: any) => {
          expect(nodeLabels.has(path.from)).toBe(true);
          expect(nodeLabels.has(path.to)).toBe(true);
        });
      }
    });
  });

  it('should have parameter types defined for parameterized paths', () => {
    const fixtures = loadFixturesFromDir('models');
    
    fixtures.forEach(({ name, data }) => {
      for (const [modelId, model] of Object.entries(data.models)) {
        const paramTypes = (model as any).optimization?.parameterTypes || {};
        const paramTypeKeys = Object.keys(paramTypes);
        
        (model as any).paths.forEach((path: any) => {
          if (path.parameterType) {
            expect(paramTypeKeys).toContain(path.parameterType);
          }
        });
      }
    });
  });
});
