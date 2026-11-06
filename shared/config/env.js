/**
 * Centralized environment configuration
 * 
 * This module validates and exports all required environment variables.
 * It should be the ONLY place in the frontend that reads import.meta.env.
 * 
 * Setup:
 * - For local development: Create a `.env` file in the project root with VITE_API_GATEWAY_URL
 * - For production: Set VITE_API_GATEWAY_URL in your hosting provider's environment variables
 * - Optional: Set VITE_PUBLIC_BASE_URL for QR code generation (defaults to production URL)
 */

const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

/**
 * Get the API Gateway base URL from environment variables
 * @returns {string} API base URL
 * @throws {Error} If VITE_API_GATEWAY_URL is not set (with clear error message)
 */
function getApiGatewayUrl() {
  const apiUrl = import.meta.env.VITE_API_GATEWAY_URL;

  if (!apiUrl || apiUrl.trim() === '') {
    const errorMessage = isDevelopment
      ? `Missing required environment variable: VITE_API_GATEWAY_URL\n\n` +
        `To fix this:\n` +
        `1. Create a .env file in the project root\n` +
        `2. Add: VITE_API_GATEWAY_URL=your-api-gateway-url\n` +
        `3. Restart the development server`
      : `Missing required environment variable: VITE_API_GATEWAY_URL\n\n` +
        `This variable must be set in your hosting provider's environment variables.\n` +
        `Please contact your administrator or check your deployment configuration.`;

    // In development, throw immediately for fast feedback
    // In production, log a clear error to console
    if (isDevelopment) {
      throw new Error(errorMessage);
    } else {
      // In production, log error and throw
      console.error('❌ Configuration Error:', errorMessage);
      throw new Error('Application configuration error. Please check the console for details.');
    }
  }

  return apiUrl.trim();
}

// Lazy validation: Only validate when actually accessed
// This allows the app to load even if the env var is missing
// The error will be thrown when the API is actually called
let _apiGatewayUrl = null;

/**
 * Get the API Gateway URL (lazy validation)
 * @returns {string} API base URL
 * @throws {Error} If VITE_API_GATEWAY_URL is not set (only when accessed)
 */
export function getApiGatewayUrlLazy() {
  if (_apiGatewayUrl === null) {
    _apiGatewayUrl = getApiGatewayUrl();
  }
  return _apiGatewayUrl;
}

// Export as a getter function that throws only when called
// This allows the module to load without throwing
export const API_GATEWAY_URL = getApiGatewayUrlLazy;

/**
 * Get the public base URL for the application (used for QR codes, etc.)
 * This is optional - if not set, the app should use a production fallback
 * @returns {string|null} Public base URL or null if not set
 */
export function getPublicBaseUrl() {
  const baseUrl = import.meta.env.VITE_PUBLIC_BASE_URL;
  return baseUrl && baseUrl.trim() !== '' ? baseUrl.trim() : null;
}// Export as a getter function
export const PUBLIC_BASE_URL = getPublicBaseUrl;