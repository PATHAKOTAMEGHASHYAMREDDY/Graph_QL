const db = require('./db');

const resolvers = {
  Query: {
    users: async () => {
      const { rows } = await db.query('SELECT * FROM users ORDER BY id ASC');
      return rows;
    },

    user: async (_, { id }) => {
      const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
      return rows[0];
    }
  },

  Mutation: {
    createUser: async (_, { name, email }) => {
      const { rows } = await db.query(
        'INSERT INTO users (name, email, english, tamil, maths, total) VALUES ($1, $2, 0, 0, 0, 0) RETURNING *',
        [name, email]
      );
      return rows[0];
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
      return rows[0];
    },

    updateMarks: async (_, { id, english, tamil, maths }) => {
      const total = english + tamil + maths;
      const { rows } = await db.query(
        `UPDATE users SET english = $1, tamil = $2, maths = $3, total = $4 WHERE id = $5 RETURNING *`,
        [english, tamil, maths, total, id]
      );
      return rows[0];
    },

    deleteUser: async (_, { id }) => {
      await db.query('DELETE FROM users WHERE id = $1', [id]);
      return `User with id ${id} deleted successfully`;
    }
  }
};

module.exports = resolvers;
