# GraphQL MySQL CRUD Demo

## Setup

1. Install dependencies:
```
npm install
```

2. Create `.env` file from example:
```
cp .env.example .env
```

3. Update database credentials in `.env` file

4. Create database and table:
```
mysql -u root -p < database.sql
```

5. Start server:
```
npm start
```

5. Open Apollo Studio: http://localhost:4000/graphql

## Example Queries

### Fetch all users
```graphql
{
  users {
    id
    name
    email
  }
}
```

### Fetch single user
```graphql
{
  user(id: 1) {
    id
    name
    email
  }
}
```

### Create user
```graphql
mutation {
  createUser(name: "Alice", email: "alice@example.com") {
    id
    name
    email
  }
}
```

### Update user
```graphql
mutation {
  updateUser(id: 1, name: "John Updated", email: "john.new@example.com") {
    id
    name
    email
  }
}
```

### Delete user
```graphql
mutation {
  deleteUser(id: 1)
}
```
