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
        'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
        [name, email]
      );
      return rows[0];
    },

    updateUser: async (_, { id, name, email }) => {
      const updates = [];
      const values = [];

      if (name) {
        updates.push(`name = $${values.length + 1}`);
        values.push(name);
      }
      if (email) {
        updates.push(`email = $${values.length + 1}`);
        values.push(email);
      }

      values.push(id);

      const { rows } = await db.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
        values
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
