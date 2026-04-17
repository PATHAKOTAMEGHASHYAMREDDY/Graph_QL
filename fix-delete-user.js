const fs = require('fs');
const content = fs.readFileSync('src/resolvers.js', 'utf8');
const lines = content.split('\n');

// Find deleteUser function (around line 1076)
const deleteUserStart = lines.findIndex(line => line.includes('deleteUser: async'));
console.log(`Found deleteUser at line ${deleteUserStart + 1}`);

// Replace deleteUser function
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
  '      // Delete student only if they are in the same section',
  '      const result = await db.query(',
  '        \'DELETE FROM users WHERE id = $1 AND section = $2\',',
  '        [id, facultySection]',
  '      );',
  '      ',
  '      if (result.rowCount === 0) throw new GraphQLError(\'Student not found or unauthorized.\');',
  '      return `Student with id ${id} deleted successfully`;',
  '    },'
];

// Find the end of deleteUser (next function or closing brace)
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
console.log('✅ Successfully updated deleteUser function');
