const typeDefs = `
  type User {
    id: Int!
    name: String!
    email: String!
    english: Int
    tamil: Int
    maths: Int
    total: Int
  }

  type Query {
    users: [User]
    user(id: Int!): User
  }

  type Mutation {
    createUser(name: String!, email: String!): User
    updateUser(id: Int!, name: String, email: String): User
    deleteUser(id: Int!): String
    updateMarks(id: Int!, english: Int!, tamil: Int!, maths: Int!): User
  }
`;

module.exports = typeDefs;
