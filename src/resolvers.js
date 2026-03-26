const db = require('./db');

const getStatus = (marks) => marks >= 40 ? 'Pass' : 'Fail';

const resolvers = {
  Query: {
    users: async () => {
      const { rows } = await db.query('SELECT * FROM users ORDER BY id ASC');
      return rows.map(row => ({
        ...row,
        englishStatus: row.english_status,
        tamilStatus: row.tamil_status,
        mathsStatus: row.maths_status
      }));
    },

    user: async (_, { id }) => {
      const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
      if (rows[0]) {
        return {
          ...rows[0],
          englishStatus: rows[0].english_status,
          tamilStatus: rows[0].tamil_status,
          mathsStatus: rows[0].maths_status
        };
      }
      return null;
    }
  },

  Mutation: {
    createUser: async (_, { name, email }) => {
      const { rows } = await db.query(
        'INSERT INTO users (name, email, english, tamil, maths, total, english_status, tamil_status, maths_status) VALUES ($1, $2, 0, 0, 0, 0, $3, $3, $3) RETURNING *',
        [name, email, 'Fail']
      );
      return {
        ...rows[0],
        englishStatus: rows[0].english_status,
        tamilStatus: rows[0].tamil_status,
        mathsStatus: rows[0].maths_status
      };
    },

    updateUser: async (_, { id, name, email }) => {
      const updates = [];
      const values = [];

      if (name) {
        values.push(name);
        updates.push(`name = $${values.length}`);
      }
      if (email) {
        values.push(email);
        updates.push(`email = $${values.length}`);
      }

      values.push(id);

      const { rows } = await db.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values
      );
      return {
        ...rows[0],
        englishStatus: rows[0].english_status,
        tamilStatus: rows[0].tamil_status,
        mathsStatus: rows[0].maths_status
      };
    },

    updateMarks: async (_, { id, english, tamil, maths }) => {
      // Validate marks are between 0 and 100
      if (english < 0 || english > 100) {
        throw new Error('English marks must be between 0 and 100');
      }
      if (tamil < 0 || tamil > 100) {
        throw new Error('Tamil marks must be between 0 and 100');
      }
      if (maths < 0 || maths > 100) {
        throw new Error('Maths marks must be between 0 and 100');
      }

      const total = english + tamil + maths;
      const englishStatus = getStatus(english);
      const tamilStatus = getStatus(tamil);
      const mathsStatus = getStatus(maths);
      
      const { rows } = await db.query(
        `UPDATE users SET english = $1, tamil = $2, maths = $3, total = $4, english_status = $5, tamil_status = $6, maths_status = $7 WHERE id = $8 RETURNING *`,
        [english, tamil, maths, total, englishStatus, tamilStatus, mathsStatus, id]
      );
      return {
        ...rows[0],
        englishStatus: rows[0].english_status,
        tamilStatus: rows[0].tamil_status,
        mathsStatus: rows[0].maths_status
      };
    },

    deleteUser: async (_, { id }) => {
      await db.query('DELETE FROM users WHERE id = $1', [id]);
      return `User with id ${id} deleted successfully`;
    }
  }
};

module.exports = resolvers;
