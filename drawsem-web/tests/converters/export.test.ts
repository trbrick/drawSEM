import { describe, it, expect } from 'vitest';
// import { convertToLavaan } from '../../src/utils/exporters/lavaan';
// import { convertToOpenMx } from '../../src/utils/exporters/openmx';
import { loadFixture } from '../utils/test-helpers';

describe.skip('Lavaan Export', () => {
  it('should convert path analysis to lavaan syntax', () => {
    const model = loadFixture('models/path-analysis.json');
    // const lavaan = convertToLavaan(model);
    
    // expect(lavaan).toContain('~');  // regression operator
    // expect(lavaan).toContain('~~'); // covariance operator
  });

  it('should convert CFA to lavaan syntax', () => {
    const model = loadFixture('models/cfa-model.json');
    // const lavaan = convertToLavaan(model);
    
    // expect(lavaan).toContain('=~'); // factor loading operator
  });

  it('should handle parameter labels in lavaan', () => {
    const model = loadFixture('models/path-analysis.json');
    // const lavaan = convertToLavaan(model);
    
    // expect(lavaan).toContain('*'); // label operator
  });

  it('should handle constraints in lavaan', () => {
    const model = loadFixture('models/cfa-model.json');
    // const lavaan = convertToLavaan(model);
    
    // expect(lavaan).toContain('a1 == a2'); // equality constraint
  });
});

describe.skip('OpenMx Export', () => {
  it('should convert path analysis to OpenMx R code', () => {
    const model = loadFixture('models/path-analysis.json');
    // const openmx = convertToOpenMx(model);
    
    // expect(openmx).toContain('mxModel');
    // expect(openmx).toContain('mxPath');
  });

  it('should convert CFA to OpenMx R code', () => {
    const model = loadFixture('models/cfa-model.json');
    // const openmx = convertToOpenMx(model);
    
    // expect(openmx).toContain('manifestVars');
    // expect(openmx).toContain('latentVars');
  });

  it('should handle matrix algebra in OpenMx', () => {
    const model = loadFixture('models/multilevel-model.json');
    // const openmx = convertToOpenMx(model);
    
    // expect(openmx).toContain('mxAlgebra');
  });

  it('should include parameter starting values from optimization', () => {
    const model = loadFixture('models/path-analysis.json');
    // const openmx = convertToOpenMx(model);
    
    // expect(openmx).toMatch(/values\s*=/);
  });
});

describe.skip('Export Format Validation', () => {
  it('should produce valid lavaan syntax that can be parsed', () => {
    const model = loadFixture('models/path-analysis.json');
    // const lavaan = convertToLavaan(model);
    
    // Verify basic syntax structure
    // expect(lavaan.split('\n').length).toBeGreaterThan(0);
  });

  it('should produce valid R code for OpenMx', () => {
    const model = loadFixture('models/path-analysis.json');
    // const openmx = convertToOpenMx(model);
    
    // Verify basic R syntax
    // expect(openmx).toMatch(/^[a-zA-Z_]/m);
  });

  it('should handle unicode characters in labels', () => {
    const model = loadFixture('models/cfa-model.json');
    // const lavaan = convertToLavaan(model);
    
    // Unicode should be converted or escaped appropriately
    // expect(lavaan).toBeTruthy();
  });
});

describe.skip('Multi-Model Export', () => {
  it('should export multiple models independently', () => {
    const projectFile = {
      schemaVersion: 1,
      models: {
        model1: loadFixture('models/path-analysis.json').models.path_model,
        model2: loadFixture('models/cfa-model.json').models.cfa_model,
      },
    };
    
    // const exports = convertMultipleModels(projectFile);
    
    // expect(exports).toHaveProperty('model1');
    // expect(exports).toHaveProperty('model2');
  });

  it('should preserve model metadata in exports', () => {
    const model = loadFixture('models/path-analysis.json');
    // const lavaan = convertToLavaan(model);
    
    // Check for comments with model metadata
    // expect(lavaan).toContain('title');
  });
});
