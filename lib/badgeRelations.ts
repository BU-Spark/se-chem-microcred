// Pure badge-relation graph rules. No Prisma here so the badge wizard can run the
// same cycle check client-side that the API enforces.
//
// Edges always connect badge family roots (templates); course copies resolve
// through their root (see lib/badges/badge-relations.service.ts). Each relation
// type is its own graph, checked for cycles on its own:
//   PREREQUISITE  A -> B  A must be COMPLETED before a student can start B
//   SATISFIES     A -> B  completing A also earns B (in the same course)

export type BadgeEdge = {
  fromBadgeId: string;
  toBadgeId: string;
};

// Which side of the edited badge a relation set lives on: its prerequisites are
// incoming (X -> badge), the badges it satisfies are outgoing (badge -> Y).
export type RelationDirection = 'incoming' | 'outgoing';

export type RelationSetResult = { ok: true } | { ok: false; reason: 'SELF' | 'DUPLICATE' | 'CYCLE'; badgeId: string };

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

// The graph with badgeId's edges on the edited side removed, plus a check for
// whether linking badgeId to otherId on that side would close a loop.
function relationLoopCheck(edges: BadgeEdge[], badgeId: string, direction: RelationDirection) {
  const kept = edges.filter((edge) =>
    direction === 'incoming' ? edge.toBadgeId !== badgeId : edge.fromBadgeId !== badgeId
  );
  const outgoing = buildOutgoing(kept);
  return (otherId: string) =>
    direction === 'incoming' ? canReach(outgoing, badgeId, otherId) : canReach(outgoing, otherId, badgeId);
}

// Replaces badgeId's relations on one side with nextIds and checks the result is
// still a DAG. Other badges' edges are left as they are.
export function validateRelationSet(
  edges: BadgeEdge[],
  badgeId: string,
  nextIds: string[],
  direction: RelationDirection = 'incoming'
): RelationSetResult {
  const seen = new Set<string>();
  for (const otherId of nextIds) {
    if (otherId === badgeId) return { ok: false, reason: 'SELF', badgeId: otherId };
    if (seen.has(otherId)) return { ok: false, reason: 'DUPLICATE', badgeId: otherId };
    seen.add(otherId);
  }

  const closesLoop = relationLoopCheck(edges, badgeId, direction);
  for (const otherId of nextIds) {
    if (closesLoop(otherId)) return { ok: false, reason: 'CYCLE', badgeId: otherId };
  }

  return { ok: true };
}

// Candidates the wizard may offer for badgeId's relations on one side: not itself
// and nothing that would close a loop (directly or through a chain).
export function selectableRelationIds(
  edges: BadgeEdge[],
  badgeId: string | null,
  candidateIds: string[],
  direction: RelationDirection = 'incoming'
) {
  if (!badgeId) return candidateIds;
  const closesLoop = relationLoopCheck(edges, badgeId, direction);
  return candidateIds.filter((candidateId) => candidateId !== badgeId && !closesLoop(candidateId));
}

// Which badges a student holds through SATISFIES edges, given the ones they earned
// themselves. Returns target -> the badge that awards it. Follows chains (Sprint
// earns Run earns Walk); a badge earned on its own is never in the result.
export function resolveSatisfiedBadges(edges: BadgeEdge[], ownCompletedIds: Iterable<string>) {
  const outgoing = buildOutgoing(edges);
  const own = new Set(ownCompletedIds);
  const satisfiedBy = new Map<string, string>();
  const queue = [...own];

  while (queue.length > 0) {
    const sourceId = queue.shift() as string;
    for (const targetId of outgoing.get(sourceId) ?? []) {
      if (own.has(targetId) || satisfiedBy.has(targetId)) continue;
      satisfiedBy.set(targetId, sourceId);
      queue.push(targetId);
    }
  }

  return satisfiedBy;
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
