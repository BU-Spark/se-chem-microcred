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
