const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const typeDefs = require('./schema');
const resolvers = require('./resolvers');
const { verifyToken } = require('./auth');

// REST auth router (POST /api/auth/login, /signup; GET /api/auth/me)
const restAuthRouter = require('./rest-auth');

const app = express();
const PORT = process.env.PORT || 4000;

const server = new ApolloServer({
  typeDefs,
  resolvers
});

async function startServer() {
  await server.start();

  // CORS configuration
  const allowedOrigins = [
    'http://localhost:4200',
    'http://localhost:3000',
    process.env.FRONTEND_URL
  ].filter(Boolean).map(o => o.trim());

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }));

  app.use(bodyParser.json());

  // ── REST auth routes (no GraphQL required) ──────────────────────────────
  // POST   /api/auth/signup  — Register a new faculty member
  // POST   /api/auth/login   — Authenticate and receive a JWT (returns 401 on failure)
  // GET    /api/auth/me      — Protected: returns faculty profile (returns 401 if token invalid)
  app.use('/api/auth', restAuthRouter);

  // ── GraphQL endpoint ────────────────────────────────────────────────────
  app.use('/graphql', expressMiddleware(server, {
    // Extract JWT from Authorization header and pass facultyId in context
    context: async ({ req }) => {
      const authHeader = req.headers.authorization || '';
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const decoded = verifyToken(token);
        if (decoded && decoded.facultyId) {
          return { facultyId: decoded.facultyId, email: decoded.email };
        }
      }
      return { facultyId: null, email: null };
    }
  }));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running', endpoints: {
      graphql : '/graphql',
      login   : 'POST /api/auth/login',
      signup  : 'POST /api/auth/signup',
      me      : 'GET  /api/auth/me  (requires Bearer token)',
    }});
  });

  app.listen(PORT, () => {
    console.log(`🚀 GraphQL  → http://localhost:${PORT}/graphql`);
    console.log(`🔐 REST Auth→ http://localhost:${PORT}/api/auth/login | /signup | /me`);
  });
}

startServer();
