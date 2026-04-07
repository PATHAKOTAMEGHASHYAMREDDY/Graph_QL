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

  # ── Queries ───────────────────────────────────────────────────────────────
  type Query {
    users: [User]
    user(id: Int!): User
    me: Faculty
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
  }
`;

module.exports = typeDefs;
