/**
 * Run from api/: npm run db:seed
 * Loads api/.env (DATABASE_URL, SEED_*).
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  const fUsers = await prisma.functionality.upsert({
    where: { code: "bo.users.manage" },
    create: {
      code: "bo.users.manage",
      name: "Manage backoffice users",
      module: "admin",
    },
    update: {},
  });
  const fRoles = await prisma.functionality.upsert({
    where: { code: "bo.roles.manage" },
    create: {
      code: "bo.roles.manage",
      name: "Manage roles",
      module: "admin",
    },
    update: {},
  });
  const fFunc = await prisma.functionality.upsert({
    where: { code: "bo.functionalities.manage" },
    create: {
      code: "bo.functionalities.manage",
      name: "Manage functionalities catalog",
      module: "admin",
    },
    update: {},
  });

  let adminRole = await prisma.role.findUnique({
    where: { code: "admin" },
    include: { functionalities: true },
  });

  if (!adminRole) {
    adminRole = await prisma.role.create({
      data: {
        code: "admin",
        name: "Administrator",
        description: "Full backoffice access",
        functionalities: {
          create: [
            { functionality: { connect: { id: fUsers.id } } },
            { functionality: { connect: { id: fRoles.id } } },
            { functionality: { connect: { id: fFunc.id } } },
          ],
        },
      },
      include: { functionalities: true },
    });
    console.log("Created role admin");
  } else if (adminRole.functionalities.length === 0) {
    await prisma.roleFunctionality.createMany({
      data: [
        { roleId: adminRole.id, functionalityId: fUsers.id },
        { roleId: adminRole.id, functionalityId: fRoles.id },
        { roleId: adminRole.id, functionalityId: fFunc.id },
      ],
      skipDuplicates: true,
    });
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash,
      displayName: "Administrator",
      active: true,
      roles: {
        create: [{ role: { connect: { id: adminRole!.id } } }],
      },
    },
    update: {
      passwordHash,
      active: true,
    },
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: user.id, roleId: adminRole!.id },
    },
    create: { userId: user.id, roleId: adminRole!.id },
    update: {},
  });

  console.log("Seed OK:", { user: user.email, role: adminRole!.code });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
