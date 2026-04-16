/**
 * rest-auth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * REST-based authentication endpoints for the Faculty Portal.
 *
 * Routes exposed (all prefixed by /api/auth when mounted in server.js):
 *   POST   /api/auth/signup    — Register a new faculty member
 *   POST   /api/auth/login     — Authenticate and receive a JWT
 *   GET    /api/auth/me        — Protected: returns current faculty profile
 *
 * Security practices applied:
 *   ✔ Passwords hashed with bcrypt (saltRounds = 12)
 *   ✔ JWT signed with JWT_SECRET from .env (falls back to 'fallback_secret')
 *   ✔ Token expiry: 7 days
 *   ✔ 401 returned for invalid credentials OR invalid/expired tokens
 *   ✔ Passwords never returned in any response
 *   ✔ Rate-limit friendly — no unnecessary DB queries before validation
 */

const express = require('express');
const router  = express.Router();
const db      = require('./db');
const { signAccessToken, signRefreshToken, verifyToken, verifyTokenWithError, hashPassword, comparePassword } = require('./auth');

// ── Helper functions for refresh tokens ──────────────────────────────────────

async function saveRefreshToken(facultyId, refreshToken, userAgent = null, ipAddress = null) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await db.query(
    `INSERT INTO refresh_tokens (faculty_id, token, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [facultyId, refreshToken, expiresAt, userAgent, ipAddress]
  );
}

async function verifyRefreshToken(refreshToken) {
  const { rows } = await db.query(
    `SELECT * FROM refresh_tokens 
     WHERE token = $1 AND expires_at > NOW()`,
    [refreshToken]
  );
  
  if (rows.length === 0) {
    return null;
  }
  
  // Update last_used_at
  await db.query(
    `UPDATE refresh_tokens SET last_used_at = NOW() WHERE token = $1`,
    [refreshToken]
  );
  
  return rows[0];
}

async function deleteRefreshToken(refreshToken) {
  await db.query(
    `DELETE FROM refresh_tokens WHERE token = $1`,
    [refreshToken]
  );
}

// ── Middleware: verify JWT Bearer token ──────────────────────────────────────

/**
 * Express middleware — validates the Authorization: Bearer <token> header.
 *
 * On success : attaches `req.faculty` = { facultyId, email } and calls next()
 * On failure : responds 401 Unauthorized with a JSON error object
 *
 * Usage: apply as a per-route or router-level middleware on protected routes.
 */
function verifyRestToken(req, res, next) {
  const authHeader = req.headers['authorization'] || '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error  : 'Unauthorized',
      message: 'No token provided. Please log in.',
    });
  }

  const token   = authHeader.slice(7); // strip "Bearer "
  const decoded = verifyToken(token);  // returns null if invalid/expired

  if (!decoded) {
    return res.status(401).json({
      error  : 'Unauthorized',
      message: 'Token is invalid or has expired. Please log in again.',
    });
  }

  // Attach decoded payload to request for downstream handlers
  req.faculty = { facultyId: decoded.facultyId, email: decoded.email };
  next();
}

// ── POST /api/auth/signup ────────────────────────────────────────────────────

/**
 * Register a new faculty account.
 *
 * Body: { name, email, password, classSection }
 *
 * Returns 201 { token, faculty } on success.
 * Returns 400 for validation errors or duplicate email.
 */
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, classSection } = req.body;

    // ── Input validation ─────────────────────────────────────────────────────
    if (!name || !email || !password) {
      return res.status(400).json({
        error  : 'Bad Request',
        message: 'name, email and password are required.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error  : 'Bad Request',
        message: 'Please provide a valid email address.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error  : 'Bad Request',
        message: 'Password must be at least 6 characters.',
      });
    }

    // ── Duplicate check ──────────────────────────────────────────────────────
    const existing = await db.query(
      'SELECT id FROM faculty WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({
        error  : 'Bad Request',
        message: 'An account with this email already exists. Please log in.',
      });
    }

    // ── Create faculty record ────────────────────────────────────────────────
    const passwordHash = await hashPassword(password);
    const { rows } = await db.query(
      `INSERT INTO faculty (name, email, password_hash, class_section)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, class_section, created_at`,
      [name.trim(), email.toLowerCase(), passwordHash, (classSection || '').trim()]
    );

    const faculty = {
      id          : rows[0].id,
      name        : rows[0].name,
      email       : rows[0].email,
      classSection: rows[0].class_section,
      createdAt   : rows[0].created_at ? rows[0].created_at.toISOString() : null,
    };

    // Generate access token (5 minutes) and refresh token (7 days)
    const accessToken = signAccessToken({ facultyId: faculty.id, email: faculty.email });
    const refreshToken = signRefreshToken({ facultyId: faculty.id, email: faculty.email });
    
    // Save refresh token to database
    const userAgent = req.headers['user-agent'] || null;
    const ipAddress = req.ip || req.connection.remoteAddress || null;
    await saveRefreshToken(faculty.id, refreshToken, userAgent, ipAddress);

    return res.status(201).json({ token: accessToken, refreshToken, faculty });

  } catch (err) {
    console.error('[REST /signup] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────

/**
 * Authenticate a faculty member with email + password.
 *
 * Body: { email, password }
 *
 * Returns 200 { token, faculty } on success.
 * Returns 401 for invalid credentials.
 *
 * NOTE: We deliberately return the same 401 for "not found" and "wrong
 * password" to prevent user-enumeration attacks.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // ── Input validation ─────────────────────────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({
        error  : 'Bad Request',
        message: 'email and password are required.',
      });
    }

    // ── Lookup faculty ───────────────────────────────────────────────────────
    const { rows } = await db.query(
      'SELECT * FROM faculty WHERE email = $1',
      [email.toLowerCase()]
    );

    if (rows.length === 0) {
      // User not found — return 401 (not 404) to prevent user enumeration
      return res.status(401).json({
        error  : 'Unauthorized',
        message: 'Invalid email or password.',
      });
    }

    const facultyRow = rows[0];

    // ── Password verification ────────────────────────────────────────────────
    const passwordValid = await comparePassword(password, facultyRow.password_hash);
    if (!passwordValid) {
      return res.status(401).json({
        error  : 'Unauthorized',
        message: 'Invalid email or password.',
      });
    }

    // ── Issue JWT ────────────────────────────────────────────────────────────
    const faculty = {
      id          : facultyRow.id,
      name        : facultyRow.name,
      email       : facultyRow.email,
      classSection: facultyRow.class_section,
      createdAt   : facultyRow.created_at ? facultyRow.created_at.toISOString() : null,
    };

    // Generate access token (5 minutes) and refresh token (7 days)
    const accessToken = signAccessToken({ facultyId: faculty.id, email: faculty.email });
    const refreshToken = signRefreshToken({ facultyId: faculty.id, email: faculty.email });
    
    // Save refresh token to database
    const userAgent = req.headers['user-agent'] || null;
    const ipAddress = req.ip || req.connection.remoteAddress || null;
    await saveRefreshToken(faculty.id, refreshToken, userAgent, ipAddress);

    return res.status(200).json({ token: accessToken, refreshToken, faculty });

  } catch (err) {
    console.error('[REST /login] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

/**
 * Protected route — returns the authenticated faculty's profile.
 * Requires a valid Bearer token.  Returns 401 if token is missing/invalid/expired.
 */
router.get('/me', verifyRestToken, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, email, class_section, created_at FROM faculty WHERE id = $1',
      [req.faculty.facultyId]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        error  : 'Unauthorized',
        message: 'Faculty account not found.',
      });
    }

    const faculty = {
      id          : rows[0].id,
      name        : rows[0].name,
      email       : rows[0].email,
      classSection: rows[0].class_section,
      createdAt   : rows[0].created_at ? rows[0].created_at.toISOString() : null,
    };

    return res.status(200).json({ faculty });

  } catch (err) {
    console.error('[REST /me] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── POST /api/auth/refresh ───────────────────────────────────────────────────

/**
 * Refresh access token using refresh token.
 * 
 * Body: { refreshToken }
 * 
 * Returns 200 { token, refreshToken, faculty } on success.
 * Returns 401 for invalid/expired refresh token.
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error  : 'Bad Request',
        message: 'refreshToken is required.',
      });
    }

    // Verify refresh token in database
    const tokenRecord = await verifyRefreshToken(refreshToken);
    
    if (!tokenRecord) {
      return res.status(401).json({
        error  : 'Unauthorized',
        message: 'Invalid or expired refresh token. Please log in again.',
      });
    }
    
    // Verify JWT signature
    const decoded = verifyToken(refreshToken);
    if (!decoded || !decoded.facultyId) {
      return res.status(401).json({
        error  : 'Unauthorized',
        message: 'Invalid refresh token. Please log in again.',
      });
    }
    
    // Get faculty data
    const { rows } = await db.query(
      'SELECT id, name, email, class_section, created_at FROM faculty WHERE id = $1',
      [decoded.facultyId]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({
        error  : 'Unauthorized',
        message: 'Faculty not found.',
      });
    }
    
    const faculty = {
      id          : rows[0].id,
      name        : rows[0].name,
      email       : rows[0].email,
      classSection: rows[0].class_section,
      createdAt   : rows[0].created_at ? rows[0].created_at.toISOString() : null,
    };
    
    // Generate new access token (5 minutes)
    const newAccessToken = signAccessToken({ facultyId: faculty.id, email: faculty.email });
    
    console.log(`🔄 Access token refreshed for ${faculty.email}`);
    
    return res.status(200).json({
      token: newAccessToken,
      refreshToken, // Return same refresh token
      faculty
    });

  } catch (err) {
    console.error('[REST /refresh] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────

/**
 * Logout - delete refresh token from database.
 * 
 * Body: { refreshToken }
 * 
 * Returns 200 { message } on success.
 */
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error  : 'Bad Request',
        message: 'refreshToken is required.',
      });
    }

    await deleteRefreshToken(refreshToken);
    console.log(`👋 User logged out`);
    
    return res.status(200).json({ message: 'Logged out successfully' });

  } catch (err) {
    console.error('[REST /logout] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// Export the middleware too so it can be used on custom routes elsewhere
module.exports = router;
module.exports.verifyRestToken = verifyRestToken;
