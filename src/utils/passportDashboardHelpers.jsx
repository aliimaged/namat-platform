/**
 * Shared helpers, constants, and style getters for PassportDashboard
 */

export const getCountryFlag = (countryCode) => {
  if (!countryCode || countryCode.length !== 2) return "🏳️";
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

/** Highlight matching substring in text (case-insensitive, preserves original casing) */
export const highlightMatch = (text, searchTerm) => {
  if (!searchTerm) return text;

  const lowerText = text.toLowerCase();
  const lowerSearch = searchTerm.toLowerCase();
  const index = lowerText.indexOf(lowerSearch);

  if (index === -1) return text;

  const before = text.substring(0, index);
  const match = text.substring(index, index + searchTerm.length);
  const after = text.substring(index + searchTerm.length);

  return (
    <>
      {before}
      <strong>{match}</strong>
      {after}
    </>
  );
};

export const PASSPORT_COMPOSITION_CONFIG = {
  fps: 60,
  durationInFrames: 525,
  width: 1080,
  height: 1920, // 9:16 aspect ratio
};

export const getInputStyle = (isDarkMode, isMobile = false) => ({
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: `0.25px solid ${isDarkMode ? "#4a4a4a" : "#e5e7eb"}`,
  fontSize: isMobile ? "16px" : "0.875rem",
  fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
  fontWeight: 400,
  backgroundColor: isDarkMode ? "#333333" : "#f0f1f3",
  color: isDarkMode ? "#e5e7eb" : "#1e1e1e",
  transition: "border-color 0.2s, background-color 0.2s, color 0.2s",
  boxSizing: "border-box",
  outline: "none",
});

export const inputFocusStyle = {
  outline: "none",
  borderColor: "#6000FF",
};

export const getStep1InputStyle = (isDarkMode, isMobile = false) => {
  const base = getInputStyle(isDarkMode, isMobile);
  return {
    ...base,
    border: "none",
    boxShadow: "none",
    transition: "border-color 0.2s, background-color 0.2s, color 0.2s, box-shadow 0.2s",
  };
};

export const step1InputFocusStyle = { outline: "none" };

export const getLabelStyle = (isDarkMode) => ({
  fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
  fontWeight: 400,
  fontSize: "0.75rem",
  color: isDarkMode ? "#e5e7eb" : "#6b7280",
  marginBottom: "4px",
  paddingLeft: "4px",
  textAlign: "left",
  transition: "color 0.2s",
});

export const fieldContainerStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  width: "100%",
};

export const ANIMATION_OPTIONS = [
  { value: "Dark", label: "Dark" },
  { value: "Light", label: "Light" },
];
