import crypto from "crypto";
import { refreshTokenRepository } from "../repository/refreshToken.repository.js";

export const signRefreshToken = async (userId, deviceId) => {
  const token = crypto.randomBytes(64).toString("hex");
  await refreshTokenRepository.create({ tokenHash: token, userId, deviceId });
  return token;
};

export const invalidateRefreshTokens = async (userId) => {
  await refreshTokenRepository.deleteByUserId(userId);
};

export const verifyRefreshToken = async (token) => {
  const record = await refreshTokenRepository.findByToken(token);
  if (!record) return null;
  if (record.revoked) {
    return { userId: record.userId, revoked: true };
  }
  if (record.expiresAt < new Date()) {
    return null;
  }
  return { userId: record.userId, revoked: false };
};
