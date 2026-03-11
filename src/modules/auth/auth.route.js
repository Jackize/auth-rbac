import express from "express";
import { authorize } from "../../middleware/authorize.js";
import { requirePermission } from "../../middleware/require.permission.js";
import { validate } from "../../middleware/validate.middleware.js";
import RESOURCE_PERSMISSIONS from "../../permissions/permission.js";
import { generateRefreshToken, revokeAllRefreshTokens, revokeRefreshToken } from "../refresh/refresh.controller.js";
import { getProfile, login, register } from "./auth.controller.js";
import { loginSchema, registerSchema } from "./auth.validation.js";

const router = express.Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.get("/me", authorize, requirePermission(RESOURCE_PERSMISSIONS.user.read), getProfile)

// refresh token route
router.post("/refresh-token", generateRefreshToken)
router.post("/logout", revokeRefreshToken)
router.post("/logout-all", authorize, revokeAllRefreshTokens)

export default router;