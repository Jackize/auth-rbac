# JWT Access Control Tests

## Overview

Tests for JWT validation covering three critical security cases:

1. **Missing token returns 401** - Requests without a token are rejected
2. **Expired token rejected** - Tokens past their expiration time are rejected
3. **Modified token rejected** - Tampered or corrupted tokens are rejected

## Setup

### 1. Install testing dependencies

```bash
npm install
```

### 2. Run the tests

**Run all tests:**

```bash
npm test
```

**Run tests in watch mode (auto-rerun on changes):**

```bash
npm run test:watch
```

**Run tests with coverage report:**

```bash
npm run test:coverage
```

## Test Cases

### ✅ Missing token returns 401

- No Authorization header provided → 401 "Access token missing"
- Empty Authorization header → 401 "Access token missing"
- Authorization header without Bearer token → 401 "Access token missing"

### ✅ Expired token rejected

- Token with expiration time in the past → 401 "Invalid or expired token"
- The jose library automatically validates token expiration

### ✅ Modified token rejected

- Token with corrupted signature → 401 "Invalid or expired token"
- Token with modified header/algorithm → 401 "Invalid or expired token"
- Invalid token format → 401 "Invalid or expired token"

### ✅ Bonus: Valid token accepted

- Valid token with correct signature → 200 Success
- User payload is accessible in the protected route

## Test Structure

```
tests/
└── jwt.test.js         # JWT authorization middleware tests
```

The test file:

- Creates a minimal Express app with a protected route
- Uses the actual `authorize` middleware
- Tests against real JWT signing/verification logic
- Uses supertest for HTTP assertions

## Integration with CI/CD

Add to your CI/CD pipeline:

```yaml
- name: Run tests
  run: npm test
```

## Troubleshooting

**Issue:** Tests fail with module import errors

- Ensure `package.json` has `"type": "module"`
- Node.js version >= 16 recommended

**Issue:** Tests timeout

- Increase Jest timeout: `jest.setTimeout(10000)` in test file
- Check that environment variables (JWT keys) are loaded

**Issue:** Cannot find module errors

- Run `npm install` to ensure all dependencies are installed
- Check that file paths use correct extensions (`.js`)
