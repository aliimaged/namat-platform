import { describe, it, expect } from 'vitest';
import {
  validateFilter,
  validateEventId,
  validateS3Key,
} from '../utils/inputValidation.js';

describe('validateFilter', () => {
  it('returns "all" for invalid values', () => {
    expect(validateFilter()).toBe('all');
    expect(validateFilter(null)).toBe('all');
    expect(validateFilter(123)).toBe('all');
    expect(validateFilter('invalid')).toBe('all');
  });

  it('returns validated value for allowed filters', () => {
    expect(validateFilter('all')).toBe('all');
    expect(validateFilter('favorites')).toBe('favorites');
    expect(validateFilter('  FAVORITES  ')).toBe('favorites');
  });
});

describe('validateEventId', () => {
  it('rejects null/undefined', () => {
    expect(validateEventId(null).valid).toBe(false);
    expect(validateEventId(undefined).valid).toBe(false);
  });

  it('rejects dangerous keys (prototype pollution)', () => {
    expect(validateEventId('__proto__').valid).toBe(false);
    expect(validateEventId('constructor').valid).toBe(false);
  });

  it('accepts safe alphanumeric eventIds', () => {
    expect(validateEventId('event-123').valid).toBe(true);
    expect(validateEventId('my_event').valid).toBe(true);
  });
});

describe('validateS3Key', () => {
  it('rejects path traversal', () => {
    expect(validateS3Key('renders/user/../../../etc/passwd').valid).toBe(false);
  });

  it('rejects empty', () => {
    expect(validateS3Key('').valid).toBe(false);
    expect(validateS3Key(null).valid).toBe(false);
  });

  it('accepts valid format', () => {
    const r = validateS3Key('renders/user@email.com/dashboard-passport/Passport-xxx.mp4');
    expect(r.valid).toBe(true);
  });
});
