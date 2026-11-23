// Section names are compared trimmed and case-insensitively; the first spelling seen is the one kept.
export function sectionKey(name: string) {
  return name.trim().toLowerCase();
}

export function uniqueSections(names: Iterable<string>) {
  const byKey = new Map<string, string>();
  for (const name of names) {
    const key = sectionKey(name);
    if (key && !byKey.has(key)) byKey.set(key, name.trim());
  }
  return Array.from(byKey.values());
}

// Rewrites every list to the first spelling seen across all of them, so "A1" and "a1 " on
// different roster rows end up as one section.
export function unifySectionSpellings(lists: string[][]) {
  const spelling = new Map<string, string>();
  for (const list of lists) {
    for (const name of list) {
      const key = sectionKey(name);
      if (key && !spelling.has(key)) spelling.set(key, name.trim());
    }
  }
  return lists.map((list) => uniqueSections(list.map((name) => spelling.get(sectionKey(name)) ?? name)));
}

// A section-scoped checker sees members who share one of their sections, plus
// members with no section. Shared by every route that returns roster data.
export function sharesSectionWith(viewerSections: Iterable<string>, memberSections: readonly string[]) {
  if (memberSections.length === 0) return true;
  const viewer = new Set(viewerSections);
  return memberSections.some((section) => viewer.has(section));
}

type ScopedEnrollment = {
  role: 'STUDENT' | 'INSTRUCTOR' | 'CHECKER';
  status: 'PENDING' | 'ACTIVE';
  studentId: string;
  sections: readonly string[];
};

export function visibleEnrollmentsFor<T extends ScopedEnrollment>(
  enrollments: readonly T[],
  viewer: { userId: string; role: ScopedEnrollment['role']; allowCrossSectionView: boolean }
): T[] {
  if (viewer.role === 'INSTRUCTOR') return [...enrollments];

  const own = enrollments.find((enrollment) => enrollment.studentId === viewer.userId);
  const sectionScoped = viewer.role === 'CHECKER' && !viewer.allowCrossSectionView;
  const viewerSections = own?.sections ?? [];

  return enrollments.filter((enrollment) => {
    if (enrollment === own) return true;
    if (enrollment.status !== 'ACTIVE') return false;
    if (enrollment.role !== 'STUDENT' || !sectionScoped) return true;
    return sharesSectionWith(viewerSections, enrollment.sections);
  });
}
