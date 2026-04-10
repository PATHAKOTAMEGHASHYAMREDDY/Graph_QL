const typeDefs = `
  # ── Faculty ──────────────────────────────────────────────────────────────
  type Faculty {
    id: Int!
    name: String!
    email: String!
    classSection: String
    createdAt: String
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
    english: Int
    tamil: Int
    maths: Int
    total: Int
    englishStatus: String
    tamilStatus: String
    mathsStatus: String
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
  }

  # ── Mutations ─────────────────────────────────────────────────────────────
  type Mutation {
    # Auth
    sendOtp(email: String!): String
    verifyOtpAndRegister(name: String!, email: String!, otp: String!, password: String!, classSection: String!): AuthPayload
    loginFaculty(email: String!, password: String!): AuthPayload

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
