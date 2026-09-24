import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

let prisma: PrismaClient | undefined

export function getPrisma() {
  if (!prisma) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL is required to create rooms')
    const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 })
    prisma = new PrismaClient({ adapter })
  }
  return prisma
}

export async function disconnectDatabase() {
  await prisma?.$disconnect()
}
