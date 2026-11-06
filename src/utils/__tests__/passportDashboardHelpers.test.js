import { describe, it, expect } from 'vitest';
import { getCountryFlag, PASSPORT_COMPOSITION_CONFIG } from '../passportDashboardHelpers.jsx';

describe('getCountryFlag', () => {
  it('returns flag emoji for valid 2-letter country code', () => {
    expect(getCountryFlag('US')).toBe('🇺🇸');
    expect(getCountryFlag('GB')).toBe('🇬🇧');
  });

  it('returns placeholder for invalid code', () => {
    expect(getCountryFlag('')).toBe('🏳️');
    expect(getCountryFlag(null)).toBe('🏳️');
  });

  it('handles lowercase input', () => {
    expect(getCountryFlag('us')).toBe('🇺🇸');
  });
});

describe('PASSPORT_COMPOSITION_CONFIG', () => {
  it('has expected shape', () => {
    expect(PASSPORT_COMPOSITION_CONFIG).toEqual({
      fps: 60,
      durationInFrames: 525,
      width: 1080,
      height: 1920,
    });
  });
});
