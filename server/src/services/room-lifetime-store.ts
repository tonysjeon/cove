import { getPrisma } from '../db/prisma.js'
import type { RoomLifetimeStore } from './room-lifetime.js'

export const postgresRoomLifetimeStore: RoomLifetimeStore = {
  read: code => getPrisma().room.findUnique({ where: { code }, select: { code: true, name: true, expiresAt: true } }),
  reserved: async code => !!await getPrisma().roomCode.findUnique({ where: { code } }),
  occupied: async code => { await getPrisma().room.update({ where: { code }, data: { expiresAt: null } }) },
  empty: async (code, expiresAt) => {
    await getPrisma().room.updateMany({ where: { code, expiresAt: null }, data: { expiresAt } })
  },
  recover: async expiresAt => {
    await getPrisma().room.updateMany({ where: { expiresAt: null }, data: { expiresAt } })
  },
  expired: async now => (await getPrisma().room.findMany({ where: { expiresAt: { lte: now } }, select: { code: true } })).map(room => room.code),
  remove: async (code, now) => {
    await getPrisma().room.deleteMany({ where: { code, expiresAt: { lte: now } } })
  },
}
