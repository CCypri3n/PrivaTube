/**
 * Shorts module - handle YouTube shorts detection and filtering
 * Pure functions: no DOM/network access
 */

/**
 * Parse an ISO 8601 duration string to seconds
 * Supports P[nD]T[nH][nM][nS] in any combination
 * P0D/empty/invalid returns 0, never throws
 *
 * @param {string} iso - ISO 8601 duration (e.g., PT45S, PT2M30S, PT1H2M3S, P0D)
 * @returns {number} Duration in seconds
 */
function parseDuration(iso) {
  // Handle invalid/empty input
  if (!iso || typeof iso !== 'string') {
    return 0;
  }

  // ISO 8601 duration pattern: P[nD]T[nH][nM][nS]
  // Examples: PT45S, P0D, PT2M30S, PT1H2M3S, P1DT2H3M4S
  const pattern = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;
  const match = iso.match(pattern);

  if (!match) {
    return 0; // Invalid format
  }

  const days = parseInt(match[1] || 0, 10);
  const hours = parseInt(match[2] || 0, 10);
  const minutes = parseInt(match[3] || 0, 10);
  const seconds = parseFloat(match[4] || 0);

  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

/**
 * Maximum duration (in seconds) for a video to be considered a short
 * @type {number}
 */
const SHORTS_MAX_SECONDS = 180;

/**
 * Determine if a video is a short
 * A video is a short if:
 * 1. Its duration is between 1 and 180 seconds (inclusive), OR
 * 2. It has a #shorts tag in title or description (case-insensitive)
 *
 * @param {Object} video - Video object
 * @param {string} video.duration - ISO 8601 duration string
 * @param {string} video.title - Video title
 * @param {string} video.description - Video description
 * @returns {boolean} True if the video is a short
 */
function isShort({ duration, title, description }) {
  const seconds = parseDuration(duration);
  const hasTag = /#shorts/i.test(title || '') || /#shorts/i.test(description || '');

  // If #shorts tag is present, it's a short regardless of duration
  // Otherwise, it's a short if duration is between 1 and 180 seconds
  return hasTag || (seconds > 0 && seconds <= SHORTS_MAX_SECONDS);
}

/**
 * Determine if a video should be listed in the feed
 * Returns false if:
 * 1. The video is a short, OR
 * 2. The video has no duration (P0D - livestream/upcoming)
 *
 * Livestreams and upcoming videos (duration P0D) are hidden by explicit
 * documented decision: they don't have a fixed duration and should not be
 * displayed in the main feed.
 *
 * @param {Object} video - Video object
 * @param {string} video.duration - ISO 8601 duration string
 * @returns {boolean} True if the video should be listed
 */
function isListable(video) {
  // Hide shorts
  if (isShort(video)) {
    return false;
  }

  // Hide livestreams/upcoming (P0D indicates no duration)
  if (parseDuration(video.duration) === 0) {
    return false;
  }

  return true;
}

// Export for Node.js (when running tests)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseDuration,
    SHORTS_MAX_SECONDS,
    isShort,
    isListable
  };
}
