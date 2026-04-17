const fs = require('fs');
const content = fs.readFileSync('src/resolvers.js', 'utf8');
const lines = content.split('\n');
for (let i = 995; i < 1015; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
