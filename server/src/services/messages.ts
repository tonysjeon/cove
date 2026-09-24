import { getPrisma } from '../db/prisma.js'

export async function saveMessage(roomCode: string, senderName: string, content: string) {
  const message = await getPrisma().message.create({
    data: { room: { connect: { code: roomCode } }, senderName, content },
  })
  return { ...message, createdAt: message.createdAt.toISOString() }
}

export async function getRecentMessages(roomCode: string) {
  const messages = await getPrisma().message.findMany({
    where: { room: { code: roomCode } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
  })
  return messages.reverse().map(message => ({ ...message, createdAt: message.createdAt.toISOString() }))
}
