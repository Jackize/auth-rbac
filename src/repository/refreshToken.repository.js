import { prisma } from "../infra/prisma.js";
import BaseRepository from "./base.repository.js";

class RefreshTokenRepository extends BaseRepository {
  constructor() {
    super(prisma.refreshToken);
  }

  async findByToken(token) {
    return this.model.findFirst({
      where: {
        tokenHash: {
          equals: token,
          mode: "insensitive",
        },
      },
    });
  }

  async findActiveTokensByUserId(userId) {
    return this.model.findMany({
      where: {
        userId,
        revoked: false,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }

  async deleteByToken(token) {
    return this.model.deleteMany({
      where: {
        tokenHash: {
          equals: token,
          mode: "insensitive",
        },
      },
    });
  }

  async deleteByUserId(userId) {
    return this.model.deleteMany({
      where: {
        userId,
      },
    });
  }

  async revokeTokensByUserId(userId) {
    return this.model.updateMany({
      where: {
        userId,
      },
      data: {
        revoked: true,
      },
    });
  }

  async revokeTokenByToken(token) {
    return this.model.updateMany({
      where: {
        tokenHash: {
          equals: token,
          mode: "insensitive",
        },
      },
      data: {
        revoked: true,
      },
    });
  }

  async create({ tokenHash, userId, deviceId }) {
    return this.model.create({
      data: {
        tokenHash,
        userId,
        deviceId,
        revoked: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days expiration
      },
    });
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
