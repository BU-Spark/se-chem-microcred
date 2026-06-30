/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Default Prisma seed entrypoint.
 *
 * The project now uses the CHEM101 seed as the single demo data source. Keep
 * this thin wrapper so `prisma db seed` and `npm run db:seed` stay familiar,
 * while avoiding a second demo world with different users/permissions.
 */
require('./seed-playtest');
