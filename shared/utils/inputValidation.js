/**
 * Input validation helpers for security (per .cursor/rules security guidelines).
 * Use allow-lists and strict patterns to prevent injection, path traversal, and prototype pollution.
 */

/** Allowed values for filter query param */
const ALLOWED_FILTERS = ['all', 'favorites'];

/**
 * Validate and sanitize filter param.
 * @param {unknown} value - Raw filter value
 * @returns {'all' | 'favorites'}
 */
export function validateFilter(value) {
  if (typeof value !== 'string') return 'all';
  const normalized = value.toLowerCase().trim();
  return ALLOWED_FILTERS.includes(normalized) ? normalized : 'all';
}

/** eventId must be alphanumeric, hyphen, underscore only (prevents prototype pollution in JSON keys) */
const EVENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validate eventId for journey count API.
 * @param {unknown} value - Raw eventId
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
export function validateEventId(value) {
  if (value === null || value === undefined) {
    return { valid: false, error: 'eventId is required' };
  }
  const str = String(value).trim();
  if (str.length === 0) return { valid: false, error: 'eventId cannot be empty' };
  if (str.length > 128) return { valid: false, error: 'eventId too long' };
  if (!EVENT_ID_PATTERN.test(str)) {
    return { valid: false, error: 'eventId contains invalid characters' };
  }
  if (FORBIDDEN_KEYS.has(str)) {
    return { valid: false, error: 'eventId contains invalid characters' };
  }
  return { valid: true, sanitized: str };
}

/** S3 key: no path traversal, no control chars, reasonable length. Allows @ for email in path. */
const S3_KEY_SAFE_PATTERN = /^[a-zA-Z0-9/_.@-]+$/;

/**
 * Validate s3Key format - no path traversal or dangerous chars.
 * Caller must still verify s3Key belongs to the requesting user (prefix check).
 * @param {unknown} value - S3 key from request
 * @returns {{ valid: boolean, sanitized?: string, error?: string }}
 */
export function validateS3Key(value) {
  if (value === null || value === undefined) {
    return { valid: false, error: 'Video identifier is missing' };
  }
  const trimmed = String(value).trim();
  if (trimmed.length === 0) return { valid: false, error: 'Video identifier is missing' };
  if (trimmed.length > 1024) return { valid: false, error: 'Video identifier too long' };
  if (trimmed.includes('..')) return { valid: false, error: 'Invalid video identifier' };
  if (!S3_KEY_SAFE_PATTERN.test(trimmed)) return { valid: false, error: 'Invalid video identifier' };
  return { valid: true, sanitized: trimmed };
}
