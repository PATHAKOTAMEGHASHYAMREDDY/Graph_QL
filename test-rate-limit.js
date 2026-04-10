/**
 * Rate Limit Testing Script
 * 
 * This script tests the rate limiting functionality of the backend API.
 * Run with: node test-rate-limit.js
 */

const API_URL = 'http://localhost:4000';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testHealthEndpoint() {
  log(colors.cyan, '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(colors.cyan, '📊 Testing Health Endpoint');
  log(colors.cyan, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();
    
    log(colors.green, '✅ Health Check Response:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.redis?.connected) {
      log(colors.green, '\n✅ Redis is connected - Rate limiting will be persistent');
    } else {
      log(colors.yellow, '\n⚠️  Redis is not connected - Using in-memory rate limiting');
    }
  } catch (error) {
    log(colors.red, `❌ Health check failed: ${error.message}`);
  }
}

async function testAuthRateLimit() {
  log(colors.cyan, '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(colors.cyan, '🔐 Testing Auth Rate Limit (5 requests per 15 min)');
  log(colors.cyan, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const testEmail = `test${Date.now()}@example.com`;
  
  for (let i = 1; i <= 7; i++) {
    try {
      const response = await fetch(`${API_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test User',
          email: testEmail,
          password: 'test123'
        })
      });

      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      const rateLimitReset = response.headers.get('X-RateLimit-Reset');

      if (response.status === 429) {
        const data = await response.json();
        log(colors.red, `\n🚫 Attempt ${i}: RATE LIMITED!`);
        log(colors.yellow, `   Message: ${data.message}`);
        log(colors.yellow, `   Retry After: ${data.retryAfter}`);
        break;
      } else {
        log(colors.green, `✅ Attempt ${i}: Success (Status: ${response.status})`);
        log(colors.blue, `   Remaining: ${rateLimitRemaining} requests`);
        log(colors.blue, `   Reset: ${new Date(rateLimitReset * 1000).toLocaleTimeString()}`);
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      log(colors.red, `❌ Attempt ${i} failed: ${error.message}`);
    }
  }
}

async function testAccountRateLimit() {
  log(colors.cyan, '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(colors.cyan, '👤 Testing Account Rate Limit (3 attempts per 5 min per email)');
  log(colors.cyan, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const testEmail = 'ratelimit.test@example.com';
  
  log(colors.blue, `Testing with email: ${testEmail}\n`);

  for (let i = 1; i <= 5; i++) {
    try {
      const response = await fetch(`${API_URL}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation { loginFaculty(email: "${testEmail}", password: "wrongpassword") { token } }`
        })
      });

      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');

      if (response.status === 429) {
        const data = await response.json();
        log(colors.red, `\n🚫 Attempt ${i}: ACCOUNT RATE LIMITED!`);
        log(colors.yellow, `   Message: ${data.message}`);
        log(colors.yellow, `   Retry After: ${data.retryAfter}`);
        break;
      } else {
        const data = await response.json();
        log(colors.green, `✅ Attempt ${i}: Request sent (Status: ${response.status})`);
        log(colors.blue, `   Remaining: ${rateLimitRemaining} requests`);
        
        if (data.errors) {
          log(colors.yellow, `   Expected Error: ${data.errors[0].message}`);
        }
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      log(colors.red, `❌ Attempt ${i} failed: ${error.message}`);
    }
  }
}

async function testGeneralRateLimit() {
  log(colors.cyan, '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(colors.cyan, '⚡ Testing General Rate Limit (100 requests per minute)');
  log(colors.cyan, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  log(colors.blue, 'Sending 105 rapid requests to test general rate limit...\n');

  let successCount = 0;
  let rateLimitedCount = 0;

  for (let i = 1; i <= 105; i++) {
    try {
      const response = await fetch(`${API_URL}/health`);
      
      if (response.status === 429) {
        rateLimitedCount++;
        if (rateLimitedCount === 1) {
          const data = await response.json();
          log(colors.red, `\n🚫 Request ${i}: RATE LIMITED!`);
          log(colors.yellow, `   Message: ${data.message}`);
          log(colors.yellow, `   Retry After: ${data.retryAfter}`);
        }
      } else {
        successCount++;
      }

      // Show progress every 20 requests
      if (i % 20 === 0) {
        log(colors.blue, `   Progress: ${i}/105 requests sent...`);
      }
    } catch (error) {
      log(colors.red, `❌ Request ${i} failed: ${error.message}`);
    }
  }

  log(colors.green, `\n✅ Successful requests: ${successCount}`);
  log(colors.red, `🚫 Rate limited requests: ${rateLimitedCount}`);
}

async function runAllTests() {
  log(colors.cyan, '\n╔═══════════════════════════════════════════════════════╗');
  log(colors.cyan, '║     RATE LIMITING TEST SUITE                          ║');
  log(colors.cyan, '╚═══════════════════════════════════════════════════════╝');

  try {
    // Test 1: Health endpoint
    await testHealthEndpoint();
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Auth rate limit (IP-based)
    await testAuthRateLimit();
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Account rate limit (email-based)
    await testAccountRateLimit();
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 4: General rate limit
    await testGeneralRateLimit();

    log(colors.cyan, '\n╔═══════════════════════════════════════════════════════╗');
    log(colors.cyan, '║     ALL TESTS COMPLETED                               ║');
    log(colors.cyan, '╚═══════════════════════════════════════════════════════╝\n');

    log(colors.yellow, '💡 Tips:');
    log(colors.reset, '   - Check Redis with: redis-cli KEYS "*"');
    log(colors.reset, '   - Clear rate limits: redis-cli FLUSHALL');
    log(colors.reset, '   - View server logs for rate limit events\n');

  } catch (error) {
    log(colors.red, `\n❌ Test suite failed: ${error.message}\n`);
  }
}

// Run the tests
runAllTests();
