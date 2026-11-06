/**
 * Favorites Storage Utility - PostgreSQL-backed storage for user favorites (Neon).
 * Schema: favorites (user_email, s3_key)
 */

import { query } from '../db/client.js';

export async function getUserFavorites(email) {
  const result = await query(
    'SELECT s3_key FROM favorites WHERE user_email = $1',
    [email]
  );
  return new Set(result.rows.map((r) => r.s3_key));
}

export async function isFavorite(email, s3Key) {
  const result = await query(
    'SELECT 1 FROM favorites WHERE user_email = $1 AND s3_key = $2',
    [email, s3Key]
  );
  return result.rows.length > 0;
}

export async function addFavorite(email, s3Key) {
  const result = await query(
    `INSERT INTO favorites (user_email, s3_key) VALUES ($1, $2)
     ON CONFLICT (user_email, s3_key) DO NOTHING
     RETURNING 1`,
    [email, s3Key]
  );
  return result.rows.length > 0;
}

export async function removeFavorite(email, s3Key) {
  const result = await query(
    'DELETE FROM favorites WHERE user_email = $1 AND s3_key = $2 RETURNING 1',
    [email, s3Key]
  );
  return result.rows.length > 0;
}

export async function toggleFavorite(email, s3Key) {
  const fav = await isFavorite(email, s3Key);
  if (fav) {
    await removeFavorite(email, s3Key);
    return false;
  }
  await addFavorite(email, s3Key);
  return true;
}
