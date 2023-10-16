import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { primsa: PrismaClient }

export const prisma = globalForPrisma.primsa || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.primsa = prisma;

