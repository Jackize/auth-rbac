import crypto from "crypto";
import { refreshTokenRepository } from "../repository/refreshToken.repository.js";

export const signRefreshToken = async (userId, deviceId) => {
    const token = crypto.randomBytes(64).toString('hex');
    await refreshTokenRepository.create({ tokenHash: token, userId, deviceId });
    return token;
}

export const invalidateRefreshTokens = async (userId) => {
    await refreshTokenRepository.deleteByUserId(userId);
}

export const verifyRefreshToken = async (token) => {
    const record = await refreshTokenRepository.findByToken(token);
    // Check token is revoked
    if (record && record.revoked) {
        return { userId: record.userId, revoked: true };
    }
    // Check token existence,  expiration
    if (record.expiresAt < new Date()) {
        return null;
    }
    return record ? { userId: record.userId, revoked: false } : null;
}