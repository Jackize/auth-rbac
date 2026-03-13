import express from "express";
import { authorize } from "../../middleware/authorize.js";
import { rateLimitLogin } from "../../middleware/rate.limit.login.js";
import { requirePermission } from "../../middleware/require.permission.js";
import { validate } from "../../middleware/validate.middleware.js";
import RESOURCE_PERMISSIONS from "../../permissions/permission.js";
import { generateRefreshToken, revokeAllRefreshTokens, revokeRefreshToken } from "../refresh/refresh.controller.js";
import { refreshTokenSchema } from "../refresh/refresh.validation.js";
import { getProfile, login, register } from "./auth.controller.js";
import { loginSchema, registerSchema } from "./auth.validation.js";

const router = express.Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", rateLimitLogin, validate(loginSchema), login);
router.get("/me", authorize, requirePermission(RESOURCE_PERMISSIONS.user.read), getProfile)

// refresh token route
router.post("/refresh-token", validate(refreshTokenSchema), generateRefreshToken);
router.post("/logout", validate(refreshTokenSchema), revokeRefreshToken);
router.post("/logout-all", authorize, revokeAllRefreshTokens)

export default router;