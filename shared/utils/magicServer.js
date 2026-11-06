/**
 * Magic Labs Server Helper
 * Provides server-side DID token verification
 * Based on Magic's official nextjs-dedicated-wallet scaffold patterns
 */

import { Magic } from '@magic-sdk/admin';

let magicAdminInstance = null;

/**
 * Get or create Magic Admin instance for server-side verification
 * @returns {Magic} Magic Admin instance
 */
function getMagicAdmin() {
  if (!magicAdminInstance) {
    const secretKey = process.env.MAGIC_SECRET_KEY;

    if (!secretKey) {
      throw new Error('Authentication service not configured. Please contact support.');
    }

    magicAdminInstance = new Magic(secretKey);
  }

  return magicAdminInstance;
}

/**
 * Verify DID token and extract user information
 * @param {string} didToken - DID token from Authorization header
 * @returns {Promise<{email: string, issuer: string, publicAddress: string}>} User info
 * @throws {Error} If token is invalid or verification fails
 */
export async function verifyDidToken(didToken) {
  if (!didToken) {
    throw new Error('Authentication token is missing. Please sign in again.');
  }

  try {
    const magic = getMagicAdmin();

    magic.token.validate(didToken);

    const metadata = await magic.users.getMetadataByToken(didToken);

    if (!metadata || !metadata.email) {
      throw new Error('Your authentication session is invalid. Please sign in again.');
    }

    return {
      email: normalizeEmail(metadata.email),
      issuer: metadata.issuer,
      publicAddress: metadata.publicAddress,
    };
  } catch (error) {
    console.error('Error verifying DID token:', error);
    throw new Error('Your session has expired or is invalid. Please sign in again.');
  }
}

/**
 * Normalize email address for consistent storage and querying
 * @param {string} email - Email address to normalize
 * @returns {string} Normalized email (lowercase, trimmed)
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new Error('Please provide a valid email address');
  }
  return email.toLowerCase().trim();
}

/**
 * Express middleware to verify Magic authentication
 * Extracts and verifies DID token from Authorization header
 * Attaches user info to req.user
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'You must be signed in to access this. Please sign in and try again.',
    });
  }

  const didToken = authHeader.substring(7);

  verifyDidToken(didToken)
    .then((userInfo) => {
      req.user = userInfo;
      next();
    })
    .catch((error) => {
      return res.status(401).json({
        success: false,
        error: error.message || 'Your session has expired. Please sign in again.',
      });
    });
}
