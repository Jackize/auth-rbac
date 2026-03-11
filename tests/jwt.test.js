import { beforeAll, describe, expect, it } from "@jest/globals";

import express from "express";
import request from "supertest";
import { signAccessToken, verifyAccessToken } from "../src/utils/jwt.js";

// Create a minimal Express app for testing
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // simple authorization middleware that only verifies the JWT and
  // attaches the payload; it intentionally skips the database lookup so
  // the tests can exercise token handling without a real user table.
  const fakeAuthorize = async (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access token missing" });
    }

    try {
      const payload = await verifyAccessToken(token);
      req.user = payload;
      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  };

  // Test route that requires authorization
  app.get("/protected", fakeAuthorize, (req, res) => {
    return res.status(200).json({ message: "Protected route", user: req.user });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error("Test error:", err);
    return res.status(500).json({ error: "Internal server error" });
  });

  return app;
};

describe("JWT Access Control Tests", () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("Case 1: Missing token returns 401", () => {
    it("should return 401 when Authorization header is missing", async () => {
      const response = await request(app).get("/protected");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Access token missing");
    });

    it("should return 401 when Authorization header is empty", async () => {
      const response = await request(app)
        .get("/protected")
        .set("Authorization", "");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Access token missing");
    });

    it("should return 401 when Authorization header has no Bearer token", async () => {
      const response = await request(app)
        .get("/protected")
        .set("Authorization", "Bearer");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Access token missing");
    });
  });

  describe("Case 2: Expired token rejected", () => {
    it("should reject an expired token", async () => {
      // Create an expired token by manually signing with immediate expiration
      const expiredToken = await new Promise(async (resolve, reject) => {
        try {
          // We'll create a very short-lived token and wait for it to expire
          const { SignJWT } = await import("jose");
          const { privateKey } = await import("../src/utils/env.js");
          const { importPKCS8 } = await import("jose");

          const privateKeyObj = await importPKCS8(privateKey, "RS256");

          const token = await new SignJWT({ userId: "test-user", tokenVersion: 1 })
            .setProtectedHeader({ alg: "RS256" })
            .setIssuedAt()
            .setExpirationTime("0s") // Immediate expiration
            .sign(privateKeyObj);

          resolve(token);
        } catch (error) {
          reject(error);
        }
      });

      // Wait a moment to ensure token is expired
      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid or expired token");
    });
  });

  describe("Case 3: Modified token rejected", () => {
    it("should reject a token with modified payload", async () => {
      // Create a valid token
      const validToken = await signAccessToken({
        userId: "test-user",
        tokenVersion: 1,
      });

      // Modify the token by changing the signature part
      const parts = validToken.split(".");
      if (parts.length === 3) {
        // Corrupt the signature (last part)
        const modifiedSignature = Buffer.from("invalid-signature").toString(
          "base64"
        );
        const modifiedToken = `${parts[0]}.${parts[1]}.${modifiedSignature}`;

        const response = await request(app)
          .get("/protected")
          .set("Authorization", `Bearer ${modifiedToken}`);

        expect(response.status).toBe(401);
        expect(response.body.error).toBe("Invalid or expired token");
      }
    });

    it("should reject a token with modified header", async () => {
      // Create a valid token
      const validToken = await signAccessToken({
        userId: "test-user",
        tokenVersion: 1,
      });

      // Modify the header part
      const parts = validToken.split(".");
      if (parts.length === 3) {
        const modifiedHeader = Buffer.from(
          JSON.stringify({ alg: "HS256" }) // Change algorithm
        ).toString("base64url");
        const modifiedToken = `${modifiedHeader}.${parts[1]}.${parts[2]}`;

        const response = await request(app)
          .get("/protected")
          .set("Authorization", `Bearer ${modifiedToken}`);

        expect(response.status).toBe(401);
        expect(response.body.error).toBe("Invalid or expired token");
      }
    });

    it("should reject completely invalid token format", async () => {
      const response = await request(app)
        .get("/protected")
        .set("Authorization", "Bearer invalid.token.format");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid or expired token");
    });
  });

  describe("Case 4: Valid token accepted", () => {
    it("should accept a valid token and grant access", async () => {
      const validToken = await signAccessToken({
        userId: "test-user",
        tokenVersion: 1,
      });

      const response = await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Protected route");
      expect(response.body.user).toBeDefined();
      expect(response.body.user.userId).toBe("test-user");
    });
  });
});
