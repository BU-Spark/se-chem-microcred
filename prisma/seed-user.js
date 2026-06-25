/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Additive seed: upserts a single user without wiping anything.
 * Safe to run against the shared DB. Run with: node prisma/seed-user.js
 */
const { PrismaClient, AvatarBase, AvatarFace, AvatarAccessory } = require('@prisma/client');

const prisma = new PrismaClient();

// Edit these to seed a different person.
const EMAIL = 'kzingade@bu.edu';
const NAME = 'Kush Zingade';

async function main() {
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { name: NAME },
    create: { email: EMAIL, name: NAME },
  });

  await prisma.avatarSetting.upsert({
    where: { studentId: user.id },
    update: {},
    create: {
      studentId: user.id,
      base: AvatarBase.SAPPHIRE,
      face: AvatarFace.SMILE,
      accessory: AvatarAccessory.LEAF,
    },
  });

  await prisma.studentAnalytics.upsert({
    where: { studentId: user.id },
    update: {},
    create: { studentId: user.id },
  });

  console.log(`Upserted user ${EMAIL} (id: ${user.id}) — no existing data was modified.`);
}

main()
  .catch((error) => {
    console.error('Additive seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
