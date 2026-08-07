import { ASSOCIATE_BONUS_CAP_CENTS, ASSOCIATE_PLAN_PRICE_CENTS, DIRECT_REFERRAL_BPS, isBonusEligibleParticipant } from '../src/businessPlan.js';
export function validateCommissionLevels(input) {
    if (!Array.isArray(input) || input.length === 0 || input.length > 20)
        throw new Error('Commission rule must have between 1 and 20 levels');
    const levels = input.map((item) => ({ level: Number(item?.level), bps: Number(item?.bps) }));
    if (levels.some(item => !Number.isInteger(item.level) || item.level < 1 || item.level > 20 || !Number.isInteger(item.bps) || item.bps < 1 || item.bps > 10000))
        throw new Error('Commission levels and basis points are invalid');
    if (new Set(levels.map(item => item.level)).size !== levels.length)
        throw new Error('Commission levels must be unique');
    if (levels.reduce((sum, item) => sum + item.bps, 0) > 10000)
        throw new Error('Total commission cannot exceed 100%');
    return levels.sort((a, b) => a.level - b.level);
}
export function validateCommissionPlan(levelsInput, directReferralBpsInput = DIRECT_REFERRAL_BPS) {
    const levels = validateCommissionLevels(levelsInput);
    const directReferralBps = Number(directReferralBpsInput);
    if (!Number.isInteger(directReferralBps) || directReferralBps < 1 || directReferralBps > 10000)
        throw new Error('Direct referral basis points are invalid');
    if (directReferralBps + levels.reduce((sum, item) => sum + item.bps, 0) > 10000)
        throw new Error('Total commission cannot exceed 100%');
    return { directReferralBps, levels };
}
export function buildNetworkTree(users, rootId, depth) {
    const byId = new Map(users.map(user => [user.id, user]));
    const root = byId.get(rootId);
    if (!root)
        throw new Error('network root not found');
    const maxDepth = Math.max(0, Math.floor(depth));
    const build = (user, level, path) => {
        if (path.has(user.id))
            throw new Error('network contains a sponsor cycle');
        const nextPath = new Set(path).add(user.id);
        return {
            ...user,
            children: level < maxDepth ? users.filter(candidate => candidate.sponsorId === user.id).map(candidate => build(candidate, level + 1, nextPath)) : [],
        };
    };
    return build(root, 0, new Set());
}
export function transitionBonus(entry, targetStatus) {
    if (entry.status !== 'PENDING')
        throw new Error('Only PENDING bonuses can be approved or cancelled');
    return { ...entry, status: targetStatus };
}
export function createBonusReversal(entries, originalId, reason, id = crypto.randomUUID, timestamp = () => new Date().toISOString()) {
    const original = entries.find(entry => entry.id === originalId);
    if (!original)
        throw new Error('Bonus not found');
    if (original.type === 'REVERSAL' || original.reversalOfId)
        throw new Error('A reversal cannot be reversed');
    if (original.status !== 'APPROVED')
        throw new Error('Only APPROVED bonuses can be reversed');
    if (!reason.trim())
        throw new Error('Reversal reason is required');
    if (entries.some(entry => entry.reversalOfId === original.id))
        throw new Error('Bonus already reversed');
    return { id: id(), userId: original.userId, amountCents: -original.amountCents, status: 'APPROVED', type: 'REVERSAL', reversalOfId: original.id, reason: reason.trim(), createdAt: timestamp() };
}
export function createRegistration(users, input, id = crypto.randomUUID) {
    const username = input.username.trim().toLowerCase(), email = input.email.trim().toLowerCase(), name = input.name.trim();
    if (username.length < 3 || !/^[a-z0-9._-]+$/.test(username) || !email.includes('@') || !name || !input.passwordHash)
        throw new Error('registration data is invalid');
    if (users.some(u => u.username.toLowerCase() === username || u.email.toLowerCase() === email))
        throw new Error('username or email already exists');
    const sponsor = users.find(u => u.inviteCode.toLowerCase() === input.inviteCode.trim().toLowerCase());
    if (!sponsor || sponsor.status !== 'ACTIVE')
        throw new Error('active sponsor not found');
    const prefix = username.replace(/[^a-z0-9]/g, '').slice(0, 14) || 'gomove';
    let inviteCode = '';
    do
        inviteCode = `${prefix}${Math.random().toString(36).slice(2, 8)}`;
    while (users.some(user => user.inviteCode.toLowerCase() === inviteCode.toLowerCase()));
    return { id: id(), username, email, passwordHash: input.passwordHash, name, role: 'ASSOCIATE', status: 'PENDING', sponsorId: sponsor.id, inviteCode, membershipType: 'ASSOCIATE', associatePlanStatus: 'PENDING', associatePlanAmountCents: ASSOCIATE_PLAN_PRICE_CENTS, bonusCapCents: ASSOCIATE_BONUS_CAP_CENTS };
}
export function wouldCreateSponsorCycle(users, userId, sponsorId) {
    if (!sponsorId || userId === sponsorId)
        return sponsorId === userId;
    const byId = new Map(users.map(u => [u.id, u]));
    let current = byId.get(sponsorId);
    const seen = new Set();
    while (current && !seen.has(current.id)) {
        if (current.id === userId)
            return true;
        seen.add(current.id);
        current = current.sponsorId ? byId.get(current.sponsorId) : undefined;
    }
    return false;
}
export function calculateBonuses(users, investorId, eventId, amountCents, levels, directReferralBps = DIRECT_REFERRAL_BPS) {
    if (!Number.isInteger(amountCents) || amountCents <= 0 || !eventId.trim())
        throw new Error('Commission event is invalid');
    const byId = new Map(users.map(u => [u.id, u])), investor = byId.get(investorId);
    if (!investor)
        throw new Error('Investor not found');
    const plan = validateCommissionPlan(levels, directReferralBps), rules = plan.levels, byLevel = new Map(rules.map(rule => [rule.level, rule]));
    const out = [];
    let current = byId.get(investorId);
    for (let level = 1; level <= rules[rules.length - 1].level; level += 1) {
        current = current?.sponsorId ? byId.get(current.sponsorId) : undefined;
        if (!current)
            break;
        const rule = byLevel.get(level);
        if (!isBonusEligibleParticipant(current))
            continue;
        if (level === 1)
            out.push({ userId: current.id, level, amountCents: Math.floor(amountCents * plan.directReferralBps / 10000), type: 'DIRECT_REFERRAL', idempotencyKey: `${eventId}:${current.id}:DIRECT_REFERRAL` });
        if (rule)
            out.push({ userId: current.id, level, amountCents: Math.floor(amountCents * rule.bps / 10000), type: 'UNILEVEL', idempotencyKey: `${eventId}:${current.id}:UNILEVEL:${level}` });
    }
    return out;
}
