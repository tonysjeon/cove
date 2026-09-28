export type UnreadState = { seen: Set<string>; unread: Set<string> }
export type UnreadEvent = { type: 'received'; id: string; open: boolean } | { type: 'read' } | { type: 'sent'; id: string }

export function updateUnread(state: UnreadState, event: UnreadEvent): UnreadState {
  if (event.type === 'read') return state.unread.size ? { ...state, unread: new Set() } : state
  if (event.type === 'sent') {
    const unread = new Set(state.unread)
    unread.delete(event.id)
    return { seen: new Set(state.seen).add(event.id), unread }
  }
  if (state.seen.has(event.id)) return state
  return {
    seen: new Set(state.seen).add(event.id),
    unread: event.open ? state.unread : new Set(state.unread).add(event.id),
  }
}
