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
  const fBingo = await prisma.functionality.upsert({
    where: { code: "bo.bingo.manage" },
    create: {
      code: "bo.bingo.manage",
      name: "Manage bingos",
      module: "game",
    },
    update: {},
  });
  const fRoom = await prisma.functionality.upsert({
    where: { code: "bo.room.manage" },
    create: {
      code: "bo.room.manage",
      name: "Manage rooms",
      module: "game",
    },
    update: { name: "Manage rooms" },
  });
  const fPlayers = await prisma.functionality.upsert({
    where: { code: "bo.players.manage" },
    create: {
      code: "bo.players.manage",
      name: "Manage players and wallet credits",
      module: "game",
    },
    update: { name: "Manage players and wallet credits" },
  });
  const fPayments = await prisma.functionality.upsert({
    where: { code: "bo.payments.manage" },
    create: {
      code: "bo.payments.manage",
      name: "Manage deposit payment methods",
      module: "admin",
    },
    update: { name: "Manage deposit payment methods", module: "admin" },
  });

  await prisma.paymentMethod.upsert({
    where: {
      providerId_externalId: { providerId: "mixer-gaming", externalId: "84" },
    },
    create: {
      id: "a1000000-0000-4000-8000-000000000084",
      providerId: "mixer-gaming",
      externalId: "84",
      name: "PaymentTest",
      currencyCode: "ARS",
      minCents: 100,
      maxCents: 50_000_000,
      active: true,
      sortOrder: 0,
    },
    update: {
      name: "PaymentTest",
      minCents: 100,
      maxCents: 50_000_000,
    },
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
            { functionality: { connect: { id: fBingo.id } } },
            { functionality: { connect: { id: fRoom.id } } },
            { functionality: { connect: { id: fPlayers.id } } },
            { functionality: { connect: { id: fPayments.id } } },
          ],
        },
      },
      include: { functionalities: true },
    });
    console.log("Created role admin");
  }

  /** Siempre enlazar funcionalidades por seed (p. ej. nuevas como Bingo) sin duplicar filas. */
  await prisma.roleFunctionality.createMany({
    data: [
      { roleId: adminRole.id, functionalityId: fUsers.id },
      { roleId: adminRole.id, functionalityId: fRoles.id },
      { roleId: adminRole.id, functionalityId: fFunc.id },
      { roleId: adminRole.id, functionalityId: fBingo.id },
      { roleId: adminRole.id, functionalityId: fRoom.id },
      { roleId: adminRole.id, functionalityId: fPlayers.id },
      { roleId: adminRole.id, functionalityId: fPayments.id },
    ],
    skipDuplicates: true,
  });

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
