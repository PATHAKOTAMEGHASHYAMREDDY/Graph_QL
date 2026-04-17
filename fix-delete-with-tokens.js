const fs = require('fs');
const content = fs.readFileSync('src/resolvers.js', 'utf8');
const lines = content.split('\n');

// Find deleteUser function
const deleteUserStart = lines.findIndex(line => line.includes('deleteUser: async'));
console.log(`Found deleteUser at line ${deleteUserStart + 1}`);

// New deleteUser with token cleanup and WebSocket notification
const newDeleteUser = [
  '    deleteUser: async (_, { id }, context) => {',
  '      requireAuth(context);',
  '      ',
  '      // Check permission',
  '      const userType = context.userType || \'faculty\';',
  '      const userId = context.facultyId || context.studentId;',
  '      await requirePermission(userId, userType, \'students.delete\');',
  '      ',
  '      // Get faculty\'s section',
  '      const { rows: facultyRows } = await db.query(',
  '        \'SELECT section FROM faculty WHERE id = $1\',',
  '        [context.facultyId]',
  '      );',
  '      ',
  '      if (facultyRows.length === 0) {',
  '        throw new GraphQLError(\'Faculty not found.\');',
  '      }',
  '      ',
  '      const facultySection = facultyRows[0].section;',
  '      ',
  '      // Check if student exists and is in the same section',
  '      const { rows: studentRows } = await db.query(',
  '        \'SELECT id, name, email FROM users WHERE id = $1 AND section = $2\',',
  '        [id, facultySection]',
  '      );',
  '      ',
  '      if (studentRows.length === 0) {',
  '        throw new GraphQLError(\'Student not found or unauthorized.\');',
  '      }',
  '      ',
  '      const student = studentRows[0];',
  '      console.log(`🗑️  Deleting student: ${student.name} (${student.email})`);',
  '      ',
  '      // Delete all refresh tokens for this student (logs them out)',
  '      await deleteAllStudentRefreshTokens(id);',
  '      console.log(`✅ Deleted all refresh tokens for student ${id}`);',
  '      ',
  '      // Send WebSocket notification to kick student out',
  '      const { notifyStudentMarksUpdate } = require(\'./websocket\');',
  '      notifyStudentMarksUpdate(id, {',
  '        type: \'account_deleted\',',
  '        message: \'Your account has been deleted by faculty\'',
  '      });',
  '      ',
  '      // Delete the student record',
  '      const result = await db.query(',
  '        \'DELETE FROM users WHERE id = $1\',',
  '        [id]',
  '      );',
  '      ',
  '      console.log(`✅ Student ${student.name} deleted successfully`);',
  '      return `Student ${student.name} deleted successfully`;',
  '    },'
];

// Find the end of deleteUser
let deleteUserEnd = deleteUserStart;
for (let i = deleteUserStart + 1; i < lines.length; i++) {
  if (lines[i].trim().startsWith('//') && lines[i].includes('Document')) {
    deleteUserEnd = i - 1;
    break;
  }
}

console.log(`Replacing lines ${deleteUserStart + 1} to ${deleteUserEnd + 1}`);

const before = lines.slice(0, deleteUserStart);
const after = lines.slice(deleteUserEnd + 1);
const newContent = [...before, ...newDeleteUser, '', ...after].join('\n');

fs.writeFileSync('src/resolvers.js', newContent, 'utf8');
console.log('✅ Successfully updated deleteUser function with token cleanup');
