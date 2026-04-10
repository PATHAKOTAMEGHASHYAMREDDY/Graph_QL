# Rate Limiting Implementation with Redis

This document explains the rate limiting implementation in the backend API using Redis for distributed and persistent rate limiting.

## 🎯 Overview

The backend implements **Redis-based rate limiting** to prevent API abuse and protect against:
- Brute force attacks on authentication endpoints
- Account takeover attempts
- Storage abuse through excessive file uploads
- General API abuse

## 🔴 Redis Setup

### Prerequisites
- Redis server installed and running on your machine
- Default connection: `127.0.0.1:6379`

### Starting Redis Server

**Windows:**
```bash
redis-server
```

**Verify Redis is running:**
```bash
redis-cli
127.0.0.1:6379> ping
PONG
127.0.0.1:6379> exit
```

### Environment Configuration

Add these variables to your `.env` file:

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_PASSWORD=your_password_if_needed
```

## 📊 Rate Limit Rules

### 1. Authentication Endpoints (IP-based)
- **Endpoints:** `/api/auth/login`, `/api/auth/signup`
- **Limit:** 5 requests per 15 minutes per IP
- **Purpose:** Prevent brute force attacks
- **Response:** 429 status with retry-after information

### 2. Account-based Login Limit
- **Endpoint:** `/api/auth/login`
- **Limit:** 3 attempts per 5 minutes per email address
- **Purpose:** Prevent account takeover attempts
- **Key:** Tracks by email address (case-insensitive)
- **Response:** 429 status with account lock message

### 3. File Upload Limit
- **Endpoint:** `/api/upload`
- **Limit:** 20 uploads per hour per IP
- **Purpose:** Prevent storage abuse
- **Response:** 429 status with retry information

### 4. General API Limit
- **Endpoints:** All API endpoints
- **Limit:** 100 requests per minute per IP
- **Purpose:** Prevent general API abuse
- **Response:** 429 status with rate limit message

## 🔧 Implementation Details

### Backend Structure

```
Graph_QL/
├── src/
│   ├── redis-client.js      # Redis connection and configuration
│   ├── server.js             # Rate limiting middleware setup
│   └── ...
├── .env                      # Environment variables (Redis config)
└── package.json              # Dependencies (redis, rate-limit-redis)
```

### Key Features

1. **Redis Store Integration**
   - Uses `rate-limit-redis` package for persistent rate limiting
   - Survives server restarts
   - Works across multiple server instances (distributed)

2. **Fallback Mechanism**
   - If Redis is unavailable, falls back to in-memory rate limiting
   - Logs Redis connection status on startup
   - No service interruption if Redis fails

3. **Response Headers**
   - `X-RateLimit-Limit`: Maximum requests allowed
   - `X-RateLimit-Remaining`: Remaining requests in current window
   - `X-RateLimit-Reset`: Time when the limit resets
   - `Retry-After`: Seconds to wait before retrying (on 429 errors)

### Rate Limit Response Format

When rate limit is exceeded (429 status):

```json
{
  "error": "Too many attempts",
  "message": "Too many login/signup attempts. Please try again after 15 minutes.",
  "retryAfter": "15 minutes"
}
```

## 🎨 Frontend Integration

### Error Handling

The frontend services (`auth.service.ts`, `graphql.service.ts`) handle rate limit errors:

```typescript
// Detects 429 status and shows user-friendly error messages
if (res.status === 429) {
  const errorData = await res.json();
  throw new Error(errorData.message || 'Too many requests. Please try again later.');
}
```

### User Experience

- Clear error messages indicating rate limit exceeded
- Retry-after information displayed to users
- Console logging for debugging rate limit issues

## 🧪 Testing Rate Limits

### Test Authentication Rate Limit (IP-based)

Try logging in 6 times within 15 minutes from the same IP:

```bash
# Attempt 1-5: Should work (or fail with wrong credentials)
# Attempt 6: Should return 429 rate limit error
```

### Test Account Rate Limit

Try logging in with the same email 4 times within 5 minutes:

```bash
# Attempt 1-3: Should work (or fail with wrong credentials)
# Attempt 4: Should return 429 account locked error
```

### Check Rate Limit Status

Visit the health endpoint:

```bash
curl http://localhost:4000/health
```

Response includes Redis status and rate limit configuration:

```json
{
  "status": "ok",
  "redis": {
    "connected": true,
    "status": "Connected ✅"
  },
  "rateLimits": {
    "auth": "5 requests per 15 minutes per IP",
    "account": "3 login attempts per 5 minutes per email",
    "upload": "20 uploads per hour",
    "general": "100 requests per minute",
    "storage": "Redis (persistent)"
  }
}
```

## 🔍 Monitoring Rate Limits

### View Redis Keys

Connect to Redis CLI and check rate limit keys:

```bash
redis-cli
127.0.0.1:6379> KEYS *
127.0.0.1:6379> GET "rl:account:user@example.com"
127.0.0.1:6379> TTL "rl:account:user@example.com"
```

### Server Logs

The server logs rate limit events:

```
🚫 IP Rate limit hit for IP 127.0.0.1 on auth endpoint
🚫 Account Rate limit hit for account: user@example.com
```

## 🚀 Running the Application

### Start Redis Server

```bash
redis-server
```

### Start Backend Server

```bash
cd Graph_QL
npm start
```

Expected output:
```
✅ Redis client connected
✅ Redis client ready to use
🚀 GraphQL  → http://localhost:4000/graphql
🔐 REST Auth→ http://localhost:4000/api/auth/login | /signup | /me
🔴 Redis    → Connected ✅
⏱️  Rate Limits: Auth=5/15min per IP, Account=3/5min per email, Upload=20/hr, General=100/min
```

### Start Frontend

```bash
cd frontend
npm start
```

## 🛠️ Troubleshooting

### Redis Connection Issues

**Problem:** `Could not create server TCP listening socket *:6379: bind: An operation was attempted on something that is not a socket.`

**Solution:** Redis is already running. Check with:
```bash
redis-cli ping
```

**Problem:** `Redis client error: connect ECONNREFUSED`

**Solution:** Start Redis server:
```bash
redis-server
```

### Rate Limit Not Working

1. Check Redis connection status in server logs
2. Verify Redis is running: `redis-cli ping`
3. Check environment variables in `.env`
4. Clear Redis keys if needed: `redis-cli FLUSHALL`

### Testing in Development

To temporarily disable rate limiting for testing, you can:

1. Increase the limits in `server.js`
2. Clear Redis keys: `redis-cli FLUSHALL`
3. Use different IP addresses or email addresses

## 📦 Dependencies

```json
{
  "redis": "^4.x.x",
  "rate-limit-redis": "^4.x.x",
  "express-rate-limit": "^8.x.x"
}
```

## 🔐 Security Best Practices

1. **Production Configuration:**
   - Use Redis password authentication
   - Configure Redis to bind to localhost only
   - Use environment variables for sensitive config

2. **Rate Limit Tuning:**
   - Adjust limits based on your application needs
   - Monitor false positives (legitimate users getting blocked)
   - Consider implementing IP whitelisting for trusted sources

3. **Monitoring:**
   - Set up alerts for rate limit violations
   - Log suspicious patterns
   - Review rate limit logs regularly

## 📚 Additional Resources

- [Redis Documentation](https://redis.io/docs/)
- [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit)
- [rate-limit-redis](https://github.com/wyattjoh/rate-limit-redis)

## ✅ Summary

Your backend now has:
- ✅ Redis-based distributed rate limiting
- ✅ IP-based protection for auth endpoints
- ✅ Account-based protection against brute force
- ✅ Upload rate limiting
- ✅ General API rate limiting
- ✅ Fallback to in-memory if Redis unavailable
- ✅ Frontend error handling for rate limits
- ✅ Health check endpoint with rate limit status
