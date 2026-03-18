# Technology Stack

**Analysis Date:** 2026-03-18

## Languages

**Primary:**
- JavaScript (ES Modules) - All application source code in `src/`
- TypeScript - Prisma seed script (`prisma/seed.ts`) and Prisma config (`prisma.config.ts`)

## Runtime

**Environment:**
- Node.js v22.21.0 (detected on host)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Express 5.2.1 - HTTP server framework; used in `src/app.js` and `src/sever.js`

**Testing:**
- Jest 29.7.0 - Test runner and assertion library; config in `jest.config.js`
- supertest 6.3.3 - HTTP integration test client against the Express app

**Build/Dev:**
- nodemon 3.1.14 - Auto-reload in development (`npm run dev`)
- prettier 3.8.1 - Code formatting (`npm run format`)
- eslint 10.0.2 - Linting (`npm run lint`)
- ts-node - TypeScript execution for seed script (`prisma/seed.ts`)

## Key Dependencies

**Critical:**
- `@prisma/client` 7.4.1 - ORM client generated to `src/generated/prisma/`; all DB queries use this
- `@prisma/adapter-pg` 7.4.1 - PostgreSQL adapter for Prisma; used in `src/infra/prisma.js`
- `ioredis` 5.9.3 - Redis client singleton; used in `src/config/redis.js` for rate limiting and metrics
- `jose` 6.1.3 - JWT library (RS256 sign/verify); used in `src/utils/jwt.js`
- `argon2` 0.44.0 - Password hashing (Argon2id); used in `src/utils/password.js`
- `zod` 4.3.6 - Request body validation schemas; used in `src/modules/auth/auth.validation.js` and `src/modules/refresh/refresh.validation.js`

**Infrastructure:**
- `helmet` 8.1.0 - HTTP security headers (HSTS, CSP, CORP); configured in `src/app.js`
- `cors` 2.8.6 - CORS middleware; configured from `CORS_ORIGIN` env var in `src/app.js`
- `pino` 10.3.1 - Structured JSON logger; configured in `src/config/logger.js`
- `pino-http` 11.0.0 - HTTP request/response logging middleware; used in `src/app.js`
- `pino-pretty` 13.1.3 - Human-readable log formatting for development
- `dotenv` 17.3.1 - Environment variable loading; called at startup in `src/sever.js` and `src/infra/prisma.js`
- `uuid` 13.0.0 - UUID generation for token and entity IDs

## Configuration

**Environment:**
- All configuration loaded from `.env` file via `dotenv`
- Required env vars (from `src/utils/env.js`, `src/config/redis.js`, `src/infra/prisma.js`):
  - `DATABASE_URL` - PostgreSQL connection string
  - `REDIS_URL` - Redis connection string
  - `JWT_PRIVATE_KEY` - RSA private key PEM (newlines as `\n`)
  - `JWT_PUBLIC_KEY` - RSA public key PEM (newlines as `\n`)
  - `JWT_KEY_ID` - Key identifier for rotation (defaults to `"v1"`)
  - `JWT_OLD_PUBLIC_KEY` - Previous RSA public key for rotation (optional)
  - `JWT_OLD_KEY_ID` - Previous key identifier (optional)
  - `JWT_OLD_KEY_EXPIRES` - Expiry datetime for old key (optional)
  - `CORS_ORIGIN` - Allowed CORS origin (defaults to `"*"`)
  - `PORT` - HTTP port (defaults to `3000`)
  - `NODE_ENV` - Environment name; controls error detail exposure and HTTPS redirect
  - `LOG_LEVEL` - Pino log level (defaults to `"info"`)
  - `MAX_FAILED_LOGIN_ATTEMPTS` - Lockout threshold (read in `src/config/loginLock.js`)
  - `LOCK_DURATION_MINUTES` - Account lock duration (read in `src/config/loginLock.js`)
- RSA key PEM files also present at project root: `private.pem`, `public.pem`

**Build:**
- `jest.config.js` - Jest configuration; ESM mode with `--experimental-vm-modules`; `maxWorkers: 1` for sequential DB tests
- `prisma.config.ts` - Prisma CLI configuration; points to `prisma/schema.prisma` and seed command
- `prisma/schema.prisma` - Database schema; generator outputs to `src/generated/prisma/`

## Platform Requirements

**Development:**
- Node.js (v22 in use)
- PostgreSQL database accessible via `DATABASE_URL`
- Redis instance accessible via `REDIS_URL`
- npm for dependency management

**Production:**
- Node.js process server (no serverless/edge configuration present)
- Expects to run behind a reverse proxy (`app.set("trust proxy", 1)` in `src/app.js`)
- HTTPS redirect enforced when `NODE_ENV=production`
- Graceful shutdown handles `SIGINT` / `SIGTERM` signals (in `src/sever.js`)

---

*Stack analysis: 2026-03-18*
