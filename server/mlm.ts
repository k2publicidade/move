import { ASSOCIATE_BONUS_CAP_CENTS, ASSOCIATE_PLAN_PRICE_CENTS, DIRECT_REFERRAL_BPS, isBonusEligibleParticipant, type AssociatePlanStatus, type MembershipType } from '../src/businessPlan.js'

export type MlmUser = { id: string; username: string; email: string; role: 'ADMIN_MASTER' | 'ASSOCIATE'; status: 'PENDING' | 'ACTIVE' | 'BLOCKED'; sponsorId: string | null; inviteCode: string; membershipType?: MembershipType; associatePlanStatus?: AssociatePlanStatus; associatePlanAmountCents?: number; bonusCapCents?: number; associatePlanPaidAt?: string; shareholderSince?: string; [key: string]: unknown }
export type RuleLevel = { level: number; bps: number }
export type BonusLedgerEntry = { id: string; userId: string; amountCents: number; status: string; type: string; reversalOfId?: string; reason?: string; createdAt?: string; [key: string]: unknown }
export type NetworkTree = MlmUser & { children: NetworkTree[] }

export function validateCommissionLevels(input: unknown): RuleLevel[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) throw new Error('Commission rule must have between 1 and 20 levels')
  const levels = input.map((item: any) => ({ level: Number(item?.level), bps: Number(item?.bps) }))
  if (levels.some(item => !Number.isInteger(item.level) || item.level < 1 || item.level > 20 || !Number.isInteger(item.bps) || item.bps < 1 || item.bps > 10000)) throw new Error('Commission levels and basis points are invalid')
  if (new Set(levels.map(item => item.level)).size !== levels.length) throw new Error('Commission levels must be unique')
  if (levels.reduce((sum, item) => sum + item.bps, 0) > 10000) throw new Error('Total commission cannot exceed 100%')
  return levels.sort((a, b) => a.level - b.level)
}

export function validateCommissionPlan(levelsInput: unknown, directReferralBpsInput: unknown = DIRECT_REFERRAL_BPS) {
  const levels = validateCommissionLevels(levelsInput)
  const directReferralBps = Number(directReferralBpsInput)
  if (!Number.isInteger(directReferralBps) || directReferralBps < 1 || directReferralBps > 10000) throw new Error('Direct referral basis points are invalid')
  if (directReferralBps + levels.reduce((sum, item) => sum + item.bps, 0) > 10000) throw new Error('Total commission cannot exceed 100%')
  return { directReferralBps, levels }
}

export function buildNetworkTree(users: MlmUser[], rootId: string, depth: number) {
  const byId = new Map(users.map(user => [user.id, user]))
  const root = byId.get(rootId)
  if (!root) throw new Error('network root not found')
  const maxDepth = Math.max(0, Math.floor(depth))
  const build = (user: MlmUser, level: number, path: Set<string>): NetworkTree => {
    if (path.has(user.id)) throw new Error('network contains a sponsor cycle')
    const nextPath = new Set(path).add(user.id)
    return {
      ...user,
      children: level < maxDepth ? users.filter(candidate => candidate.sponsorId === user.id).map(candidate => build(candidate, level + 1, nextPath)) : [],
    }
  }
  return build(root, 0, new Set())
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
  const username = input.username.trim().toLowerCase(), email = input.email.trim().toLowerCase(), name = input.name.trim()
  if (username.length < 3 || !/^[a-z0-9._-]+$/.test(username) || !email.includes('@') || !name || !input.passwordHash) throw new Error('registration data is invalid')
  if (users.some(u => u.username.toLowerCase() === username || u.email.toLowerCase() === email)) throw new Error('username or email already exists')
  const sponsor = users.find(u => u.inviteCode.toLowerCase() === input.inviteCode.trim().toLowerCase())
  if (!sponsor || sponsor.status !== 'ACTIVE') throw new Error('active sponsor not found')
  const prefix = username.replace(/[^a-z0-9]/g, '').slice(0, 14) || 'gomove'
  let inviteCode = ''
  do inviteCode = `${prefix}${Math.random().toString(36).slice(2, 8)}`; while (users.some(user => user.inviteCode.toLowerCase() === inviteCode.toLowerCase()))
  return { id: id(), username, email, passwordHash: input.passwordHash, name, role: 'ASSOCIATE', status: 'PENDING', sponsorId: sponsor.id, inviteCode, membershipType: 'ASSOCIATE', associatePlanStatus: 'PENDING', associatePlanAmountCents: ASSOCIATE_PLAN_PRICE_CENTS, bonusCapCents: ASSOCIATE_BONUS_CAP_CENTS }
}

export function wouldCreateSponsorCycle(users: Pick<MlmUser, 'id' | 'sponsorId'>[], userId: string, sponsorId: string | null): boolean {
  if (!sponsorId || userId === sponsorId) return sponsorId === userId
  const byId = new Map(users.map(u => [u.id, u]))
  let current = byId.get(sponsorId)
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) { if (current.id === userId) return true; seen.add(current.id); current = current.sponsorId ? byId.get(current.sponsorId) : undefined }
  return false
}

export function calculateBonuses(users: MlmUser[], investorId: string, eventId: string, amountCents: number, levels: RuleLevel[], directReferralBps = DIRECT_REFERRAL_BPS) {
  if (!Number.isInteger(amountCents) || amountCents <= 0 || !eventId.trim()) throw new Error('Commission event is invalid')
  const byId = new Map(users.map(u => [u.id, u])), investor = byId.get(investorId)
  if (!investor) throw new Error('Investor not found')
  const plan = validateCommissionPlan(levels, directReferralBps), rules = plan.levels, byLevel = new Map(rules.map(rule => [rule.level, rule]))
  const out: { userId: string; level: number; amountCents: number; type: 'DIRECT_REFERRAL' | 'UNILEVEL'; idempotencyKey: string }[] = []
  let current = byId.get(investorId)
  for (let level = 1; level <= rules[rules.length - 1].level; level += 1) {
    current = current?.sponsorId ? byId.get(current.sponsorId) : undefined
    if (!current) break
    const rule = byLevel.get(level)
    if (!isBonusEligibleParticipant(current)) continue
    if (level === 1) out.push({ userId: current.id, level, amountCents: Math.floor(amountCents * plan.directReferralBps / 10000), type: 'DIRECT_REFERRAL', idempotencyKey: `${eventId}:${current.id}:DIRECT_REFERRAL` })
    if (rule) out.push({ userId: current.id, level, amountCents: Math.floor(amountCents * rule.bps / 10000), type: 'UNILEVEL', idempotencyKey: `${eventId}:${current.id}:UNILEVEL:${level}` })
  }
  return out
}

export function calculateProfitabilityBonuses(users: MlmUser[], participantId: string, eventId: string, amountCents: number, levels: RuleLevel[]) {
  if (!Number.isInteger(amountCents) || amountCents <= 0 || !eventId.trim()) throw new Error('Daily profitability event is invalid')
  const participant = users.find(user => user.id === participantId)
  if (!participant) throw new Error('Participant not found')
  const rules = validateCommissionLevels(levels), byId = new Map(users.map(user => [user.id, user])), byLevel = new Map(rules.map(rule => [rule.level, rule]))
  const out: { userId: string; level: number; amountCents: number; type: 'UNILEVEL_PROFITABILITY'; idempotencyKey: string }[] = []
  let current: MlmUser | undefined = participant
  for (let level = 1; level <= rules[rules.length - 1].level; level += 1) {
    current = current?.sponsorId ? byId.get(current.sponsorId) : undefined
    if (!current) break
    const rule = byLevel.get(level)
    if (!rule || !isBonusEligibleParticipant(current)) continue
    const bonusCents = Math.floor(amountCents * rule.bps / 10_000)
    if (bonusCents > 0) out.push({ userId: current.id, level, amountCents: bonusCents, type: 'UNILEVEL_PROFITABILITY', idempotencyKey: `${eventId}:${current.id}:UNILEVEL_PROFITABILITY:${level}` })
  }
  return out
}
