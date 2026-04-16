const db = require('./db');

/**
 * RBAC (Role-Based Access Control) Helper Functions
 * 
 * This module provides functions to check user permissions based on their roles.
 */

// Cache for role permissions (reduces database queries)
const permissionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all permissions for a role
 * @param {number} roleId - Role ID
 * @returns {Promise<string[]>} Array of permission names
 */
async function getRolePermissions(roleId) {
  const cacheKey = `role_${roleId}`;
  const cached = permissionCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.permissions;
  }
  
  const { rows } = await db.query(
    `SELECT p.name 
     FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id
     WHERE rp.role_id = $1`,
    [roleId]
  );
  
  const permissions = rows.map(row => row.name);
  
  // Cache the result
  permissionCache.set(cacheKey, {
    permissions,
    timestamp: Date.now()
  });
  
  return permissions;
}

/**
 * Get user's role and permissions
 * @param {number} userId - User ID
 * @param {string} userType - 'faculty' or 'student'
 * @returns {Promise<{roleId: number, roleName: string, permissions: string[]}>}
 */
async function getUserRoleAndPermissions(userId, userType) {
  const table = userType === 'faculty' ? 'faculty' : 'users';
  
  const { rows } = await db.query(
    `SELECT u.role_id, r.name as role_name
     FROM ${table} u
     JOIN roles r ON u.role_id = r.id
     WHERE u.id = $1`,
    [userId]
  );
  
  if (rows.length === 0) {
    return { roleId: null, roleName: null, permissions: [] };
  }
  
  const { role_id, role_name } = rows[0];
  const permissions = await getRolePermissions(role_id);
  
  return {
    roleId: role_id,
    roleName: role_name,
    permissions
  };
}

/**
 * Check if user has a specific permission
 * @param {number} userId - User ID
 * @param {string} userType - 'faculty' or 'student'
 * @param {string} permissionName - Permission name (e.g., 'students.create')
 * @returns {Promise<boolean>}
 */
async function hasPermission(userId, userType, permissionName) {
  const { permissions } = await getUserRoleAndPermissions(userId, userType);
  return permissions.includes(permissionName);
}

/**
 * Check if user has any of the specified permissions
 * @param {number} userId - User ID
 * @param {string} userType - 'faculty' or 'student'
 * @param {string[]} permissionNames - Array of permission names
 * @returns {Promise<boolean>}
 */
async function hasAnyPermission(userId, userType, permissionNames) {
  const { permissions } = await getUserRoleAndPermissions(userId, userType);
  return permissionNames.some(perm => permissions.includes(perm));
}

/**
 * Check if user has all of the specified permissions
 * @param {number} userId - User ID
 * @param {string} userType - 'faculty' or 'student'
 * @param {string[]} permissionNames - Array of permission names
 * @returns {Promise<boolean>}
 */
async function hasAllPermissions(userId, userType, permissionNames) {
  const { permissions } = await getUserRoleAndPermissions(userId, userType);
  return permissionNames.every(perm => permissions.includes(perm));
}

/**
 * Require permission (throws error if not authorized)
 * @param {number} userId - User ID
 * @param {string} userType - 'faculty' or 'student'
 * @param {string} permissionName - Permission name
 * @throws {Error} If user doesn't have permission
 */
async function requirePermission(userId, userType, permissionName) {
  const allowed = await hasPermission(userId, userType, permissionName);
  
  if (!allowed) {
    const { roleName } = await getUserRoleAndPermissions(userId, userType);
    throw new Error(
      `Access denied. Role '${roleName}' does not have permission '${permissionName}'.`
    );
  }
}

/**
 * Get user's role name
 * @param {number} userId - User ID
 * @param {string} userType - 'faculty' or 'student'
 * @returns {Promise<string|null>}
 */
async function getUserRole(userId, userType) {
  const { roleName } = await getUserRoleAndPermissions(userId, userType);
  return roleName;
}

/**
 * Check if user is admin
 * @param {number} userId - User ID
 * @param {string} userType - 'faculty' or 'student'
 * @returns {Promise<boolean>}
 */
async function isAdmin(userId, userType) {
  const roleName = await getUserRole(userId, userType);
  return roleName === 'admin';
}

/**
 * Check if user is faculty
 * @param {number} userId - User ID
 * @param {string} userType - 'faculty' or 'student'
 * @returns {Promise<boolean>}
 */
async function isFaculty(userId, userType) {
  const roleName = await getUserRole(userId, userType);
  return roleName === 'faculty' || roleName === 'admin';
}

/**
 * Check if user is student
 * @param {number} userId - User ID
 * @param {string} userType - 'faculty' or 'student'
 * @returns {Promise<boolean>}
 */
async function isStudent(userId, userType) {
  const roleName = await getUserRole(userId, userType);
  return roleName === 'student';
}

/**
 * Clear permission cache (call after role/permission changes)
 */
function clearPermissionCache() {
  permissionCache.clear();
}

module.exports = {
  getRolePermissions,
  getUserRoleAndPermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  requirePermission,
  getUserRole,
  isAdmin,
  isFaculty,
  isStudent,
  clearPermissionCache
};
