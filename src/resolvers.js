const db = require('./db');
const { generateOtp, sendOtpEmail, signAccessToken, signRefreshToken, verifyToken, verifyTokenWithError, hashPassword, comparePassword } = require('./auth');
const { GraphQLError } = require('graphql');
const { 
  getUserRoleAndPermissions, 
  hasPermission, 
  requirePermission,
  getUserRole 
} = require('./rbac');

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
    mathsStatus: row.maths_status,
    roleId: row.role_id
  };
}

// Helper: map DB row to Faculty shape
function mapFaculty(row) {
  return {
    ...row,
    classSection: row.class_section,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
    roleId: row.role_id
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// REFRESH TOKEN HELPERS - FACULTY
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

// ═══════════════════════════════════════════════════════════════════════════
// REFRESH TOKEN HELPERS - STUDENTS
// ═══════════════════════════════════════════════════════════════════════════

// Save student refresh token to database
async function saveStudentRefreshToken(studentId, refreshToken, userAgent = null, ipAddress = null) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await db.query(
    `INSERT INTO student_refresh_tokens (student_id, token, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [studentId, refreshToken, expiresAt, userAgent, ipAddress]
  );
}

// Verify student refresh token exists and is valid
async function verifyStudentRefreshToken(refreshToken) {
  const { rows } = await db.query(
    `SELECT * FROM student_refresh_tokens 
     WHERE token = $1 AND expires_at > NOW()`,
    [refreshToken]
  );
  
  if (rows.length === 0) {
    return null;
  }
  
  // Update last_used_at
  await db.query(
    `UPDATE student_refresh_tokens SET last_used_at = NOW() WHERE token = $1`,
    [refreshToken]
  );
  
  return rows[0];
}

// Delete student refresh token (logout)
async function deleteStudentRefreshToken(refreshToken) {
  await db.query(
    `DELETE FROM student_refresh_tokens WHERE token = $1`,
    [refreshToken]
  );
}

// Delete all student refresh tokens (logout all devices)
async function deleteAllStudentRefreshTokens(studentId) {
  await db.query(
    `DELETE FROM student_refresh_tokens WHERE student_id = $1`,
    [studentId]
  );
}

// Clean up expired student tokens
async function cleanupExpiredStudentTokens() {
  const result = await db.query(
    `DELETE FROM student_refresh_tokens WHERE expires_at < NOW()`
  );
  return result.rowCount;
}

const resolvers = {
  Query: {
    // Only returns students belonging to this faculty's section
    users: async (_, __, context) => {
      requireAuth(context);
      
      // Check permission
      const userType = context.userType || 'faculty';
      const userId = context.facultyId || context.studentId;
      await requirePermission(userId, userType, 'students.read');
      
      // Get faculty's section
      const { rows: facultyRows } = await db.query(
        'SELECT class_section FROM faculty WHERE id = $1',
        [context.facultyId]
      );
      
      if (facultyRows.length === 0) {
        throw new GraphQLError('Faculty not found.');
      }
      
      const facultySection = facultyRows[0].class_section;
      
      // Get students from same section
      const { rows } = await db.query(
        'SELECT * FROM users WHERE section = $1 ORDER BY id ASC',
        [facultySection]
      );
      return rows.map(mapStudent);
    },

    // New paginated query with search and backend validation
    paginatedUsers: async (_, { page = 1, pageSize = 5, search = '', sortBy = 'id', sortOrder = 'ASC' }, context) => {
      requireAuth(context);
      
      // Check permission
      const userType = context.userType || 'faculty';
      const userId = context.facultyId || context.studentId;
      await requirePermission(userId, userType, 'students.read');

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

      // Get faculty's section
      const { rows: facultyRows } = await db.query(
        'SELECT class_section FROM faculty WHERE id = $1',
        [context.facultyId]
      );
      
      if (facultyRows.length === 0) {
        throw new GraphQLError('Faculty not found.');
      }
      
      const facultySection = facultyRows[0].class_section;

      // Build search query - filter by section
      let query = 'SELECT * FROM users WHERE section = $1';
      let countQuery = 'SELECT COUNT(*) FROM users WHERE section = $1';
      const params = [facultySection];
      
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
      const { rows } = await db.query(
        `SELECT f.*, r.name as role_name, r.description as role_description
         FROM faculty f
         LEFT JOIN roles r ON f.role_id = r.id
         WHERE f.id = $1`,
        [context.facultyId]
      );
      if (!rows[0]) return null;
      
      const faculty = mapFaculty(rows[0]);
      return faculty;
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
    },

    // ── Student Queries ────────────────────────────────────────────────────
    
    myProfile: async (_, __, context) => {
      if (!context.studentId) {
        throw new GraphQLError('Not authenticated as student. Please log in.', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }
      const { rows } = await db.query(
        `SELECT u.*, r.name as role_name
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1`,
        [context.studentId]
      );
      return rows[0] ? mapStudent(rows[0]) : null;
    },

    // ── RBAC Queries ───────────────────────────────────────────────────────
    
    myPermissions: async (_, __, context) => {
      if (!context.facultyId && !context.studentId) {
        throw new GraphQLError('Not authenticated. Please log in.', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }
      
      const userId = context.facultyId || context.studentId;
      const userType = context.userType || 'faculty';
      
      const { permissions } = await getUserRoleAndPermissions(userId, userType);
      return permissions;
    },

    myRole: async (_, __, context) => {
      if (!context.facultyId && !context.studentId) {
        throw new GraphQLError('Not authenticated. Please log in.', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }
      
      const userId = context.facultyId || context.studentId;
      const userType = context.userType || 'faculty';
      
      const { roleId, roleName } = await getUserRoleAndPermissions(userId, userType);
      
      if (!roleId) return null;
      
      const { rows } = await db.query(
        'SELECT * FROM roles WHERE id = $1',
        [roleId]
      );
      
      return rows[0] || null;
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

    verifyOtpAndRegister: async (_, { name, email, otp, password, section }) => {
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

      // Validate section format (S01-S08)
      const validSections = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08'];
      if (!validSections.includes(section)) {
        throw new GraphQLError('Invalid section. Please select a section from S01 to S08.');
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

      // Get admin role ID
      const roleResult = await db.query('SELECT id FROM roles WHERE name = $1', ['admin']);
      const roleId = roleResult.rows[0]?.id || 1;

      const { rows: facultyRows } = await db.query(
        `INSERT INTO faculty (name, email, password_hash, class_section, role_id, section) VALUES ($1, $2, $3, $4, $5, $4) RETURNING *`,
        [name, email, passwordHash, section, roleId]
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

    // ═══════════════════════════════════════════════════════════════════════
    // STUDENT AUTHENTICATION
    // ═══════════════════════════════════════════════════════════════════════

    sendStudentOtp: async (_, { email }) => {
      // Check if email already registered
      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        throw new GraphQLError('An account with this email already exists. Please log in.');
      }

      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Upsert OTP record (reuse same otp_store table)
      await db.query(
        `INSERT INTO otp_store (email, otp, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET otp = $2, expires_at = $3`,
        [email, otp, expiresAt]
      );

      await sendOtpEmail(email, otp);
      return 'OTP sent successfully to ' + email;
    },

    verifyStudentOtpAndRegister: async (_, { name, email, otp, password, section }) => {
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

      // Validate password format (SHA-256 hash from frontend)
      if (!password || !/^[0-9a-f]{64}$/.test(password)) {
        throw new GraphQLError('Invalid password format received from client.');
      }

      // Validate section
      const validSections = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08'];
      if (!validSections.includes(section)) {
        throw new GraphQLError('Invalid section. Please select a valid section (S01-S08).');
      }

      // Check if already registered (race condition guard)
      const alreadyExists = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (alreadyExists.rows.length > 0) {
        throw new GraphQLError('Account already exists. Please log in.');
      }

      // Hash the password
      const passwordHash = await hashPassword(password);

      // Create student account with section
      const { rows: studentRows } = await db.query(
        `INSERT INTO users (name, email, password_hash, section, english, tamil, maths, total, english_status, tamil_status, maths_status, faculty_id, role_id)
         VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 'Fail', 'Fail', 'Fail', NULL, 3) RETURNING *`,
        [name, email, passwordHash, section]
      );

      // Clean up OTP
      await db.query('DELETE FROM otp_store WHERE email = $1', [email]);

      const student = mapStudent(studentRows[0]);
      
      // Generate tokens
      const accessToken = signAccessToken({ studentId: student.id, email: student.email });
      const refreshToken = signRefreshToken({ studentId: student.id, email: student.email });
      
      // Save refresh token
      await saveStudentRefreshToken(student.id, refreshToken);

      console.log(`✅ Student registered via OTP: ${email} (Section: ${section})`);

      return { 
        token: accessToken, 
        refreshToken, 
        student,
        debug: {
          type: 'REGISTRATION_SUCCESS',
          timestamp: new Date().toISOString()
        }
      };
    },

    registerStudent: async (_, { name, email, password }) => {
      // Validate password format (should be SHA-256 hash from frontend)
      if (!password || !/^[0-9a-f]{64}$/.test(password)) {
        throw new GraphQLError('Invalid password format received from client.');
      }

      // Check if email already exists
      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        throw new GraphQLError('An account with this email already exists. Please log in.');
      }

      // Hash the password
      const passwordHash = await hashPassword(password);

      // Create student account
      const { rows } = await db.query(
        `INSERT INTO users (name, email, password_hash, english, tamil, maths, total, english_status, tamil_status, maths_status, faculty_id)
         VALUES ($1, $2, $3, 0, 0, 0, 0, 'Fail', 'Fail', 'Fail', NULL) RETURNING *`,
        [name, email, passwordHash]
      );

      const student = mapStudent(rows[0]);
      
      // Generate tokens
      const accessToken = signAccessToken({ studentId: student.id, email: student.email });
      const refreshToken = signRefreshToken({ studentId: student.id, email: student.email });
      
      // Save refresh token
      await saveStudentRefreshToken(student.id, refreshToken);

      console.log(`✅ Student registered: ${email}`);

      return { 
        token: accessToken, 
        refreshToken, 
        student,
        debug: {
          type: 'REGISTRATION_SUCCESS',
          timestamp: new Date().toISOString()
        }
      };
    },

    loginStudent: async (_, { email, password }) => {
      // Check rate limit
      const rateLimitCheck = checkRateLimit(email);
      
      if (!rateLimitCheck.allowed) {
        console.log(`🚫 Rate limit blocked student login for ${email}. Wait ${rateLimitCheck.waitMinutes} minutes.`);
        throw new GraphQLError(rateLimitCheck.message, {
          extensions: { 
            code: 'RATE_LIMITED',
            http: { status: 429 },
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

      const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
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

      const student = rows[0];
      
      // Check if password_hash exists
      if (!student.password_hash) {
        recordFailedAttempt(email);
        throw new GraphQLError('This account does not have a password set. Please contact your teacher.', {
          extensions: {
            code: 'NO_PASSWORD',
            debug: {
              type: 'LOGIN_FAILED',
              reason: 'No password set',
              timestamp: new Date().toISOString()
            }
          }
        });
      }

      const valid = await comparePassword(password, student.password_hash);
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
      console.log(`✅ Successful student login for ${email}`);

      const studentData = mapStudent(student);
      
      // Generate tokens
      const accessToken = signAccessToken({ studentId: student.id, email: student.email });
      const refreshToken = signRefreshToken({ studentId: student.id, email: student.email });
      
      // Save refresh token
      await saveStudentRefreshToken(student.id, refreshToken);

      return { 
        token: accessToken,
        refreshToken,
        student: studentData,
        debug: {
          type: 'LOGIN_SUCCESS',
          remainingAttempts: MAX_ATTEMPTS,
          timestamp: new Date().toISOString()
        }
      };
    },

    refreshStudentAccessToken: async (_, { refreshToken }) => {
      // Verify refresh token in database
      const tokenRecord = await verifyStudentRefreshToken(refreshToken);
      
      if (!tokenRecord) {
        throw new GraphQLError('Invalid or expired refresh token. Please log in again.', {
          extensions: { code: 'INVALID_REFRESH_TOKEN' }
        });
      }
      
      // Verify JWT signature
      const decoded = verifyToken(refreshToken);
      if (!decoded || !decoded.studentId) {
        throw new GraphQLError('Invalid refresh token. Please log in again.', {
          extensions: { code: 'INVALID_REFRESH_TOKEN' }
        });
      }
      
      // Get student data
      const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [decoded.studentId]);
      if (rows.length === 0) {
        throw new GraphQLError('Student not found.', {
          extensions: { code: 'USER_NOT_FOUND' }
        });
      }
      
      const student = mapStudent(rows[0]);
      
      // Generate new access token
      const newAccessToken = signAccessToken({ studentId: student.id, email: student.email });
      
      console.log(`🔄 Student access token refreshed for ${student.email}`);
      
      return {
        token: newAccessToken,
        refreshToken, // Return same refresh token
        student,
        debug: {
          type: 'TOKEN_REFRESHED',
          timestamp: new Date().toISOString()
        }
      };
    },

    logoutStudent: async (_, { refreshToken }) => {
      await deleteStudentRefreshToken(refreshToken);
      console.log(`👋 Student logged out`);
      return 'Logged out successfully';
    },

    // ── Student CRUD (all require auth) ───────────────────────────────────

    createUser: async (_, { name, email }, context) => {
      requireAuth(context);
      
      // Check permission
      const userType = context.userType || 'faculty';
      const userId = context.facultyId || context.studentId;
      await requirePermission(userId, userType, 'students.create');
      
      // Get faculty's section
      const { rows: facultyRows } = await db.query(
        'SELECT class_section FROM faculty WHERE id = $1',
        [context.facultyId]
      );
      
      if (facultyRows.length === 0) {
        throw new GraphQLError('Faculty not found.');
      }
      
      const facultySection = facultyRows[0].class_section;
      
      const { rows } = await db.query(
        `INSERT INTO users (name, email, section, english, tamil, maths, total, english_status, tamil_status, maths_status, faculty_id, role_id)
         VALUES ($1, $2, $3, 0, 0, 0, 0, $4, $4, $4, $5, 3) RETURNING *`,
        [name, email, facultySection, 'Fail', context.facultyId]
      );
      return mapStudent(rows[0]);
    },

    updateUser: async (_, { id, name, email }, context) => {
      requireAuth(context);
      
      // Check permission
      const userType = context.userType || 'faculty';
      const userId = context.facultyId || context.studentId;
      await requirePermission(userId, userType, 'students.update');
      
      // Faculty can only update name, not email
      if (email) {
        throw new GraphQLError('Faculty cannot update student email. Only name can be updated.');
      }
      
      if (!name) {
        throw new GraphQLError('Name is required for update.');
      }

      const { rows } = await db.query(
        `UPDATE users SET name = $1 WHERE id = $2 RETURNING *`,
        [name, id]
      );
      
      if (!rows[0]) throw new GraphQLError('Student not found.');
      
      const updatedStudent = mapStudent(rows[0]);
      
      // Send real-time update to student via WebSocket
      const { notifyStudentMarksUpdate } = require('./websocket');
      const notified = notifyStudentMarksUpdate(id, updatedStudent);
      
      if (notified) {
        console.log(`✅ Real-time name update sent to student ${id}`);
      } else {
        console.log(`ℹ️  Student ${id} not connected to WebSocket`);
      }
      
      return updatedStudent;
    },

    updateMarks: async (_, { id, english, tamil, maths }, context) => {
      requireAuth(context);
      
      // Check permission
      const userType = context.userType || 'faculty';
      const userId = context.facultyId || context.studentId;
      await requirePermission(userId, userType, 'marks.update');
      
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
         WHERE id = $8 RETURNING *`,
        [english, tamil, maths, total, englishStatus, tamilStatus, mathsStatus, id]
      );
      
      if (!rows[0]) throw new GraphQLError('Student not found or unauthorized.');
      
      const updatedStudent = mapStudent(rows[0]);
      
      // Send real-time update to student via WebSocket
      const { notifyStudentMarksUpdate } = require('./websocket');
      const notified = notifyStudentMarksUpdate(id, updatedStudent);
      
      if (notified) {
        console.log(`✅ Real-time marks update sent to student ${id}`);
      } else {
        console.log(`ℹ️  Student ${id} not connected to WebSocket`);
      }
      
      return updatedStudent;
    },

    deleteUser: async (_, { id }, context) => {
      requireAuth(context);
      
      // Check permission
      const userType = context.userType || 'faculty';
      const userId = context.facultyId || context.studentId;
      await requirePermission(userId, userType, 'students.delete');
      
      // Get faculty's section
      const { rows: facultyRows } = await db.query(
        'SELECT section FROM faculty WHERE id = $1',
        [context.facultyId]
      );
      
      if (facultyRows.length === 0) {
        throw new GraphQLError('Faculty not found.');
      }
      
      const facultySection = facultyRows[0].section;
      
      // Check if student exists and is in the same section
      const { rows: studentRows } = await db.query(
        'SELECT id, name, email FROM users WHERE id = $1 AND section = $2',
        [id, facultySection]
      );
      
      if (studentRows.length === 0) {
        throw new GraphQLError('Student not found or unauthorized.');
      }
      
      const student = studentRows[0];
      console.log(`🗑️  Deleting student: ${student.name} (${student.email})`);
      
      // Delete all refresh tokens for this student (logs them out)
      await deleteAllStudentRefreshTokens(id);
      console.log(`✅ Deleted all refresh tokens for student ${id}`);
      
      // Send WebSocket notification to kick student out
      const { notifyStudentMarksUpdate } = require('./websocket');
      notifyStudentMarksUpdate(id, {
        type: 'account_deleted',
        message: 'Your account has been deleted by faculty'
      });
      
      // Delete the student record
      const result = await db.query(
        'DELETE FROM users WHERE id = $1',
        [id]
      );
      
      console.log(`✅ Student ${student.name} deleted successfully`);
      return `Student ${student.name} deleted successfully`;
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
  },

  // ── Type Resolvers ─────────────────────────────────────────────────────────

  Faculty: {
    role: async (parent) => {
      if (!parent.roleId && !parent.role_id) return null;
      
      const roleId = parent.roleId || parent.role_id;
      const { rows } = await db.query('SELECT * FROM roles WHERE id = $1', [roleId]);
      return rows[0] || null;
    }
  },

  User: {
    role: async (parent) => {
      if (!parent.roleId && !parent.role_id) return null;
      
      const roleId = parent.roleId || parent.role_id;
      const { rows } = await db.query('SELECT * FROM roles WHERE id = $1', [roleId]);
      return rows[0] || null;
    }
  },

  Role: {
    permissions: async (parent) => {
      const { rows } = await db.query(
        `SELECT p.* FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         WHERE rp.role_id = $1`,
        [parent.id]
      );
      return rows;
    }
  }
};

module.exports = resolvers;
