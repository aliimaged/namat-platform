/**
 * Archetype Selection Logic
 * 
 * Computes derived values from selected countries and applies archetype rules
 * to select the appropriate archetype based on hierarchy and constraints.
 */

import countriesData from '../../countries.json';
import archetypesData from '../../archetypes.json';

/**
 * Calculate the centroid (average lat/lng) of selected countries
 */
function calculateCentroid(countryCodes) {
  if (!countryCodes || countryCodes.length === 0) {
    return { lat: 0, lng: 0 };
  }

  let totalLat = 0;
  let totalLng = 0;

  countryCodes.forEach((code) => {
    const country = countriesData[code];
    if (country) {
      totalLat += country.lat;
      totalLng += country.lng;
    }
  });

  return {
    lat: totalLat / countryCodes.length,
    lng: totalLng / countryCodes.length,
  };
}

/**
 * Calculate maximum distance between any two countries (in km)
 * Uses Haversine formula
 */
function calculateMaxDistanceKm(countryCodes) {
  if (!countryCodes || countryCodes.length < 2) {
    return 0;
  }

  let maxDistance = 0;

  // Compare all pairs of countries
  for (let i = 0; i < countryCodes.length; i++) {
    for (let j = i + 1; j < countryCodes.length; j++) {
      const country1 = countriesData[countryCodes[i]];
      const country2 = countriesData[countryCodes[j]];

      if (country1 && country2) {
        const distance = haversineDistance(
          country1.lat,
          country1.lng,
          country2.lat,
          country2.lng
        );
        maxDistance = Math.max(maxDistance, distance);
      }
    }
  }

  return maxDistance;
}

/**
 * Haversine formula to calculate distance between two points on Earth
 * Returns distance in kilometers
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Get unique continents from selected countries
 */
function getContinentsVisited(countryCodes) {
  if (!countryCodes || countryCodes.length === 0) {
    return [];
  }

  const continents = new Set();
  countryCodes.forEach((code) => {
    const country = countriesData[code];
    if (country && country.continent) {
      continents.add(country.continent);
    }
  });

  return Array.from(continents);
}

/**
 * Check if a value meets a constraint
 */
function meetsConstraint(value, constraint) {
  if (!constraint) return true;

  if (constraint.min !== undefined && value < constraint.min) {
    return false;
  }
  if (constraint.max !== undefined && value > constraint.max) {
    return false;
  }

  return true;
}

/**
 * Check if derived values meet archetype constraints
 */
function matchesArchetype(derived, archetype) {
  const constraints = archetype.constraints || {};
  const softConstraints = archetype.softConstraints || {};

  // Check hard constraints first
  for (const [key, constraint] of Object.entries(constraints)) {
    if (!meetsConstraint(derived[key], constraint)) {
      return false;
    }
  }

  // If hard constraints pass, check soft constraints
  // Soft constraints are more lenient but still considered
  for (const [key, constraint] of Object.entries(softConstraints)) {
    if (!meetsConstraint(derived[key], constraint)) {
      // Soft constraint violation - still matches but lower priority
      // For now, we'll treat it as a match but could add priority scoring
    }
  }

  return true;
}

/**
 * Select archetype based on hierarchy and derived values
 */
export function selectArchetype(countryCodes) {
  if (!countryCodes || countryCodes.length === 0) {
    // Default to Observer if no countries selected
    return {
      archetype: "You're an Observer",
      intent: archetypesData.archetypes["You're an Observer"].intent,
      derived: {
        countryCount: 0,
        continentsVisited: 0,
        centroid: { lat: 0, lng: 0 },
        maxDistanceKm: 0,
      },
    };
  }

  // Calculate derived values
  const countryCount = countryCodes.length;
  const continentsVisited = getContinentsVisited(countryCodes);
  const continentsCount = continentsVisited.length;
  const centroid = calculateCentroid(countryCodes);
  const maxDistanceKm = calculateMaxDistanceKm(countryCodes);

  const derived = {
    countryCount,
    continentsVisited: continentsCount,
    centroid,
    maxDistanceKm,
  };

  // Try each archetype in hierarchy order
  const hierarchy = archetypesData.hierarchy;
  const archetypes = archetypesData.archetypes;

  // Find first matching archetype
  for (const archetypeName of hierarchy) {
    const archetype = archetypes[archetypeName];
    if (archetype && matchesArchetype(derived, archetype)) {
      return {
        archetype: archetypeName,
        intent: archetype.intent,
        derived,
      };
    }
  }

  // Fallback to Observer if no match (shouldn't happen due to Observer constraints)
  return {
    archetype: "You're an Observer",
    intent: archetypesData.archetypes["You're an Observer"].intent,
    derived,
  };
}
