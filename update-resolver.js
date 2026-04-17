const fs = require('fs');
const path = require('path');

const resolversPath = path.join(__dirname, 'src', 'resolvers.js');
let content = fs.readFileSync(resolversPath, 'utf8');

// Find and replace the updateUser function
const oldFunction = `    updateUser: async (_, { id, name, email }, context) => {
      requireAuth(context);
      const updates = [];
      const values = [];

      if (name) { values.push(name); updates.push(\`name = \$\${values.length}\`); }
      if (email) { values.push(email); updates.push(\`email = \$\${values.length}\`); }

      values.push(id);
      values.push(context.facultyId);

      const { rows } = await db.query(
        \`UPDATE users SET \$\{updates.join(', ')} WHERE id = \$\${values.length - 1} AND faculty_id = \$\${values.length} RETURNING *\`,
        values
      );
      if (!rows[0]) throw new GraphQLError('Student not found or unauthorized.');
      return mapStudent(rows[0]);
    },`;

const newFunction = `    updateUser: async (_, { id, name, email }, context) => {
      requireAuth(context);
      
      // Check permission
      const userType = context.userType || 'faculty';
      const userId = context.facultyId || context.studentId;
      await requirePermission(userId, userType, 'students.update');
      
      // Faculty can only update name, not email
      if (email) {
        throw new GraphQLError('Faculty cannot update student email. Only name can be updated.');
      }
      
      if (!name) {
        throw new GraphQLError('Name is required for update.');
      }

      const { rows } = await db.query(
        \`UPDATE users SET name = \$1 WHERE id = \$2 RETURNING *\`,
        [name, id]
      );
      
      if (!rows[0]) throw new GraphQLError('Student not found.');
      
      const updatedStudent = mapStudent(rows[0]);
      
      // Send real-time update to student via WebSocket
      const { notifyStudentMarksUpdate } = require('./websocket');
      const notified = notifyStudentMarksUpdate(id, updatedStudent);
      
      if (notified) {
        console.log(\`✅ Real-time name update sent to student \${id}\`);
      } else {
        console.log(\`ℹ️  Student \${id} not connected to WebSocket\`);
      }
      
      return updatedStudent;
    },`;

if (content.includes(oldFunction)) {
  content = content.replace(oldFunction, newFunction);
  fs.writeFileSync(resolversPath, content, 'utf8');
  console.log('✅ Successfully updated updateUser function');
} else {
  console.log('❌ Could not find the old function to replace');
  console.log('Searching for partial match...');
  if (content.includes('updateUser: async')) {
    console.log('✅ Found updateUser function');
  }
}
