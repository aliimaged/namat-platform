/**
 * Dark mode localStorage utility (Best practice 4.4: version and minimize localStorage data)
 * Uses versioned keys and try-catch for incognito/quota/disabled scenarios.
 */

const DARK_MODE_KEY = 'darkMode:v1';

/**
 * Load dark mode preference from localStorage
 * @returns {boolean} true if dark mode was saved as enabled
 */
export function loadDarkMode() {
  try {
    const v1 = localStorage.getItem(DARK_MODE_KEY);
    if (v1 !== null) return v1 === 'true';
    const legacy = localStorage.getItem('darkMode');
    if (legacy !== null) {
      const val = legacy === 'true';
      localStorage.setItem(DARK_MODE_KEY, val.toString());
      return val;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Save dark mode preference to localStorage
 * @param {boolean} enabled
 */
export function saveDarkMode(enabled) {
  try {
    localStorage.setItem(DARK_MODE_KEY, enabled.toString());
  } catch {
    // Ignore - incognito, quota exceeded, or disabled
  }
}
