const redis = require('redis');
require('dotenv').config();

// Create Redis client
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379
  },
  // Add password if your Redis instance requires it
  // password: process.env.REDIS_PASSWORD
});

// Handle Redis connection events
redisClient.on('connect', () => {
  console.log('✅ Redis client connected');
});

redisClient.on('ready', () => {
  console.log('✅ Redis client ready to use');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis client error:', err.message);
});

redisClient.on('end', () => {
  console.log('⚠️  Redis client disconnected');
});

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error('❌ Failed to connect to Redis:', err.message);
    console.log('⚠️  Falling back to in-memory rate limiting');
  }
})();

module.exports = redisClient;
