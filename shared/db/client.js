/**
 * PostgreSQL database client for Neon (AWS).
 * Uses DATABASE_URL and SSL suitable for Neon serverless.
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirnameDb = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

/** @type {pg.Pool | null} */
let pool = null;

/**
 * Whether the database is configured (DATABASE_URL set).
 * @returns {boolean}
 */
export function isDbConfigured() {
  return !!process.env.DATABASE_URL;
}

/**
 * Get or create the database pool.
 * @returns {pg.Pool}
 */
export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Add it to .env or your environment for PostgreSQL (Neon) connection.'
    );
  }

  const isNeon = connectionString.includes('neon.tech');
  // Neon serverless requires rejectUnauthorized: false for certain connection scenarios.
  // See: https://neon.tech/docs/connect/connection-pooling#connection-parameters
  pool = new Pool({
    connectionString,
    ssl: isNeon ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('[db] Unexpected pool error:', err);
  });

  return pool;
}

/**
 * Run a query.
 * @param {string} text - SQL text
 * @param {unknown[]} [params] - Query parameters
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const p = getPool();
  return p.query(text, params);
}

/**
 * Close the pool. Idempotent.
 * @returns {Promise<void>}
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Run schema.sql to create tables if they don't exist.
 * @returns {Promise<void>}
 */
export async function initDb() {
  if (!process.env.DATABASE_URL) return;
  const schemaPath = resolve(__dirnameDb, 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf8');
  const p = getPool();
  await p.query(sql);
}
