import { describe, it, expect } from 'vitest';
import { normalizeEmail } from '../utils/magicServer.js';
import {
  getProgressPercentage,
  getButtonLabel,
  RENDER_STATUS,
  isRenderComplete,
} from '../utils/renderStatus.js';

describe('normalizeEmail', () => {
  it('lowercases email', () => {
    expect(normalizeEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('trims whitespace', () => {
    expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('throws on empty string', () => {
    expect(() => normalizeEmail('')).toThrow('Please provide a valid email address');
  });

  it('throws on null/undefined', () => {
    expect(() => normalizeEmail(null)).toThrow('Please provide a valid email address');
    expect(() => normalizeEmail(undefined)).toThrow('Please provide a valid email address');
  });
});

describe('renderStatus', () => {
  describe('getProgressPercentage', () => {
    it('returns 100 when email sent', () => {
      expect(getProgressPercentage('COMPLETED', true)).toBe(100);
    });

    it('returns correct percentages per status', () => {
      expect(getProgressPercentage(RENDER_STATUS.QUEUED)).toBe(20);
      expect(getProgressPercentage(RENDER_STATUS.PROVISIONING)).toBe(21);
      expect(getProgressPercentage(RENDER_STATUS.RENDERING)).toBe(60);
      expect(getProgressPercentage(RENDER_STATUS.UPLOADING)).toBe(96);
      expect(getProgressPercentage(RENDER_STATUS.COMPLETED)).toBe(99);
      expect(getProgressPercentage(RENDER_STATUS.FAILED)).toBe(0);
    });

    it('returns 0 for unknown status', () => {
      expect(getProgressPercentage('UNKNOWN')).toBe(0);
    });
  });

  describe('getButtonLabel', () => {
    it('returns Download when not rendering', () => {
      expect(getButtonLabel(RENDER_STATUS.COMPLETED, false)).toBe('Download');
    });

    it('returns status-specific labels when rendering', () => {
      expect(getButtonLabel(RENDER_STATUS.QUEUED, true)).toBe('Queued…');
      expect(getButtonLabel(RENDER_STATUS.PROVISIONING, true)).toBe('Provisioning…');
      expect(getButtonLabel(RENDER_STATUS.RENDERING, true)).toBe('Rendering…');
      expect(getButtonLabel(RENDER_STATUS.UPLOADING, true)).toBe('Uploading…');
      expect(getButtonLabel(RENDER_STATUS.COMPLETED, true)).toBe('Downloading…');
      expect(getButtonLabel(RENDER_STATUS.FAILED, true)).toBe('Download');
    });
  });

  describe('isRenderComplete', () => {
    it('returns true for COMPLETED and FAILED', () => {
      expect(isRenderComplete(RENDER_STATUS.COMPLETED)).toBe(true);
      expect(isRenderComplete(RENDER_STATUS.FAILED)).toBe(true);
    });

    it('returns false for in-progress statuses', () => {
      expect(isRenderComplete(RENDER_STATUS.QUEUED)).toBe(false);
      expect(isRenderComplete(RENDER_STATUS.RENDERING)).toBe(false);
    });
  });
});
