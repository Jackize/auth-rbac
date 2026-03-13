import { prisma } from "../infra/prisma.js";
import {
  lockedUntilDate,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from "../config/loginLock.js";
import BaseRepository from "./base.repository.js";

class UserRepository extends BaseRepository {
  constructor() {
    super(prisma.user);
  }

  async findByEmail(email) {
    return this.model.findFirst({
      where: {
        email: {
          equals: email.toLowerCase(),
          mode: "insensitive",
        },
      },
    });
  }

  async incrementTokenVersion(id) {
    return this.model.update({
      where: { id },
      data: {
        tokenVersion: {
          increment: 1,
        },
      },
    });
  }

  async getUserPermissions(userId) {
    const user = await this.model.findUnique({
      where: { id: userId },
      select: {
        id: true,
        roles: true,
      },
    });
    if (!user) return [];

    const permissions = new Set();
    const results = await Promise.all(
      user.roles.map((role) =>
        prisma.rolePermission.findMany({
          where: { roleId: role.roleId },
          select: {
            permission: {
              select: { name: true },
            },
          },
        }),
      ),
    );

    results.forEach((rolePermissions) => {
      rolePermissions.forEach((p) => {
        permissions.add(p.permission.name);
      });
    });
    return Array.from(permissions);
  }

  /**
   * Ghi nhận login thất bại: tăng failedLoginAttempts; đủ ngưỡng thì LOCKED.
   * @returns {{ locked: boolean, attempts: number }}
   */
  async recordFailedLogin(userId) {
    const updated = await this.model.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true, status: true },
    });

    if (updated.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      const until = lockedUntilDate();
      await this.model.update({
        where: { id: userId },
        data: {
          status: "LOCKED",
          lockedUntil: until,
        },
      });
      return {
        locked: true,
        attempts: updated.failedLoginAttempts,
        lockedUntil: until,
      };
    }
    return { locked: false, attempts: updated.failedLoginAttempts };
  }

  /**
   * Nếu đang LOCKED nhưng đã quá lockedUntil → mở khóa và reset attempts.
   * @returns {Promise<object|null>} user đã cập nhật nếu đã mở khóa; null nếu không cần/không đổi
   */
  async unlockIfExpired(user) {
    if (user.status !== "LOCKED") return null;
    if (!user.lockedUntil) return null;
    const now = new Date();
    if (user.lockedUntil > now) return null;

    return this.model.update({
      where: { id: user.id },
      data: {
        status: "ACTIVE",
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  /** Reset sau khi login thành công */
  async resetFailedLoginAttempts(userId) {
    await this.model.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  async getUserRole(userId) {
    const user = await this.model.findUnique({
      where: { id: userId },
      select: { id: true, roles: true },
    });
    const results = await Promise.all(
      user.roles.map((role) =>
        prisma.role.findUnique({
          where: { id: role.roleId },
          select: { name: true },
        }),
      ),
    );
    return results.map((r) => r.name);
  }
}

export const userRepository = new UserRepository();
