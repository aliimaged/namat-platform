/**
 * Development API Server
 * Runs API routes without requiring built dist/
 * Use with: node server-dev.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import express from 'express';
import cors from 'cors';
import AWS from 'aws-sdk';

// Load .env from monorepo root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '.env');
dotenv.config({ path: envPath });
console.log('[ENV] Loading environment from:', envPath);
import { requireAuth, normalizeEmail } from './shared/utils/magicServer.js';
import { getUserFavorites, toggleFavorite } from './shared/utils/favoritesStorage.js';
import { upsertUser, getUser } from './shared/utils/userStorage.js';
import { validateFilter, validateS3Key } from './shared/utils/inputValidation.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for development
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// AWS S3 setup
const awsRegion = process.env.AWS_REGION || 'me-central-1';
const s3Bucket = process.env.S3_BUCKET;
const s3Client = s3Bucket ? new AWS.S3({ 
  region: awsRegion,
  apiVersion: '2006-03-01',
  signatureVersion: 'v4',
}) : null;

// ============================================================================
// API ROUTES
// ============================================================================

/**
 * POST /api/user/signup
 */
app.post('/api/user/signup', async (req, res) => {
  const { email, displayName } = req.body;

  if (!email || !displayName) {
    return res.status(400).json({
      success: false,
      error: 'email and displayName are required',
    });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    const user = await upsertUser(normalizedEmail, displayName, 'passport_download');

    res.json({
      success: true,
      user: {
        email: user.email,
        displayName: user.display_name,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error('[API] Error upserting user:', error);
    console.error('[API] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create/update user',
      details: error.stack,
    });
  }
});

/**
 * POST /api/user/check-email
 */
app.post('/api/user/check-email', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'email is required',
    });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    const user = await getUser(normalizedEmail);

    res.json({
      success: true,
      exists: !!user,
    });
  } catch (error) {
    console.error('[API] Error checking email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check email',
    });
  }
});

/**
 * GET /api/user/profile
 */
app.get('/api/user/profile', requireAuth, async (req, res) => {
  const { email } = req.user;


  try {
    const normalizedEmail = normalizeEmail(email);
    const user = await getUser(normalizedEmail);

    if (!user) {
      return res.json({
        success: true,
        user: null,
        message: 'User not found - no downloads yet',
      });
    }

    res.json({
      success: true,
      user: {
        email: user.email,
        displayName: user.display_name,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error('[API] Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch user profile',
    });
  }
});

/**
 * GET /api/renders
 */
app.get('/api/renders', requireAuth, async (req, res) => {
  const { email } = req.user;
  const filter = validateFilter(req.query.filter);

  if (!s3Client) {
    return res.status(503).json({
      success: false,
      error: 'S3 not configured',
    });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    const user = await getUser(normalizedEmail);
    
    const prefix = `renders/${normalizedEmail}/`;

    const listParams = {
      Bucket: s3Bucket,
      Prefix: prefix,
    };

    const listResponse = await s3Client.listObjectsV2(listParams).promise();
    const objects = listResponse.Contents || [];

    if (objects.length > 0) {
      console.log('[API] Sample S3 keys:', objects.slice(0, 3).map(o => o.Key));
    }

    const favorites = await getUserFavorites(normalizedEmail);

    const renders = await Promise.all(
      objects.map(async (obj) => {
        const s3Key = obj.Key;
        const isFav = favorites.has(s3Key);

        if (filter === 'favorites' && !isFav) {
          return null;
        }

        const signedUrl = s3Client.getSignedUrl('getObject', {
          Bucket: s3Bucket,
          Key: s3Key,
          Expires: 3600,
        });

        return {
          s3Key,
          signedUrl,
          lastModified: obj.LastModified?.toISOString(),
          size: obj.Size,
          isFavorite: isFav,
        };
      })
    );

    const filteredRenders = renders.filter(r => r !== null);

    const sortedRenders = filteredRenders.toSorted((a, b) => {
      const dateA = new Date(a.lastModified || 0);
      const dateB = new Date(b.lastModified || 0);
      return dateB - dateA;
    });

    res.json({
      success: true,
      renders: sortedRenders,
      count: sortedRenders.length,
      user: user ? {
        email: user.email,
        displayName: user.display_name,
      } : null,
    });
  } catch (error) {
    console.error('[API] Error fetching renders:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch renders',
    });
  }
});

/**
 * POST /api/renders/favorite
 */
app.post('/api/renders/favorite', requireAuth, async (req, res) => {
  const { email } = req.user;
  const s3KeyValidation = validateS3Key(req.body?.s3Key);
  if (!s3KeyValidation.valid) {
    return res.status(400).json({ success: false, error: s3KeyValidation.error });
  }
  const s3Key = s3KeyValidation.sanitized;

  try {
    const normalizedEmail = normalizeEmail(email);
    const expectedPrefix = `renders/${normalizedEmail}/`;

    if (!s3Key.startsWith(expectedPrefix)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const newStatus = await toggleFavorite(normalizedEmail, s3Key);

    res.json({
      success: true,
      isFavorite: newStatus,
      s3Key,
    });
  } catch (error) {
    console.error('[API] Error toggling favorite:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to toggle favorite',
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server (init DB schema when DATABASE_URL is set)
async function start() {
  if (process.env.DATABASE_URL) {
    try {
      const { initDb } = await import('./shared/db/client.js');
      await initDb();
      console.log('✅ Database schema initialized');
    } catch (err) {
      console.error('[db] Schema init failed:', err);
      process.exit(1);
    }
  }
  app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 PASSPORT API DEV SERVER RUNNING');
    console.log('========================================');
    console.log('Port:', PORT);
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('S3 Configured:', !!s3Client);
    console.log('Database:', process.env.DATABASE_URL ? 'Neon (DATABASE_URL set)' : 'Not configured');
    console.log('========================================');
  });
}
start();
