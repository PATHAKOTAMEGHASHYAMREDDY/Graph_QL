const typeDefs = `
  # ── Faculty ──────────────────────────────────────────────────────────────
  type Faculty {
    id: Int!
    name: String!
    email: String!
    classSection: String
    createdAt: String
    role: Role
  }

  # ── Role and Permissions ──────────────────────────────────────────────────
  type Role {
    id: Int!
    name: String!
    description: String
    permissions: [Permission!]!
  }

  type Permission {
    id: Int!
    name: String!
    description: String
    resource: String!
    action: String!
  }

  # Debug info for client-side rate limiting visibility
  type DebugInfo {
    type: String!
    email: String
    maxAttempts: Int
    remainingAttempts: Int
    waitMinutes: Int
    reason: String
    timestamp: String!
    message: String
  }

  type AuthPayload {
    token: String!
    refreshToken: String!
    faculty: Faculty!
    debug: DebugInfo
  }

  # ── Document (Uploaded Files) ─────────────────────────────────────────────
  type Document {
    id: Int!
    facultyId: Int!
    filename: String!
    originalName: String!
    fileSize: Int
    mimeType: String
    uploadDate: String
    description: String
  }

  # ── Student (User) ────────────────────────────────────────────────────────
  type User {
    id: Int!
    name: String!
    email: String!
    section: String
    english: Int
    tamil: Int
    maths: Int
    total: Int
    englishStatus: String
    tamilStatus: String
    mathsStatus: String
    role: Role
  }

  # ── Student Auth ──────────────────────────────────────────────────────────
  type StudentAuthPayload {
    token: String!
    refreshToken: String!
    student: User!
    debug: DebugInfo
  }

  # ── Pagination Types ──────────────────────────────────────────────────────
  type PaginationInfo {
    currentPage: Int!
    pageSize: Int!
    totalPages: Int!
    totalCount: Int!
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
  }

  type PaginatedUsers {
    users: [User!]!
    pagination: PaginationInfo!
  }

  # ── Queries ───────────────────────────────────────────────────────────────
  type Query {
    users: [User]
    user(id: Int!): User
    
    # New paginated query with search and sorting
    paginatedUsers(
      page: Int = 1
      pageSize: Int = 5
      search: String
      sortBy: String = "id"
      sortOrder: String = "ASC"
    ): PaginatedUsers!
    
    me: Faculty
    myDocuments: [Document]  # Get all documents for logged-in faculty
    allDocuments: [Document]  # Get all documents (admin only)
    
    # Student queries
    myProfile: User  # Get logged-in student's profile
    
    # RBAC queries
    myPermissions: [String!]!  # Get current user's permissions
    myRole: Role  # Get current user's role
  }

  # ── Mutations ─────────────────────────────────────────────────────────────
  type Mutation {
    # Faculty Auth
    sendOtp(email: String!): String
    verifyOtpAndRegister(name: String!, email: String!, otp: String!, password: String!, section: String!): AuthPayload
    loginFaculty(email: String!, password: String!): AuthPayload
    refreshAccessToken(refreshToken: String!): AuthPayload
    logout(refreshToken: String!): String

    # Student Auth
    sendStudentOtp(email: String!): String
    verifyStudentOtpAndRegister(name: String!, email: String!, otp: String!, password: String!, section: String!): StudentAuthPayload
    registerStudent(name: String!, email: String!, password: String!): StudentAuthPayload
    loginStudent(email: String!, password: String!): StudentAuthPayload
    refreshStudentAccessToken(refreshToken: String!): StudentAuthPayload
    logoutStudent(refreshToken: String!): String

    # Student CRUD (requires auth)
    createUser(name: String!, email: String!): User
    updateUser(id: Int!, name: String, email: String): User
    deleteUser(id: Int!): String
    updateMarks(id: Int!, english: Int!, tamil: Int!, maths: Int!): User

    # Documents (requires auth)
    deleteDocument(id: Int!): String
    updateDocumentDescription(id: Int!, description: String): Document
  }
`;

module.exports = typeDefs;
