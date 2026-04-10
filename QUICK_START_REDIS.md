# Quick Start Guide - Redis Rate Limiting

## 🚀 Step-by-Step Setup

### Step 1: Verify Redis Installation

Check if Redis is installed and running:

```bash
redis-cli ping
```

Expected output: `PONG`

If you see an error, start Redis:

```bash
redis-server
```

### Step 2: Install Dependencies

The Redis packages are already installed. If you need to reinstall:

```bash
cd Graph_QL
npm install redis rate-limit-redis --save
```

### Step 3: Environment Configuration

Your `.env` file already has Redis configuration:

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### Step 4: Start the Backend Server

```bash
cd Graph_QL
npm start
```

Look for these messages in the console:

```
✅ Redis client connected
✅ Redis client ready to use
🚀 GraphQL  → http://localhost:4000/graphql
🔐 REST Auth→ http://localhost:4000/api/auth/login | /signup | /me
🔴 Redis    → Connected ✅
⏱️  Rate Limits: Auth=5/15min per IP, Account=3/5min per email, Upload=20/hr, General=100/min
```

### Step 5: Test Rate Limiting

#### Option A: Use the Test Script

```bash
cd Graph_QL
node test-rate-limit.js
```

This will automatically test all rate limit scenarios.

#### Option B: Manual Testing

**Test Health Endpoint:**
```bash
curl http://localhost:4000/health
```

**Test Auth Rate Limit (try 6 times):**
```bash
curl -X POST http://localhost:4000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"test123"}'
```

**Check Redis Keys:**
```bash
redis-cli
127.0.0.1:6379> KEYS *
127.0.0.1:6379> GET "rl:127.0.0.1"
127.0.0.1:6379> TTL "rl:127.0.0.1"
```

### Step 6: Start the Frontend

```bash
cd frontend
npm start
```

Visit: http://localhost:4200

## 🧪 Testing Scenarios

### Scenario 1: Test IP-Based Rate Limit

1. Open the login page
2. Try to login 6 times with any credentials
3. On the 6th attempt, you should see: "Too many login/signup attempts. Please try again after 15 minutes."

### Scenario 2: Test Account-Based Rate Limit

1. Try to login with the same email 4 times
2. On the 4th attempt, you should see: "Too many failed login attempts for this account. Please try again after 5 minutes."

### Scenario 3: Monitor Redis

Open Redis CLI and watch rate limit keys:

```bash
redis-cli
127.0.0.1:6379> MONITOR
```

Then make requests from the frontend. You'll see Redis commands in real-time.

## 🔍 Verification Checklist

- [ ] Redis server is running (`redis-cli ping` returns `PONG`)
- [ ] Backend server shows "Redis Connected ✅"
- [ ] Health endpoint shows `"connected": true` for Redis
- [ ] Rate limit headers appear in API responses
- [ ] 429 errors appear after exceeding limits
- [ ] Frontend displays rate limit error messages

## 🛠️ Troubleshooting

### Problem: Redis not connecting

**Check if Redis is running:**
```bash
redis-cli ping
```

**Start Redis if not running:**
```bash
redis-server
```

### Problem: Port 6379 already in use

**Find the process:**
```bash
netstat -ano | findstr :6379
```

**Kill the process (Windows):**
```bash
taskkill /PID <process_id> /F
```

### Problem: Rate limits not working

**Clear Redis cache:**
```bash
redis-cli FLUSHALL
```

**Restart the backend server:**
```bash
cd Graph_QL
npm start
```

## 📊 Rate Limit Configuration

Current limits (can be adjusted in `server.js`):

| Endpoint | Limit | Window | Key |
|----------|-------|--------|-----|
| Auth (IP) | 5 requests | 15 minutes | IP address |
| Account | 3 attempts | 5 minutes | Email address |
| Upload | 20 uploads | 1 hour | IP address |
| General | 100 requests | 1 minute | IP address |

## 🎯 What's Next?

1. **Monitor in Production:**
   - Set up Redis monitoring
   - Track rate limit violations
   - Adjust limits based on usage patterns

2. **Enhance Security:**
   - Add Redis password authentication
   - Configure Redis to bind to localhost only
   - Implement IP whitelisting for trusted sources

3. **Scale:**
   - Use Redis Cluster for high availability
   - Configure Redis persistence (RDB/AOF)
   - Set up Redis replication

## 📚 Useful Commands

**View all Redis keys:**
```bash
redis-cli KEYS "*"
```

**View specific rate limit key:**
```bash
redis-cli GET "rl:127.0.0.1"
```

**Check TTL (time to live):**
```bash
redis-cli TTL "rl:127.0.0.1"
```

**Clear all rate limits:**
```bash
redis-cli FLUSHALL
```

**Monitor Redis commands in real-time:**
```bash
redis-cli MONITOR
```

## ✅ Success!

Your application now has:
- ✅ Redis-based distributed rate limiting
- ✅ Protection against brute force attacks
- ✅ Account-level rate limiting
- ✅ Upload rate limiting
- ✅ General API rate limiting
- ✅ Frontend error handling
- ✅ Comprehensive testing tools

For more details, see `RATE_LIMITING_README.md`
