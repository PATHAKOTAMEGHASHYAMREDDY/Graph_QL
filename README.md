## Example Queries

### Fetch all users
```graphql
query {
  users {
    id
    name
    email
  }
}
```

### Fetch single user
```graphql
query {
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
