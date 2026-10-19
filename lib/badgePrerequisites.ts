// Pure prerequisite-graph rules. No Prisma here so the badge wizard can run the
// same cycle check client-side that the API enforces.
//
// An edge A -> B means "A must be COMPLETED before a student can start B". Edges
// always connect badge family roots (templates); course copies resolve through
// their root (see lib/badges/badge-prerequisites.service.ts).

export type BadgeEdge = {
  fromBadgeId: string;
  toBadgeId: string;
};

export type PrerequisiteSetResult =
  | { ok: true }
  | { ok: false; reason: 'SELF' | 'DUPLICATE' | 'CYCLE'; badgeId: string };

function buildOutgoing(edges: BadgeEdge[]) {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoing.get(edge.fromBadgeId);
    if (targets) {
      targets.push(edge.toBadgeId);
    } else {
      outgoing.set(edge.fromBadgeId, [edge.toBadgeId]);
    }
  }
  return outgoing;
}

function canReach(outgoing: Map<string, string[]>, start: string, goal: string) {
  const seen = new Set<string>();
  const stack = [start];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === goal) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(outgoing.get(current) ?? []));
  }

  return false;
}

// Adding from -> to closes a loop when to can already reach from.
export function wouldCreateCycle(edges: BadgeEdge[], fromBadgeId: string, toBadgeId: string) {
  if (fromBadgeId === toBadgeId) return true;
  return canReach(buildOutgoing(edges), toBadgeId, fromBadgeId);
}

// Replaces every prerequisite of badgeId with nextPrereqIds and checks the result
// is still a DAG. Other badges' edges are left as they are.
export function validatePrerequisiteSet(
  edges: BadgeEdge[],
  badgeId: string,
  nextPrereqIds: string[]
): PrerequisiteSetResult {
  const seen = new Set<string>();
  for (const prereqId of nextPrereqIds) {
    if (prereqId === badgeId) return { ok: false, reason: 'SELF', badgeId: prereqId };
    if (seen.has(prereqId)) return { ok: false, reason: 'DUPLICATE', badgeId: prereqId };
    seen.add(prereqId);
  }

  const outgoing = buildOutgoing(edges.filter((edge) => edge.toBadgeId !== badgeId));
  for (const prereqId of nextPrereqIds) {
    if (canReach(outgoing, badgeId, prereqId)) {
      return { ok: false, reason: 'CYCLE', badgeId: prereqId };
    }
  }

  return { ok: true };
}

// Candidates the wizard may offer as prerequisites of badgeId: not itself and not
// anything that already depends on it (directly or through a chain).
export function selectablePrerequisiteIds(edges: BadgeEdge[], badgeId: string | null, candidateIds: string[]) {
  if (!badgeId) return candidateIds;
  const outgoing = buildOutgoing(edges.filter((edge) => edge.toBadgeId !== badgeId));
  return candidateIds.filter((candidateId) => candidateId !== badgeId && !canReach(outgoing, badgeId, candidateId));
}

// The lock only stops a student starting a badge. Anyone with progress on it is
// grandfathered, so adding a prerequisite or resetting one never strands work.
export function isPrerequisiteLocked({ unmetCount, started }: { unmetCount: number; started: boolean }) {
  return unmetCount > 0 && !started;
}

export function formatBadgeNameList(names: string[]) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
