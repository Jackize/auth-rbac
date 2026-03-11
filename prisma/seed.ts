// load .env so DATABASE_URL is available when the script runs directly
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { hashPassword } from "../src/utils/password.js";

// debug: ensure the database URL is available when the script runs
console.log("DATABASE_URL from seed.ts:", process.env.DATABASE_URL)

// the rest of the application passes an adapter object when constructing
// PrismaClient. we need to do the same here so the client knows which
// database engine to talk to (otherwise Prisma 7 will complain about missing
// adapter/accelerateUrl).
const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {

  await prisma.user.createMany({
    data: [
      {
        email: "admin@example.com",
        password: await hashPassword("password123"),
      },
      {
        email: "editor@example.com",
        password: await hashPassword("password123"),
      },
      {
        email: "viewer@example.com",
        password: await hashPassword("password123"),
      },
      {
        email: "contributor@example.com",
        password: await hashPassword("password123"),
      },
      {
        email: "developer@example.com",
        password: await hashPassword("password123"),
      },
      {
        email: "moderator@example.com",
        password: await hashPassword("password123"),
      },
      {
        email: "user@example.com",
        password: await hashPassword("password123"),
      },
      {
        email: "developer@example.com",
        password: await hashPassword("password123"),
      }
    ],
    skipDuplicates: true
  })

  await prisma.role.createMany({
    data: [
      {
        name: "admin",
        description: "System administrator"
      },
      {
        name: "editor",
        description: "Can edit content"
      },
      {
        name: "viewer",
        description: "Can view content"
      },
      {
        name: "contributor",
        description: "Can contribute content"
      },
      {
        name: "moderator",
        description: "Can moderate content"
      },
      {
        name: "user",
        description: "Regular user"
      },
      {
        name: "developer",
        description: "Developer with access to API"
      }
    ],
    skipDuplicates: true
  })

  await prisma.permission.createMany({
    data: [
      { name: "user:read" },
      { name: "user:update" },
      { name: "user:delete" }
    ],
    skipDuplicates: true
  })

  const adminRole = await prisma.role.findUnique({
    where: { name: "admin" },
    select: { id: true }
  })

  const permissions = await prisma.permission.findMany()

  await prisma.rolePermission.createMany({
    data: permissions.map((p: any) => ({
      roleId: adminRole!.id,
      permissionId: p.id
    }))
  })

  const adminUser = await prisma.user.findUnique({
    where: { email: "admin@example.com" },
    select: { id: true }
  })

  await prisma.userRole.create({
    data: {
      userId: adminUser!.id,
      roleId: adminRole!.id
    }
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())