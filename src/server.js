const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
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

  // ════════════════════════════════════════════════════════════════════════
  // RATE LIMITING CONFIGURATION
  // ════════════════════════════════════════════════════════════════════════
  // Rate limiting prevents API abuse by limiting requests from each IP address
  
  // Strict limit for auth endpoints (login/signup) - prevent brute force attacks
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes window
    max: 5, // Max 5 requests per 15 minutes per IP
    message: {
      error: 'Too many attempts',
      message: 'Too many login/signup attempts. Please try again after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      console.log(`🚫 IP Rate limit hit for IP ${req.ip} on auth endpoint`);
      res.status(options.statusCode).json(options.message);
    }
  });

  // Account-based limit for login - tracks by email to prevent brute force on same account
  const accountLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes window
    max: 3, // Max 3 login attempts per account per 5 minutes
    keyGenerator: (req) => {
      // Use email from request body as the key
      const email = req.body?.email || 'unknown';
      return email.toLowerCase().trim();
    },
    message: {
      error: 'Account temporarily locked',
      message: 'Too many failed login attempts for this account. Please try again after 5 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      const email = req.body?.email || 'unknown';
      console.log(`🚫 Account Rate limit hit for account: ${email}`);
      res.status(options.statusCode).json(options.message);
    }
  });

  // Moderate limit for file uploads - prevent storage abuse
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: 20, // Max 20 uploads per hour per IP
    message: {
      error: 'Upload limit exceeded',
      message: 'Too many file uploads. Please try again after an hour.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // General API limit for other endpoints
  const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 100, // Max 100 requests per minute per IP
    message: {
      error: 'Too many requests',
      message: 'API rate limit exceeded. Please slow down.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply general rate limiting to all requests
  app.use(generalLimiter);

  // Parse JSON bodies for API requests
  app.use(bodyParser.json());

  // ════════════════════════════════════════════════════════════════════════
  // END RATE LIMITING CONFIGURATION
  // ════════════════════════════════════════════════════════════════════════

  // Ensure uploads folder exists
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`📁 Created uploads folder: ${uploadsDir}`);
  } else {
    console.log(`📁 Uploads folder ready: ${uploadsDir}`);
  }

  // Multer configuration for file uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({ 
    storage: storage,
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
      // Accept all file types for now, you can add restrictions here
      cb(null, true);
    }
  });

  // File upload endpoint with error handling (rate limited)
  app.post('/api/upload', uploadLimiter, (req, res) => {
    console.log('Upload endpoint called:', req.headers['content-type']);
    
    upload.single('file')(req, res, (err) => {
      console.log('Multer callback executed');
      
      if (err instanceof multer.MulterError) {
        console.error('Multer error:', err);
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        console.error('Upload error:', err);
        return res.status(500).json({ error: `Upload failed: ${err.message}` });
      }

      if (!req.file) {
        console.log('No file in req.file');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const fileInfo = {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: req.file.path,
        uploadDate: new Date().toISOString()
      };

      console.log('File saved:', fileInfo);

      res.status(200).json({ 
        message: 'File uploaded successfully',
        file: fileInfo
      });
    });
  });

  // ── REST auth routes (no GraphQL required) ──────────────────────────────
  // POST   /api/auth/signup  — Register a new faculty member (rate limited by IP)
  // POST   /api/auth/login   — Authenticate and receive a JWT (rate limited by IP + by account)
  // GET    /api/auth/me      — Protected: returns faculty profile (rate limited by IP)
  
  // Apply account-based limiter to login specifically (tracks by email)
  app.use('/api/auth/login', accountLimiter);
  
  // Apply IP-based limiter to all auth routes
  app.use('/api/auth', authLimiter, restAuthRouter);

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
    res.json({ 
      status: 'ok', 
      message: 'Server is running', 
      endpoints: {
        graphql : '/graphql',
        login   : 'POST /api/auth/login',
        signup  : 'POST /api/auth/signup',
        me      : 'GET  /api/auth/me  (requires Bearer token)',
        upload  : 'POST /api/upload  (multipart/form-data with file field)',
      },
      rateLimits: {
        auth: '5 requests per 15 minutes per IP',
        account: '3 login attempts per 5 minutes per email',
        upload: '20 uploads per hour',
        general: '100 requests per minute'
      }
    });
  });

  app.listen(PORT, () => {
    console.log(`🚀 GraphQL  → http://localhost:${PORT}/graphql`);
    console.log(`🔐 REST Auth→ http://localhost:${PORT}/api/auth/login | /signup | /me`);
    console.log(`⏱️  Rate Limits: Auth=5/15min per IP, Account=3/5min per email, Upload=20/hr, General=100/min`);
  });
}

startServer();
