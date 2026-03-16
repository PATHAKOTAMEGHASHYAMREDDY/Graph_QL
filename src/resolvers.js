const db = require('./db');

const resolvers = {
  Query: {
    users: async () => {
      const [rows] = await db.query('SELECT * FROM users');
      return rows;
    },

    user: async (_, { id }) => {
      const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      return rows[0];
    }
  },

  Mutation: {
    createUser: async (_, { name, email }) => {
      const [result] = await db.query(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        [name, email]
      );
      return { id: result.insertId, name, email };
    },

    updateUser: async (_, { id, name, email }) => {
      const updates = [];
      const values = [];
      
      if (name) {
        updates.push('name = ?');
        values.push(name);
      }
      if (email) {
        updates.push('email = ?');
        values.push(email);
      }
      
      values.push(id);
      
      await db.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
      
      const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      return rows[0];
    },

    deleteUser: async (_, { id }) => {
      await db.query('DELETE FROM users WHERE id = ?', [id]);
      return `User with id ${id} deleted successfully`;
    }
  }
};

module.exports = resolvers;
