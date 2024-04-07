import { env } from '@/env'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { primsa: PrismaClient }

export const prisma =
    globalForPrisma.primsa ||
    new PrismaClient({
        log:
            env.NODE_ENV === 'development'
                ? ['query', 'error', 'warn']
                : ['error']
    })

if (env.NODE_ENV !== 'production') globalForPrisma.primsa = prisma
