/**
 * User Storage Utility - PostgreSQL-backed storage for user profiles (Neon).
 * Schema: users (email PK, display_name, created_at, updated_at, sign_up_source)
 */

import { query } from '../db/client.js';

function rowToUser(row) {
  if (!row) return null;
  return {
    email: row.email,
    display_name: row.display_name ?? '',
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    sign_up_source: row.sign_up_source ?? 'passport_download',
  };
}

export async function getUser(email) {
  const result = await query(
    'SELECT email, display_name, created_at, updated_at, sign_up_source FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

export async function upsertUser(email, displayName, signUpSource = 'passport_download') {
  const now = new Date().toISOString();
  await query(
    `INSERT INTO users (email, display_name, created_at, updated_at, sign_up_source)
     VALUES ($1, $2, $3::timestamptz, $3::timestamptz, $4)
     ON CONFLICT (email) DO UPDATE SET
       display_name = CASE WHEN TRIM(EXCLUDED.display_name) <> '' THEN EXCLUDED.display_name ELSE users.display_name END,
       updated_at = EXCLUDED.updated_at`,
    [email, displayName || '', now, signUpSource]
  );
  return await getUser(email);
}

export async function userExists(email) {
  const result = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  return result.rows.length > 0;
}

export async function getUserDisplayName(email) {
  const user = await getUser(email);
  return user?.display_name ?? null;
}

export async function updateUserDisplayName(email, displayName) {
  const result = await query(
    'UPDATE users SET display_name = $1, updated_at = NOW() WHERE email = $2 RETURNING email, display_name, created_at, updated_at, sign_up_source',
    [displayName, email]
  );
  return result.rows[0] ? rowToUser(result.rows[0]) : null;
}

export async function getAllUsers() {
  const result = await query(
    'SELECT email, display_name, created_at, updated_at, sign_up_source FROM users ORDER BY email'
  );
  const users = {};
  for (const row of result.rows) {
    users[row.email] = rowToUser(row);
  }
  return users;
}
