import { randomInt } from 'node:crypto'
import { getPrisma } from '../db/prisma.js'
import { Prisma } from '../generated/prisma/client.js'

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRoomCode() {
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('')
}

export async function createRoom(name: string) {
  const prisma = getPrisma()
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await prisma.room.create({
        data: { name, code: generateRoomCode() },
        select: { code: true, name: true },
      })
    } catch (error) {
      // The unique database constraint also protects concurrent room creation.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue
      throw error
    }
  }
  throw new Error('Unable to allocate a unique room code')
}
