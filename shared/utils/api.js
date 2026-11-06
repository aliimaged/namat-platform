/**
 * Centralized API client for render operations
 * All API calls should go through this module to ensure consistent error handling.
 * 
 * Environment variables are validated in packages/shared/config/env.js
 */

import { API_GATEWAY_URL } from '../config/env.js';

/**
 * Get the API Gateway base URL
 * @returns {string} API base URL (validated when first accessed)
 */
export function getApiBaseUrl() {
  if (typeof window === "undefined") {
    throw new Error("This feature is only available in the browser");
  }

  // API_GATEWAY_URL is now a function that validates lazily
  return typeof API_GATEWAY_URL === 'function' ? API_GATEWAY_URL() : API_GATEWAY_URL;
}

/**
 * Make a fetch request to the API Gateway with error handling
 * @param {string} endpoint - API endpoint (e.g., "/render")
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<Response>}
 * @throws {Error} If request fails or response is not ok
 */
/**
 * Make a request using XMLHttpRequest as fallback when fetch is blocked
 */
function xhrRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method || 'GET', url, true);
    
    // Set headers
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    Object.keys(headers).forEach(key => {
      xhr.setRequestHeader(key, headers[key]);
    });
    
    xhr.onload = () => {
      // Create a Response-like object
      const response = {
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        statusText: xhr.statusText,
        json: async () => JSON.parse(xhr.responseText),
        text: async () => xhr.responseText,
      };
      resolve(response);
    };
    
    xhr.onerror = () => {
      reject(new Error('Network error. Please check your internet connection and try again.'));
    };
    
    xhr.send(options.body || null);
  });
}

async function apiRequest(endpoint, options = {}) {
  const baseUrl = getApiBaseUrl();
  const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;

  let response;
  try {
    // Add mode: 'cors' explicitly and handle credentials
    const fetchOptions = {
      ...options,
      mode: 'cors',
      credentials: 'omit',
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    };
    response = await fetch(url, fetchOptions);
  } catch (error) {
    // If fetch fails (possibly due to extension interference), try XMLHttpRequest fallback
    if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      try {
        response = await xhrRequest(url, options);
      } catch (xhrError) {
        // Both fetch and XHR failed - provide helpful error message
        // Check for extension blocking vs CORS/network issues
        const errorStack = error.stack || '';
        const xhrErrorStack = xhrError.stack || '';
        const isExtensionBlocked =
          errorStack.includes('chrome-extension') ||
          errorStack.includes('moz-extension') ||
          xhrErrorStack.includes('chrome-extension') ||
          xhrErrorStack.includes('moz-extension');

        // CORS errors typically show in console as "blocked by CORS policy"
        // Network errors show as "Failed to fetch" for both fetch and XHR
        const isCorsError = error.message.includes('Failed to fetch') &&
                           xhrError.message.includes('Network error') &&
                           !isExtensionBlocked;

        const errorMsg = isExtensionBlocked
          ? 'Network request blocked by browser extension. Please try disabling extensions or opening this page in an incognito/private window.'
          : isCorsError
          ? 'We\'re having trouble connecting to our service. Please try again or contact support if the issue persists.'
          : 'Network error. Please check your internet connection and try again.';

        const enhancedError = new Error(errorMsg);
        enhancedError.cause = error;
        enhancedError.isExtensionBlocked = isExtensionBlocked;
        enhancedError.isCorsError = isCorsError;
        throw enhancedError;
      }
    } else {
      throw error;
    }
  }

  if (!response.ok) {
    let errorMessage = `Request failed: ${response.statusText}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      // If response is not JSON, use status text
    }
    throw new Error(errorMessage);
  }

  return response;
}

/**
 * Start a render job
 * @param {Object} props - Render properties (title, subtitle, numericValue, etc.)
 * @returns {Promise<{success: boolean, jobId: string}>}
 */
export async function startRender(props) {
  const response = await apiRequest("/render", {
    method: "POST",
    body: JSON.stringify(props),
  });

  const data = await response.json();

  if (!data.success || !data.jobId) {
    throw new Error(data.error || "We couldn't start creating your video. Please try again.");
  }

  return data;
}

/**
 * Get render job status
 * @param {string} jobId - Job identifier
 * @returns {Promise<{success: boolean, status: string, errorMessage?: string}>}
 */
export async function getRenderStatus(jobId) {
  const response = await apiRequest(`/render/${jobId}/status`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "We couldn't check your video status. Please try again.");
  }

  return data;
}

/**
 * Get download URL for a completed render job
 * @param {string} jobId - Job identifier
 * @returns {Promise<{success: boolean, downloadUrl: string}>}
 */
export async function getDownloadUrl(jobId) {
  const response = await apiRequest(`/render/${jobId}/download`);
  const data = await response.json();

  if (!data.success || !data.downloadUrl) {
    throw new Error(data.error || "We couldn't get your download link. Please try again.");
  }

  return data;
}

/**
 * Check if a device has already been counted for an event
 * @param {string} eventId - Event identifier
 * @param {string} deviceId - Device identifier
 * @returns {Promise<{success: boolean, isCounted: boolean}>}
 */
export async function checkDeviceCounted(eventId, deviceId) {
  const encodedEventId = encodeURIComponent(eventId);
  const encodedDeviceId = encodeURIComponent(deviceId);
  const response = await apiRequest(`/device/${encodedEventId}/${encodedDeviceId}/check`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "We couldn't verify your participation. Please try again.");
  }

  return data;
}

/**
 * Mark a device as counted for an event
 * @param {string} eventId - Event identifier
 * @param {string} deviceId - Device identifier
 * @returns {Promise<{success: boolean, alreadyCounted?: boolean}>}
 */
export async function markDeviceAsCounted(eventId, deviceId) {
  const encodedEventId = encodeURIComponent(eventId);
  const encodedDeviceId = encodeURIComponent(deviceId);
  const response = await apiRequest(`/device/${encodedEventId}/${encodedDeviceId}/mark`, {
    method: "POST",
  });
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || "We couldn't record your participation. Please try again.");
  }

  return data;
}

/**
 * Trigger browser download of a file from a URL
 * Uses fetch + blob to prevent page navigation
 * @param {string} url - Download URL
 * @param {string} filename - Filename for the download
 */
export async function triggerDownload(url, filename) {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    throw new Error('We couldn\'t find the download link. Please try again.');
  }
  
  try {
    // Fetch the file as a blob to avoid page navigation
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('We couldn\'t download your file. Please try again.');
    }
    
    const blob = await response.blob();
    
    // Create object URL from blob
    const blobUrl = URL.createObjectURL(blob);
    
    // Create and trigger download link
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 100);
    
  } catch (error) {
    console.error('Download failed:', error);
    throw new Error('We couldn\'t download your file. Please try again or contact support.');
  }
}
