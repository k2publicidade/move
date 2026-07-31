export type MlmUser = { id: string; username: string; email: string; role: 'ADMIN_MASTER' | 'ASSOCIATE'; status: 'PENDING' | 'ACTIVE' | 'BLOCKED'; sponsorId: string | null; inviteCode: string; [key: string]: unknown }
export type RuleLevel = { level: number; bps: number }
export type BonusLedgerEntry = { id: string; userId: string; amountCents: number; status: string; type: string; reversalOfId?: string; reason?: string; createdAt?: string; [key: string]: unknown }
export type NetworkTree = MlmUser & { children: NetworkTree[] }

export function buildNetworkTree(users: MlmUser[], rootId: string, depth: number) {
  const byId = new Map(users.map(user => [user.id, user]))
  const root = byId.get(rootId)
  if (!root) throw new Error('network root not found')
  const maxDepth = Math.max(0, Math.floor(depth))
  const build = (user: MlmUser, level: number): NetworkTree => ({
    ...user,
    children: level < maxDepth ? users.filter(candidate => candidate.sponsorId === user.id).map(candidate => build(candidate, level + 1)) : [],
  })
  return build(root, 0)
}

export function transitionBonus(entry: BonusLedgerEntry, targetStatus: 'APPROVED' | 'CANCELLED'): BonusLedgerEntry {
  if (entry.status !== 'PENDING') throw new Error('Only PENDING bonuses can be approved or cancelled')
  return { ...entry, status: targetStatus }
}

export function createBonusReversal(entries: BonusLedgerEntry[], originalId: string, reason: string, id = crypto.randomUUID, timestamp = () => new Date().toISOString()): BonusLedgerEntry {
  const original = entries.find(entry => entry.id === originalId)
  if (!original) throw new Error('Bonus not found')
  if (original.type === 'REVERSAL' || original.reversalOfId) throw new Error('A reversal cannot be reversed')
  if (original.status !== 'APPROVED') throw new Error('Only APPROVED bonuses can be reversed')
  if (!reason.trim()) throw new Error('Reversal reason is required')
  if (entries.some(entry => entry.reversalOfId === original.id)) throw new Error('Bonus already reversed')
  return { id: id(), userId: original.userId, amountCents: -original.amountCents, status: 'APPROVED', type: 'REVERSAL', reversalOfId: original.id, reason: reason.trim(), createdAt: timestamp() }
}

export function createRegistration(users: MlmUser[], input: { username: string; email: string; passwordHash: string; inviteCode: string; name: string }, id = crypto.randomUUID): MlmUser {
  if (users.some(u => u.username.toLowerCase() === input.username.toLowerCase() || u.email.toLowerCase() === input.email.toLowerCase())) throw new Error('username or email already exists')
  const sponsor = users.find(u => u.inviteCode.toLowerCase() === input.inviteCode.toLowerCase())
  if (!sponsor || sponsor.status !== 'ACTIVE') throw new Error('active sponsor not found')
  return { id: id(), username: input.username.trim(), email: input.email.trim().toLowerCase(), passwordHash: input.passwordHash, name: input.name.trim(), role: 'ASSOCIATE', status: 'PENDING', sponsorId: sponsor.id, inviteCode: `${input.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14)}${Math.random().toString(36).slice(2, 6)}` }
}

export function wouldCreateSponsorCycle(users: Pick<MlmUser, 'id' | 'sponsorId'>[], userId: string, sponsorId: string | null): boolean {
  if (!sponsorId || userId === sponsorId) return sponsorId === userId
  const byId = new Map(users.map(u => [u.id, u]))
  let current = byId.get(sponsorId)
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) { if (current.id === userId) return true; seen.add(current.id); current = current.sponsorId ? byId.get(current.sponsorId) : undefined }
  return false
}

export function calculateBonuses(users: MlmUser[], investorId: string, eventId: string, amountCents: number, levels: RuleLevel[]) {
  const byId = new Map(users.map(u => [u.id, u])); const out: { userId: string; level: number; amountCents: number; idempotencyKey: string }[] = []
  let current = byId.get(investorId)
  for (const rule of [...levels].sort((a, b) => a.level - b.level)) {
    current = current?.sponsorId ? byId.get(current.sponsorId) : undefined
    if (!current) break
    if (current.status === 'ACTIVE') out.push({ userId: current.id, level: rule.level, amountCents: Math.floor(amountCents * rule.bps / 10000), idempotencyKey: `${eventId}:${current.id}:${rule.level}` })
  }
  return out
}
