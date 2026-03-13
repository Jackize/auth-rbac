import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

// -----------------------------------------------------------------------------
// mocks
// -----------------------------------------------------------------------------
let getUserPermissionsMock;

jest.unstable_mockModule("../src/repository/user.repository.js", () => {
  getUserPermissionsMock = jest.fn();
  return {
    userRepository: {
      getUserPermissions: getUserPermissionsMock,
    },
  };
});

// dynamically import modules that depend on the mocks
let requirePermission;
let RESOURCE_USER_PERMISSIONS;

beforeAll(async () => {
  ({ requirePermission } =
    await import("../src/middleware/require.permission.js"));
  ({ RESOURCE_USER_PERMISSIONS } =
    await import("../src/permissions/user.permission.js"));
});

// -----------------------------------------------------------------------------
// helper & setup
// -----------------------------------------------------------------------------
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // fake authorize middleware; we'll always attach a user object but allow
  // the tests to control the granted permissions via the repository mock.
  const fakeAuthorize =
    (roles = ["admin"]) =>
    (req, res, next) => {
      req.user = { userId: "test-user", roles };
      next();
    };

  // route that exercises the RBAC middleware
  app.get(
    "/protected",
    fakeAuthorize(),
    requirePermission(RESOURCE_USER_PERMISSIONS.read),
    (req, res) => {
      return res.status(200).json({ message: "ok" });
    },
  );

  // simple error handler so that Jest can see exceptions
  app.use((err, req, res, next) => {
    console.error("test error", err);
    res.status(500).json({ error: "internal" });
  });

  return app;
};

// -----------------------------------------------------------------------------
// tests
// -----------------------------------------------------------------------------
describe("RBAC middleware", () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    getUserPermissionsMock.mockReset();
  });

  it("allows an admin (wildcard) to access the protected route", async () => {
    // admin users are represented by a wildcard permission
    getUserPermissionsMock.mockResolvedValue(["*"]);

    const res = await request(app).get("/protected");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("ok");
  });

  it("returns 403 when the user lacks the required permission", async () => {
    getUserPermissionsMock.mockResolvedValue([]); // no permissions at all

    const res = await request(app).get("/protected");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("does not grant access solely based on a hard‑coded role field", async () => {
    // even though the fake authorize middleware attaches a role of "admin",
    // the permission lookup returns an empty array; the middleware should still
    // reject the request rather than trusting the role name.
    getUserPermissionsMock.mockResolvedValue([]);

    const res = await request(app).get("/protected");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });
});
