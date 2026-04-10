const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
require('dotenv').config();
const typeDefs = require('./schema');
const resolvers = require('./resolvers');
const { verifyToken } = require('./auth');
const db = require('./db'); // Add database connection
const redisClient = require('./redis-client'); // Redis client for rate limiting

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
  // RATE LIMITING CONFIGURATION WITH REDIS
  // ════════════════════════════════════════════════════════════════════════
  // Rate limiting prevents API abuse by limiting requests from each IP address
  // Using Redis for distributed rate limiting and persistence across server restarts
  
  // Check if Redis is connected
  const isRedisConnected = redisClient.isOpen;
  console.log(`🔴 Redis Status: ${isRedisConnected ? 'Connected ✅' : 'Disconnected ⚠️ (using in-memory fallback)'}`);

  // Strict limit for auth endpoints (login/signup) - prevent brute force attacks
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes window
    max: 5, // Max 5 requests per 15 minutes per IP
    message: {
      error: 'Too many attempts',
      message: 'Too many login/signup attempts. Please try again after 15 minutes.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: isRedisConnected ? new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:auth:',
    }) : undefined,
    handler: (req, res) => {
      console.log(`🚫 IP Rate limit hit for IP ${req.ip} on auth endpoint`);
      res.status(429).json({
        error: 'Too many attempts',
        message: 'Too many login/signup attempts. Please try again after 15 minutes.',
        retryAfter: '15 minutes'
      });
    }
  });

  // Account-based limit for login - tracks by email to prevent brute force on same account
  const accountLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes window
    max: 3, // Max 3 login attempts per account per 5 minutes
    keyGenerator: (req) => {
      // Use email from request body as the key
      const email = req.body?.email || 'unknown';
      return `${email.toLowerCase().trim()}`;
    },
    message: {
      error: 'Account temporarily locked',
      message: 'Too many failed login attempts for this account. Please try again after 5 minutes.',
      retryAfter: '5 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: isRedisConnected ? new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:account:',
    }) : undefined,
    handler: (req, res) => {
      const email = req.body?.email || 'unknown';
      console.log(`🚫 Account Rate limit hit for account: ${email}`);
      res.status(429).json({
        error: 'Account temporarily locked',
        message: 'Too many failed login attempts for this account. Please try again after 5 minutes.',
        retryAfter: '5 minutes'
      });
    }
  });

  // Moderate limit for file uploads - prevent storage abuse
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: 20, // Max 20 uploads per hour per IP
    message: {
      error: 'Upload limit exceeded',
      message: 'Too many file uploads. Please try again after an hour.',
      retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: isRedisConnected ? new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:upload:',
    }) : undefined,
  });

  // General API limit for other endpoints
  const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 100, // Max 100 requests per minute per IP
    message: {
      error: 'Too many requests',
      message: 'API rate limit exceeded. Please slow down.',
      retryAfter: '1 minute'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: isRedisConnected ? new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:general:',
    }) : undefined,
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

  // File upload endpoint with error handling (rate limited + authenticated)
  app.post('/api/upload', uploadLimiter, (req, res) => {
    console.log('📤 Upload endpoint hit');
    
    // Verify JWT token first
    const authHeader = req.headers.authorization || '';
    console.log('Auth header present:', authHeader ? 'Yes' : 'No');
    
    let facultyId = null;
    
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      console.log('Token extracted, verifying...');
      const decoded = verifyToken(token);
      console.log('Decoded token:', decoded);
      if (decoded && decoded.facultyId) {
        facultyId = decoded.facultyId;
      }
    }
    
    console.log('Faculty ID:', facultyId);
    
    if (!facultyId) {
      console.log('❌ No faculty ID - rejecting upload');
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    
    upload.single('file')(req, res, async (err) => {
      console.log('Multer processing complete');
      
      if (err instanceof multer.MulterError) {
        console.error('Multer error:', err);
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        console.error('Upload error:', err);
        return res.status(500).json({ error: `Upload failed: ${err.message}` });
      }

      if (!req.file) {
        console.log('❌ No file in request');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log('File received:', req.file.originalname);
      console.log('Attempting database insert...');

      try {
        // Save file metadata to database
        const result = await db.query(
          `INSERT INTO documents (faculty_id, filename, original_name, file_path, file_size, mime_type)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            facultyId,
            req.file.filename,
            req.file.originalname,
            req.file.path,
            req.file.size,
            req.file.mimetype
          ]
        );

        const document = result.rows[0];
        console.log(`✅ File saved to DB with ID: ${document.id}`);

        res.status(200).json({ 
          message: 'File uploaded successfully',
          document: {
            id: document.id,
            filename: document.filename,
            originalName: document.original_name,
            size: document.file_size,
            mimeType: document.mime_type,
            uploadDate: document.upload_date,
            facultyId: document.faculty_id
          }
        });
      } catch (dbError) {
        console.error('❌ Database error:', dbError.message);
        console.error('Full error:', dbError);
        // Delete the file if DB insert fails
        fs.unlink(req.file.path, (unlinkErr) => {
          if (unlinkErr) console.error('Failed to delete file:', unlinkErr);
        });
        res.status(500).json({ error: 'Failed to save file metadata', details: dbError.message });
      }
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
      redis: {
        connected: redisClient.isOpen,
        status: redisClient.isOpen ? 'Connected ✅' : 'Disconnected (using in-memory fallback)'
      },
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
        general: '100 requests per minute',
        storage: redisClient.isOpen ? 'Redis (persistent)' : 'In-Memory (resets on restart)'
      }
    });
  });

  app.listen(PORT, () => {
    console.log(`🚀 GraphQL  → http://localhost:${PORT}/graphql`);
    console.log(`🔐 REST Auth→ http://localhost:${PORT}/api/auth/login | /signup | /me`);
    console.log(`🔴 Redis    → ${redisClient.isOpen ? 'Connected ✅' : 'Disconnected ⚠️ (using in-memory fallback)'}`);
    console.log(`⏱️  Rate Limits: Auth=5/15min per IP, Account=3/5min per email, Upload=20/hr, General=100/min`);
  });
}

startServer();
