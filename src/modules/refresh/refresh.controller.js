import { enforceRefreshRateLimit } from "../../middleware/rate.limit.refresh.js";
import { refreshTokenRepository } from "../../repository/refreshToken.repository.js";
import { userRepository } from "../../repository/user.repository.js";
import { signAccessToken } from "../../utils/jwt.js";
import {
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/refreshToken.js";

export const generateRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token missing" });
    }
    // find refresh token in database (single verify; rate limit uses same userId)
    const isRefreshTokenValid = await verifyRefreshToken(refreshToken);

    // 10 attempts/minute per user (rate:refresh:<userId>); anon by IP if token unknown
    const allowed = await enforceRefreshRateLimit(
      isRefreshTokenValid?.userId ?? null,
      req,
      res,
    );
    if (!allowed) return;

    if (isRefreshTokenValid && isRefreshTokenValid.revoked) {
      await refreshTokenRepository.revokeTokensByUserId(
        isRefreshTokenValid.userId,
      );
      return res.status(401).json({ error: "Refresh token revoked" });
    }
    if (!isRefreshTokenValid) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }
    // find user by id in refresh token
    const user = await userRepository.findById(isRefreshTokenValid.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate new access token and refresh token
    const newAccessToken = await signAccessToken({
      userId: isRefreshTokenValid.userId,
      tokenVersion: user.tokenVersion,
    });

    // save new refresh token to database
    const deviceId = req.headers["user-agent"] || "unknown-device";
    const newRefreshToken = await signRefreshToken(
      isRefreshTokenValid.userId,
      deviceId,
    );

    // revoke old refresh token
    await refreshTokenRepository.revokeTokenByToken(refreshToken);

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
};

export const getActiveRefreshTokens = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const activeTokens =
      await refreshTokenRepository.findActiveTokensByUserId(userId);
    res.json(activeTokens);
  } catch (error) {
    next(error);
  }
};

export const revokeRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token missing" });
    }

    await refreshTokenRepository.revokeTokenByToken(refreshToken);

    res.json({ message: "Refresh token revoked successfully" });
  } catch (error) {
    next(error);
  }
};

export const revokeAllRefreshTokens = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    await refreshTokenRepository.revokeTokensByUserId(userId);
    await userRepository.incrementTokenVersion(userId);
    req.log?.info({ userId, event: "logout" }, "User logged out");
    res.json({ message: "All refresh tokens revoked successfully" });
  } catch (error) {
    next(error);
  }
};
