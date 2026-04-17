const fs = require('fs');
const content = fs.readFileSync('src/resolvers.js', 'utf8');
const lines = content.split('\n');

// Replace lines 996-1013 (indices 995-1012)
const newLines = [
  '    updateUser: async (_, { id, name, email }, context) => {',
  '      requireAuth(context);',
  '      ',
  '      // Check permission',
  '      const userType = context.userType || \'faculty\';',
  '      const userId = context.facultyId || context.studentId;',
  '      await requirePermission(userId, userType, \'students.update\');',
  '      ',
  '      // Faculty can only update name, not email',
  '      if (email) {',
  '        throw new GraphQLError(\'Faculty cannot update student email. Only name can be updated.\');',
  '      }',
  '      ',
  '      if (!name) {',
  '        throw new GraphQLError(\'Name is required for update.\');',
  '      }',
  '',
  '      const { rows } = await db.query(',
  '        `UPDATE users SET name = $1 WHERE id = $2 RETURNING *`,',
  '        [name, id]',
  '      );',
  '      ',
  '      if (!rows[0]) throw new GraphQLError(\'Student not found.\');',
  '      ',
  '      const updatedStudent = mapStudent(rows[0]);',
  '      ',
  '      // Send real-time update to student via WebSocket',
  '      const { notifyStudentMarksUpdate } = require(\'./websocket\');',
  '      const notified = notifyStudentMarksUpdate(id, updatedStudent);',
  '      ',
  '      if (notified) {',
  '        console.log(`✅ Real-time name update sent to student ${id}`);',
  '      } else {',
  '        console.log(`ℹ️  Student ${id} not connected to WebSocket`);',
  '      }',
  '      ',
  '      return updatedStudent;',
  '    },'
];

// Replace the lines
const before = lines.slice(0, 995);
const after = lines.slice(1013);
const newContent = [...before, ...newLines, ...after].join('\n');

fs.writeFileSync('src/resolvers.js', newContent, 'utf8');
console.log('✅ Successfully updated updateUser function');
console.log(`   Replaced lines 996-1013 with ${newLines.length} new lines`);
