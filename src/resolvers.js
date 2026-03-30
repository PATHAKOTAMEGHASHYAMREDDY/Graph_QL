const db = require('./db');
const { generateOtp, sendOtpEmail, signToken, verifyToken, hashPassword, comparePassword } = require('./auth');
const { GraphQLError } = require('graphql');

const getStatus = (marks) => marks >= 40 ? 'Pass' : 'Fail';

// Helper: throw if not authenticated
function requireAuth(context) {
  if (!context.facultyId) {
    throw new GraphQLError('Not authenticated. Please log in.', {
      extensions: { code: 'UNAUTHENTICATED' }
    });
  }
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

      if (!password || password.length < 6) {
        throw new GraphQLError('Password must be at least 6 characters.');
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
      const token = signToken({ facultyId: faculty.id, email: faculty.email });

      return { token, faculty };
    },

    loginFaculty: async (_, { email, password }) => {
      const { rows } = await db.query('SELECT * FROM faculty WHERE email = $1', [email]);
      if (rows.length === 0) {
        throw new GraphQLError('No account found with this email.');
      }

      const faculty = rows[0];
      const valid = await comparePassword(password, faculty.password_hash);
      if (!valid) {
        throw new GraphQLError('Incorrect password. Please try again.');
      }

      const facultyData = {
        ...faculty,
        classSection: faculty.class_section,
        createdAt: faculty.created_at ? faculty.created_at.toISOString() : null
      };
      const token = signToken({ facultyId: faculty.id, email: faculty.email });

      return { token, faculty: facultyData };
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
    }
  }
};

module.exports = resolvers;
