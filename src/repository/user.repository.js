import { prisma } from "../infra/prisma.js";
import BaseRepository from "./base.repository.js";

class UserRepository extends BaseRepository {
    constructor() {
        super(prisma.user)
    }

    async findByEmail(email) {
        return this.model.findFirst({
            where: {
                email: {
                    equals: email.toLowerCase(),
                    mode: 'insensitive'
                }
            }
        })
    }

    async incrementTokenVersion(id) {
        return this.model.update({
            where: { id },
            data: {
                tokenVersion: {
                    increment: 1
                }
            }
        });
    }

    async getUserPermissions(userId) {
        const user = await this.model.findUnique({
            where: { id: userId },
            select: {
                id: true,
                roles: true
            }
        });
        if (!user) return [];

        const permissions = new Set();
        const results = await Promise.all(
            user.roles.map(role =>
                prisma.rolePermission.findMany({
                    where: { roleId: role.roleId },
                    select: {
                        permission: {
                            select: { name: true }
                        }
                    }
                })
            )
        );

        results.forEach(rolePermissions => {
            rolePermissions.forEach(p => {
                permissions.add(p.permission.name);
            });
        });
        return Array.from(permissions);
    }

    async getUserRole(userId) {
        const user = await this.model.findUnique({
            where: { id: userId },
            select: {id: true, roles: true }
        })
        const results = await Promise.all(
            user.roles.map(role => prisma.role.findUnique({
                where: { id: role.roleId },
                select: { name: true }
            }))
        )
        return results.map(r => r.name);
    }
}

export const userRepository = new UserRepository();