import { describe, expect, it } from 'vitest';
import { apiFailure, apiSuccess } from './envelope.js';

describe('API envelope', () => {
  it('wraps data in a success envelope', () => {
    expect(apiSuccess({ id: 1 })).toEqual({ success: true, data: { id: 1 }, error: null });
  });

  it('wraps a message in a failure envelope', () => {
    expect(apiFailure('Novel not found')).toEqual({
      success: false,
      data: null,
      error: 'Novel not found',
    });
  });

  it('carries documented failure details in data', () => {
    expect(apiFailure('Already in the catalog.', { novelId: 'n1' })).toEqual({
      success: false,
      data: { novelId: 'n1' },
      error: 'Already in the catalog.',
    });
  });
});
