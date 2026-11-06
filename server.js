/**
 * ============================================================================
 * EXPRESS SPA SERVER - DASHBOARD-PASSPORT
 * ============================================================================
 * 
 * This server serves the built Vite SPA from dist/ directory.
 * ALL routes fall back to index.html for React Router to handle.
 * 
 * CRITICAL REQUIREMENTS:
 * - dist/ MUST exist (built via npm run build)
 * - ALL routes return index.html for SPA routing
 * - Static assets served first, then SPA fallback
 * - Extensive logging for production debugging
 * 
 * DEPLOYMENT:
 * - Host runs: npm install
 * - Host runs: npm run build (creates dist/ directory)
 * - Host runs: npm start (starts this server)
 * - Server listens on PORT env var (provided by the host)
 */

import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';
import AWS from 'aws-sdk';

import { requireAuth, normalizeEmail } from './shared/utils/magicServer.js';
import { isDbConfigured } from './shared/db/client.js';
import { getUserFavorites, toggleFavorite, isFavorite } from './shared/utils/favoritesStorage.js';
import { upsertUser, getUser, getUserDisplayName } from './shared/utils/userStorage.js';
import { validateFilter, validateS3Key } from './shared/utils/inputValidation.js';

// ============================================================================
// BOOT LOGGING
// ============================================================================
console.log('========================================');
console.log('🚀 DASHBOARD-PASSPORT SERVER BOOTING');
console.log('========================================');
console.log('Timestamp:', new Date().toISOString());
console.log('Node version:', process.version);
console.log('Working directory:', process.cwd());

// ============================================================================
// PATH RESOLUTION (ABSOLUTE, NO ASSUMPTIONS)
// ============================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '.env') });

// Resolve absolute paths (works regardless of cwd)
const distPath = resolve(__dirname, 'dist');
const indexHtmlPath = resolve(distPath, 'index.html');

console.log('Server file location:', __filename);
console.log('Server directory:', __dirname);
console.log('Dist path (absolute):', distPath);
console.log('Index.html path (absolute):', indexHtmlPath);

// ============================================================================
// VERIFY DIST EXISTS
// ============================================================================
if (!existsSync(distPath)) {
  console.error('========================================');
  console.error('❌ CRITICAL ERROR: dist/ directory does not exist!');
  console.error('========================================');
  console.error('Expected path:', distPath);
  console.error('Run: npm run build');
  console.error('========================================');
  process.exit(1);
}

if (!existsSync(indexHtmlPath)) {
  console.error('========================================');
  console.error('❌ CRITICAL ERROR: dist/index.html does not exist!');
  console.error('========================================');
  console.error('Expected path:', indexHtmlPath);
  console.error('Run: npm run build');
  console.error('========================================');
  process.exit(1);
}

console.log('✅ dist/ directory verified');
console.log('✅ dist/index.html verified');

// ============================================================================
// PORT VALIDATION
// ============================================================================
const PORT = process.env.PORT || 3000;

if (!process.env.PORT) {
  console.warn('⚠️  WARNING: PORT env var not set, using default:', PORT);
} else {
  console.log('✅ PORT environment variable:', PORT);
}

// ============================================================================
// EXPRESS SETUP
// ============================================================================
const app = express();

// Enable CORS for API routes
app.use(cors());

// Parse JSON bodies for API routes
app.use(express.json());

// Request logging middleware (runs on EVERY request)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// STATIC FILE SERVING
// ============================================================================
console.log('📁 Configuring static file serving from:', distPath);

// Create static middleware instance
const staticMiddleware = express.static(distPath, {
  fallthrough: true,  // Continue to next middleware if file not found
  index: false,       // Don't auto-serve index.html (we handle it manually)
  dotfiles: 'ignore', // Ignore dotfiles
  etag: true,         // Enable ETag caching
  lastModified: true  // Enable Last-Modified headers
});

app.use(staticMiddleware);

// ============================================================================
// AWS S3 CLIENT SETUP
// ============================================================================
const awsRegion = process.env.AWS_REGION || 'me-central-1';
const s3Bucket = process.env.S3_BUCKET;
const s3Client = s3Bucket ? new AWS.S3({ 
  region: awsRegion,
  apiVersion: '2006-03-01',
  signatureVersion: 'v4',
}) : null;

if (!s3Client) {
  console.warn('⚠️  WARNING: S3_BUCKET not configured - renders API will not work');
}

// ============================================================================
// API ROUTES (Must come before SPA catch-all)
// ============================================================================

/**
 * POST /api/user/signup
 * Implicit user signup/upsert
 * Called when user downloads for the first time (or updates their info)
 * Body: { email: string, displayName: string }
 */
app.post('/api/user/signup', async (req, res) => {
  const { email, displayName } = req.body;

  if (!email || !displayName) {
    return res.status(400).json({
      success: false,
      error: 'Please provide both email address and display name',
    });
  }

  if (!isDbConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable. Please try again later.',
      code: 'DATABASE_NOT_CONFIGURED',
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
      error: 'We couldn\'t create your account. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * POST /api/user/check-email
 * Check if a user exists by email (no authentication required)
 * Body: { email: string }
 * Returns: { exists: boolean }
 */
app.post('/api/user/check-email', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'Please provide an email address',
    });
  }

  if (!isDbConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable. Please try again later.',
      code: 'DATABASE_NOT_CONFIGURED',
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
      error: 'We couldn\'t verify your email. Please try again.',
    });
  }
});

/**
 * GET /api/user/profile
 * Get user profile for the authenticated user
 * Authentication: Required (Magic DID token)
 */
app.get('/api/user/profile', requireAuth, async (req, res) => {
  const { email } = req.user;

  console.log(`[API] GET /api/user/profile - User: ${email}`);

  if (!isDbConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable. Please try again later.',
      code: 'DATABASE_NOT_CONFIGURED',
    });
  }

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
      error: 'We couldn\'t load your profile. Please refresh and try again.',
    });
  }
});

/**
 * GET /api/renders
 * List all renders for the authenticated user
 * Query params:
 *   - filter: 'all' | 'favorites' (default: 'all')
 * Authentication: Required (Magic DID token)
 */
app.get('/api/renders', requireAuth, async (req, res) => {
  const { email } = req.user;
  const filter = validateFilter(req.query.filter);


  if (!s3Client) {
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable. Please try again later.',
    });
  }

  if (!isDbConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable. Please try again later.',
      code: 'DATABASE_NOT_CONFIGURED',
    });
  }

  try {
    // Normalize email for S3 prefix
    const normalizedEmail = normalizeEmail(email);
    
    // Check if user exists (has downloaded at least once)
    const user = await getUser(normalizedEmail);
    
    // List objects with user's email prefix
    // S3 key pattern: renders/{email}/dashboard-passport/{filename}
    const prefix = `renders/${normalizedEmail}/`;

    const listParams = {
      Bucket: s3Bucket,
      Prefix: prefix,
    };

    const listResponse = await s3Client.listObjectsV2(listParams).promise();
    const objects = listResponse.Contents || [];

    // Get user's favorites
    const favorites = await getUserFavorites(normalizedEmail);

    // Process each object
    const renders = await Promise.all(
      objects.map(async (obj) => {
        const s3Key = obj.Key;
        const isFav = favorites.has(s3Key);

        // Skip if filtering for favorites and this isn't one
        if (filter === 'favorites' && !isFav) {
          return null;
        }

        // Generate signed URL for video playback/download (expires in 1 hour)
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

    // Filter out nulls (from favorites filter)
    const filteredRenders = renders.filter(r => r !== null);

    // Sort by lastModified descending (most recent first)
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
      error: 'We couldn\'t load your videos. Please refresh and try again.',
    });
  }
});

/**
 * POST /api/renders/favorite
 * Toggle favorite status for a render
 * Body: { s3Key: string }
 */
app.post('/api/renders/favorite', requireAuth, async (req, res) => {
  const { email } = req.user;
  const s3KeyValidation = validateS3Key(req.body?.s3Key);
  if (!s3KeyValidation.valid) {
    return res.status(400).json({ success: false, error: s3KeyValidation.error });
  }
  const s3Key = s3KeyValidation.sanitized;

  if (!isDbConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable. Please try again later.',
      code: 'DATABASE_NOT_CONFIGURED',
    });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    
    // Verify the s3Key belongs to this user (security check)
    const expectedPrefix = `renders/${normalizedEmail}/`;
    if (!s3Key.startsWith(expectedPrefix)) {
      return res.status(403).json({
        success: false,
        error: 'You don\'t have permission to access this video',
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
      error: 'We couldn\'t update your favorite. Please try again.',
    });
  }
});

/**
 * DELETE /api/renders/delete
 * Delete a render from S3
 * Body: { s3Key: string }
 */
app.delete('/api/renders/delete', requireAuth, async (req, res) => {
  const { email } = req.user;
  const s3KeyValidation = validateS3Key(req.body?.s3Key);
  if (!s3KeyValidation.valid) {
    return res.status(400).json({ success: false, error: s3KeyValidation.error });
  }
  const s3Key = s3KeyValidation.sanitized;

  if (!s3Client) {
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable. Please try again later.',
    });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    
    // Verify the s3Key belongs to this user (security check)
    const expectedPrefix = `renders/${normalizedEmail}/`;
    if (!s3Key.startsWith(expectedPrefix)) {
      return res.status(403).json({
        success: false,
        error: 'You don\'t have permission to delete this video',
      });
    }

    // Delete the object from S3
    const deleteParams = {
      Bucket: s3Bucket,
      Key: s3Key,
    };

    await s3Client.deleteObject(deleteParams).promise();
    console.log(`[API] Successfully deleted S3 object: ${s3Key}`);

    res.json({
      success: true,
      s3Key,
      message: 'Video deleted successfully',
    });
  } catch (error) {
    console.error('[API] Error deleting render:', error);
    res.status(500).json({
      success: false,
      error: 'We couldn\'t delete the video. Please try again.',
    });
  }
});

// ============================================================================
// SPA CATCH-ALL ROUTE (HANDLES ALL ROUTES)
// ============================================================================
console.log('🔄 Configuring SPA catch-all route');

app.all('*', (req, res) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📄 SPA FALLBACK TRIGGERED');
  console.log('  Method:', req.method);
  console.log('  URL:', req.url);
  console.log('  Path:', req.path);
  console.log('  Serving index.html for React Router');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  res.sendFile(indexHtmlPath, (err) => {
    if (err) {
      console.error('========================================');
      console.error('❌ ERROR serving index.html');
      console.error('========================================');
      console.error('Error:', err.message);
      console.error('Request path:', req.path);
      console.error('Index.html path:', indexHtmlPath);
      console.error('Dist path exists:', existsSync(distPath));
      console.error('Index.html exists:', existsSync(indexHtmlPath));
      console.error('========================================');
      
      res.status(500).send(`
        <html>
          <head><title>Service Unavailable</title></head>
          <body style="font-family: system-ui, sans-serif; padding: 40px; text-align: center;">
            <h1>We're experiencing technical difficulties</h1>
            <p>Please try refreshing the page or contact support if the problem persists.</p>
          </body>
        </html>
      `);
    } else {
      console.log('✅ Successfully served index.html');
    }
  });
});

// ============================================================================
// SERVER START
// ============================================================================
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
  console.log('✅ DASHBOARD-PASSPORT SERVER RUNNING');
  console.log('========================================');
  console.log('Port:', PORT);
  console.log('Static files:', distPath);
  console.log('SPA fallback: ENABLED (all routes → index.html)');
  console.log('Ready to serve requests');
  console.log('========================================');
});

// ============================================================================
// ERROR HANDLING
// ============================================================================
process.on('uncaughtException', (err) => {
  console.error('========================================');
  console.error('❌ UNCAUGHT EXCEPTION');
  console.error('========================================');
  console.error(err);
  console.error('========================================');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('========================================');
  console.error('❌ UNHANDLED REJECTION');
  console.error('========================================');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('========================================');
});
