/**
 * Render status utilities
 * Centralizes status mapping, progress calculation, and button label logic
 */

/**
 * Render status values
 */
export const RENDER_STATUS = {
  QUEUED: "QUEUED",
  PROVISIONING: "PROVISIONING",
  RUNNING: "RUNNING", // Legacy status, maps to RENDERING
  RENDERING: "RENDERING",
  UPLOADING: "UPLOADING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

/**
 * Map render status to progress percentage (time-based)
 * QUEUED: 20%, PROVISIONING: 21-25%, RENDERING: 25-95%, UPLOADING: 95-98%, COMPLETED: 99%, Email Sent: 100%
 * @param {string} status - Render status
 * @param {boolean} emailSent - Whether email has been sent (defaults to false)
 * @returns {number} Progress percentage (0-100)
 */
export function getProgressPercentage(status, emailSent = false) {
  // If email was sent, we're at 100%
  if (emailSent) {
    return 100;
  }

  switch (status) {
    case RENDER_STATUS.QUEUED:
      return 20;
    case RENDER_STATUS.PROVISIONING:
      return 21; // Start of rendering phase
    case RENDER_STATUS.RENDERING:
    case RENDER_STATUS.RUNNING: // Backward compatibility
      return 60; // Midpoint of 21-98% range (rendering takes ~2 mins)
    case RENDER_STATUS.UPLOADING:
      return 96; // 95-98% range, use 96%
    case RENDER_STATUS.COMPLETED:
      return 99; // Download ready
    case RENDER_STATUS.FAILED:
      return 0; // Failed renders show 0%
    default:
      return 0;
  }
}

/**
 * Map render status to button label
 * @param {string} status - Render status
 * @param {boolean} isRendering - Whether render is in progress
 * @returns {string} Button label
 */
export function getButtonLabel(status, isRendering) {
  if (!isRendering) {
    return "Download";
  }

  switch (status) {
    case RENDER_STATUS.QUEUED:
      return "Queued…";
    case RENDER_STATUS.PROVISIONING:
      return "Provisioning…";
    case RENDER_STATUS.RENDERING:
    case RENDER_STATUS.RUNNING: // Backward compatibility
      return "Rendering…";
    case RENDER_STATUS.UPLOADING:
      return "Uploading…";
    case RENDER_STATUS.COMPLETED:
      return "Downloading…";
    case RENDER_STATUS.FAILED:
      return "Download";
    default:
      return "Rendering…";
  }
}

/**
 * Determine if a status indicates the render is complete (success or failure)
 * @param {string} status - Render status
 * @returns {boolean} True if render is complete
 */
export function isRenderComplete(status) {
  return status === RENDER_STATUS.COMPLETED || status === RENDER_STATUS.FAILED;
}
