const db = require('./db');
const { generateOtp, sendOtpEmail, signAccessToken, signRefreshToken, verifyToken, verifyTokenWithError, hashPassword, comparePassword } = require('./auth');
const { GraphQLError } = require('graphql');

// In-memory rate limiting store for GraphQL login
const loginAttempts = new Map();

// Rate limit configuration
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;

// Helper: Check rate limit for an email
function checkRateLimit(email) {
  const now = Date.now();
  const key = email.toLowerCase().trim();
  const attempts = loginAttempts.get(key);
  
  if (!attempts) {
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }
  
  // Clean old attempts outside the window
  const validAttempts = attempts.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (validAttempts.length >= MAX_ATTEMPTS) {
    const oldestAttempt = validAttempts[0];
    const resetTime = oldestAttempt + RATE_LIMIT_WINDOW;
    const waitMinutes = Math.ceil((resetTime - now) / 60000);
    return { 
      allowed: false, 
      waitMinutes,
      message: `Too many failed login attempts. Please try again after ${waitMinutes} minutes.`
    };
  }
  
  return { allowed: true, remaining: MAX_ATTEMPTS - validAttempts.length - 1 };
}

// Helper: Record a failed attempt
function recordFailedAttempt(email) {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const attempts = loginAttempts.get(key) || [];
  attempts.push(now);
  loginAttempts.set(key, attempts);
  console.log(`⚠️  Failed login attempt recorded for ${key}. Total attempts: ${attempts.length}`);
}

// Helper: Clear attempts on successful login
function clearAttempts(email) {
  const key = email.toLowerCase().trim();
  loginAttempts.delete(key);
}

const getStatus = (marks) => marks >= 40 ? 'Pass' : 'Fail';

// Helper: throw if not authenticated
function requireAuth(context) {
  if (!context.facultyId) {
    throw new GraphQLError('Not authenticated. Please log in.', {
      extensions: { code: 'UNAUTHENTICATED' }
    });
  }
}

// Helper: map DB row to Document shape
function mapDocument(row) {
  return {
    id: row.id,
    facultyId: row.faculty_id,
    filename: row.filename,
    originalName: row.original_name,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    uploadDate: row.upload_date ? row.upload_date.toISOString() : null,
    description: row.description
  };
}

// Helper: map DB row to Student shape
function mapStudent(row) {
  return {
    ...row,
    englishStatus: row.english_status,
    tamilStatus: row.tamil_status,
    mathsStatus: row.maths_status
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// REFRESH TOKEN HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// Save refresh token to database
async function saveRefreshToken(facultyId, refreshToken, userAgent = null, ipAddress = null) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await db.query(
    `INSERT INTO refresh_tokens (faculty_id, token, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [facultyId, refreshToken, expiresAt, userAgent, ipAddress]
  );
}

// Verify refresh token exists and is valid
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

// Delete refresh token (logout)
async function deleteRefreshToken(refreshToken) {
  await db.query(
    `DELETE FROM refresh_tokens WHERE token = $1`,
    [refreshToken]
  );
}

// Delete all refresh tokens for a faculty (logout all devices)
async function deleteAllRefreshTokens(facultyId) {
  await db.query(
    `DELETE FROM refresh_tokens WHERE faculty_id = $1`,
    [facultyId]
  );
}

// Clean up expired tokens (can be called periodically)
async function cleanupExpiredTokens() {
  const result = await db.query(
    `DELETE FROM refresh_tokens WHERE expires_at < NOW()`
  );
  return result.rowCount;
}

const resolvers = {
  Query: {
    // Only returns students belonging to this faculty
    users: async (_, __, context) => {
      requireAuth(context);
      const { rows } = await db.query(
        'SELECT * FROM users WHERE faculty_id = $1 ORDER BY id ASC',
        [context.facultyId]
      );
      return rows.map(mapStudent);
    },

    // New paginated query with search and backend validation
    paginatedUsers: async (_, { page = 1, pageSize = 5, search = '', sortBy = 'id', sortOrder = 'ASC' }, context) => {
      requireAuth(context);

      // Backend validation for pagination parameters
      if (page < 1) {
        throw new GraphQLError('Page number must be at least 1');
      }
      if (pageSize < 1 || pageSize > 100) {
        throw new GraphQLError('Page size must be between 1 and 100');
      }

      // Validate sortBy column (prevent SQL injection)
      const allowedSortColumns = ['id', 'name', 'email', 'english', 'tamil', 'maths', 'total'];
      if (!allowedSortColumns.includes(sortBy)) {
        throw new GraphQLError(`Invalid sort column. Allowed: ${allowedSortColumns.join(', ')}`);
      }

      // Validate sortOrder (prevent SQL injection)
      const normalizedSortOrder = sortOrder.toUpperCase();
      if (normalizedSortOrder !== 'ASC' && normalizedSortOrder !== 'DESC') {
        throw new GraphQLError('Sort order must be ASC or DESC');
      }

      // Build search query
      let query = 'SELECT * FROM users WHERE faculty_id = $1';
      let countQuery = 'SELECT COUNT(*) FROM users WHERE faculty_id = $1';
      const params = [context.facultyId];
      
      if (search && search.trim()) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        query += ' AND (LOWER(name) LIKE $2 OR LOWER(email) LIKE $2 OR CAST(id AS TEXT) LIKE $2)';
        countQuery += ' AND (LOWER(name) LIKE $2 OR LOWER(email) LIKE $2 OR CAST(id AS TEXT) LIKE $2)';
        params.push(searchTerm);
      }

      // Get total count
      const { rows: countRows } = await db.query(countQuery, params);
      const totalCount = parseInt(countRows[0].count);
      const totalPages = Math.ceil(totalCount / pageSize) || 1;

      // Validate page number against total pages
      if (page > totalPages && totalCount > 0) {
        throw new GraphQLError(`Page ${page} does not exist. Total pages: ${totalPages}`);
      }

      // Add sorting and pagination
      const offset = (page - 1) * pageSize;
      query += ` ORDER BY ${sortBy} ${normalizedSortOrder} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(pageSize, offset);

      // Get paginated results
      const { rows } = await db.query(query, params);

      return {
        users: rows.map(mapStudent),
        pagination: {
          currentPage: page,
          pageSize,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }
      };
    },

    user: async (_, { id }, context) => {
      requireAuth(context);
      const { rows } = await db.query(
        'SELECT * FROM users WHERE id = $1 AND faculty_id = $2',
        [id, context.facultyId]
      );
      return rows[0] ? mapStudent(rows[0]) : null;
    },

    me: async (_, __, context) => {
      requireAuth(context);
      const { rows } = await db.query('SELECT * FROM faculty WHERE id = $1', [context.facultyId]);
      return rows[0] ? {
        ...rows[0],
        classSection: rows[0].class_section,
        createdAt: rows[0].created_at ? rows[0].created_at.toISOString() : null
      } : null;
    },

    // Get documents for logged-in faculty
    myDocuments: async (_, __, context) => {
      requireAuth(context);
      const { rows } = await db.query(
        'SELECT * FROM documents WHERE faculty_id = $1 ORDER BY upload_date DESC',
        [context.facultyId]
      );
      return rows.map(mapDocument);
    },

    // Get all documents (for admin purposes)
    allDocuments: async (_, __, context) => {
      requireAuth(context);
      const { rows } = await db.query(
        'SELECT * FROM documents ORDER BY upload_date DESC'
      );
      return rows.map(mapDocument);
    }
  },

  Mutation: {
    // ── Auth ────────────────────────────────────────────────────────────────

    sendOtp: async (_, { email }) => {
      // Check if email already registered
      const existing = await db.query('SELECT id FROM faculty WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        throw new GraphQLError('An account with this email already exists. Please log in.');
      }

      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Upsert OTP record
      await db.query(
        `INSERT INTO otp_store (email, otp, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET otp = $2, expires_at = $3`,
        [email, otp, expiresAt]
      );

      await sendOtpEmail(email, otp);
      return 'OTP sent successfully to ' + email;
    },

    verifyOtpAndRegister: async (_, { name, email, otp, password, classSection }) => {
      // Validate OTP
      const { rows } = await db.query(
        'SELECT * FROM otp_store WHERE email = $1',
        [email]
      );

      if (rows.length === 0) {
        throw new GraphQLError('No OTP found for this email. Please request a new OTP.');
      }

      const record = rows[0];
      if (record.otp !== otp) {
        throw new GraphQLError('Invalid OTP. Please try again.');
      }
      if (new Date() > new Date(record.expires_at)) {
        await db.query('DELETE FROM otp_store WHERE email = $1', [email]);
        throw new GraphQLError('OTP has expired. Please request a new one.');
      }

      // The frontend sends SHA-256(password) — a 64-char hex string.
      // We validate the format, then bcrypt it for storage.
      // This ensures plaintext passwords never travel over the network.
      if (!password || !/^[0-9a-f]{64}$/.test(password)) {
        throw new GraphQLError('Invalid password format received from client.');
      }

      // Check if already registered (race condition guard)
      const alreadyExists = await db.query('SELECT id FROM faculty WHERE email = $1', [email]);
      if (alreadyExists.rows.length > 0) {
        throw new GraphQLError('Account already exists. Please log in.');
      }

      const passwordHash = await hashPassword(password);

      const { rows: facultyRows } = await db.query(
        `INSERT INTO faculty (name, email, password_hash, class_section) VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, email, passwordHash, classSection]
      );

      // Clean up OTP
      await db.query('DELETE FROM otp_store WHERE email = $1', [email]);

      const faculty = {
        ...facultyRows[0],
        classSection: facultyRows[0].class_section,
        createdAt: facultyRows[0].created_at ? facultyRows[0].created_at.toISOString() : null
      };
      
      // Generate access token (5 minutes) and refresh token (7 days)
      const accessToken = signAccessToken({ facultyId: faculty.id, email: faculty.email });
      const refreshToken = signRefreshToken({ facultyId: faculty.id, email: faculty.email });
      
      // Save refresh token to database
      await saveRefreshToken(faculty.id, refreshToken);

      return { token: accessToken, refreshToken, faculty };
    },

    loginFaculty: async (_, { email, password }) => {
      // Check rate limit first
      const rateLimitCheck = checkRateLimit(email);
      
      if (!rateLimitCheck.allowed) {
        console.log(`🚫 Rate limit blocked login for ${email}. Wait ${rateLimitCheck.waitMinutes} minutes.`);
        throw new GraphQLError(rateLimitCheck.message, {
          extensions: { 
            code: 'RATE_LIMITED',
            http: { status: 429 },
            // These will be visible in browser console
            debug: {
              type: 'RATE_LIMIT',
              email: email.toLowerCase().trim(),
              maxAttempts: MAX_ATTEMPTS,
              waitMinutes: rateLimitCheck.waitMinutes,
              timestamp: new Date().toISOString(),
              message: 'Too many failed login attempts for this account'
            }
          }
        });
      }

      const { rows } = await db.query('SELECT * FROM faculty WHERE email = $1', [email]);
      if (rows.length === 0) {
        recordFailedAttempt(email);
        throw new GraphQLError('No account found with this email.', {
          extensions: {
            code: 'USER_NOT_FOUND',
            debug: {
              type: 'LOGIN_FAILED',
              reason: 'Account does not exist',
              remainingAttempts: rateLimitCheck.remaining,
              timestamp: new Date().toISOString()
            }
          }
        });
      }

      const faculty = rows[0];
      const valid = await comparePassword(password, faculty.password_hash);
      if (!valid) {
        recordFailedAttempt(email);
        throw new GraphQLError('Incorrect password. Please try again.', {
          extensions: {
            code: 'INVALID_PASSWORD',
            debug: {
              type: 'LOGIN_FAILED',
              reason: 'Wrong password',
              remainingAttempts: Math.max(0, rateLimitCheck.remaining),
              timestamp: new Date().toISOString()
            }
          }
        });
      }

      // Success - clear failed attempts
      clearAttempts(email);
      console.log(`✅ Successful login for ${email}`);

      const facultyData = {
        ...faculty,
        classSection: faculty.class_section,
        createdAt: faculty.created_at ? faculty.created_at.toISOString() : null
      };
      
      // Generate access token (5 minutes) and refresh token (7 days)
      const accessToken = signAccessToken({ facultyId: faculty.id, email: faculty.email });
      const refreshToken = signRefreshToken({ facultyId: faculty.id, email: faculty.email });
      
      // Save refresh token to database
      await saveRefreshToken(faculty.id, refreshToken);

      return { 
        token: accessToken,
        refreshToken,
        faculty: facultyData,
        // Add debug info to successful response
        debug: {
          type: 'LOGIN_SUCCESS',
          remainingAttempts: MAX_ATTEMPTS,
          timestamp: new Date().toISOString()
        }
      };
    },

    // ═══════════════════════════════════════════════════════════════════════
    // REFRESH ACCESS TOKEN - Automatically renew expired access token
    // ═══════════════════════════════════════════════════════════════════════
    refreshAccessToken: async (_, { refreshToken }) => {
      // Verify refresh token in database
      const tokenRecord = await verifyRefreshToken(refreshToken);
      
      if (!tokenRecord) {
        throw new GraphQLError('Invalid or expired refresh token. Please log in again.', {
          extensions: { code: 'INVALID_REFRESH_TOKEN' }
        });
      }
      
      // Verify JWT signature
      const decoded = verifyToken(refreshToken);
      if (!decoded || !decoded.facultyId) {
        throw new GraphQLError('Invalid refresh token. Please log in again.', {
          extensions: { code: 'INVALID_REFRESH_TOKEN' }
        });
      }
      
      // Get faculty data
      const { rows } = await db.query('SELECT * FROM faculty WHERE id = $1', [decoded.facultyId]);
      if (rows.length === 0) {
        throw new GraphQLError('Faculty not found.', {
          extensions: { code: 'USER_NOT_FOUND' }
        });
      }
      
      const faculty = {
        ...rows[0],
        classSection: rows[0].class_section,
        createdAt: rows[0].created_at ? rows[0].created_at.toISOString() : null
      };
      
      // Generate new access token (5 minutes)
      const newAccessToken = signAccessToken({ facultyId: faculty.id, email: faculty.email });
      
      console.log(`🔄 Access token refreshed for ${faculty.email}`);
      
      return {
        token: newAccessToken,
        refreshToken, // Return same refresh token
        faculty,
        debug: {
          type: 'TOKEN_REFRESHED',
          timestamp: new Date().toISOString()
        }
      };
    },

    // ═══════════════════════════════════════════════════════════════════════
    // LOGOUT - Delete refresh token
    // ═══════════════════════════════════════════════════════════════════════
    logout: async (_, { refreshToken }) => {
      await deleteRefreshToken(refreshToken);
      console.log(`👋 User logged out`);
      return 'Logged out successfully';
    },

    // ── Student CRUD (all require auth) ───────────────────────────────────

    createUser: async (_, { name, email }, context) => {
      requireAuth(context);
      const { rows } = await db.query(
        `INSERT INTO users (name, email, english, tamil, maths, total, english_status, tamil_status, maths_status, faculty_id)
         VALUES ($1, $2, 0, 0, 0, 0, $3, $3, $3, $4) RETURNING *`,
        [name, email, 'Fail', context.facultyId]
      );
      return mapStudent(rows[0]);
    },

    updateUser: async (_, { id, name, email }, context) => {
      requireAuth(context);
      const updates = [];
      const values = [];

      if (name) { values.push(name); updates.push(`name = $${values.length}`); }
      if (email) { values.push(email); updates.push(`email = $${values.length}`); }

      values.push(id);
      values.push(context.facultyId);

      const { rows } = await db.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length - 1} AND faculty_id = $${values.length} RETURNING *`,
        values
      );
      if (!rows[0]) throw new GraphQLError('Student not found or unauthorized.');
      return mapStudent(rows[0]);
    },

    updateMarks: async (_, { id, english, tamil, maths }, context) => {
      requireAuth(context);
      if (english < 0 || english > 100) throw new GraphQLError('English marks must be between 0 and 100');
      if (tamil < 0 || tamil > 100) throw new GraphQLError('Tamil marks must be between 0 and 100');
      if (maths < 0 || maths > 100) throw new GraphQLError('Maths marks must be between 0 and 100');

      const total = english + tamil + maths;
      const englishStatus = getStatus(english);
      const tamilStatus = getStatus(tamil);
      const mathsStatus = getStatus(maths);

      const { rows } = await db.query(
        `UPDATE users SET english = $1, tamil = $2, maths = $3, total = $4,
         english_status = $5, tamil_status = $6, maths_status = $7
         WHERE id = $8 AND faculty_id = $9 RETURNING *`,
        [english, tamil, maths, total, englishStatus, tamilStatus, mathsStatus, id, context.facultyId]
      );
      if (!rows[0]) throw new GraphQLError('Student not found or unauthorized.');
      return mapStudent(rows[0]);
    },

    deleteUser: async (_, { id }, context) => {
      requireAuth(context);
      const result = await db.query(
        'DELETE FROM users WHERE id = $1 AND faculty_id = $2',
        [id, context.facultyId]
      );
      if (result.rowCount === 0) throw new GraphQLError('Student not found or unauthorized.');
      return `Student with id ${id} deleted successfully`;
    },

    // ── Document Mutations ─────────────────────────────────────────────────

    deleteDocument: async (_, { id }, context) => {
      requireAuth(context);
      
      // First check if document belongs to this faculty
      const { rows } = await db.query(
        'SELECT * FROM documents WHERE id = $1 AND faculty_id = $2',
        [id, context.facultyId]
      );
      
      if (rows.length === 0) {
        throw new GraphQLError('Document not found or unauthorized.');
      }

      const document = rows[0];
      
      // Delete file from filesystem
      try {
        fs.unlinkSync(document.file_path);
      } catch (err) {
        console.warn('Could not delete file from filesystem:', err.message);
      }

      // Delete from database
      await db.query('DELETE FROM documents WHERE id = $1', [id]);
      
      return `Document '${document.original_name}' deleted successfully`;
    },

    updateDocumentDescription: async (_, { id, description }, context) => {
      requireAuth(context);
      
      const { rows } = await db.query(
        'UPDATE documents SET description = $1 WHERE id = $2 AND faculty_id = $3 RETURNING *',
        [description, id, context.facultyId]
      );
      
      if (rows.length === 0) {
        throw new GraphQLError('Document not found or unauthorized.');
      }
      
      return mapDocument(rows[0]);
    }
  }
};

module.exports = resolvers;
