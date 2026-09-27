import { sectionKey, uniqueSections } from '@/lib/sections';

// Matches requested names to existing ones by sectionKey, returning the existing spelling so
// "a1" is stored as "A1".
export function matchExistingSections(requested: string[], existing: string[]) {
  const byKey = new Map<string, string>();
  for (const section of existing) {
    if (!byKey.has(sectionKey(section))) byKey.set(sectionKey(section), section);
  }
  const matched: string[] = [];
  const unknown: string[] = [];
  for (const section of uniqueSections(requested)) {
    const existingName = byKey.get(sectionKey(section));
    if (!existingName) unknown.push(section);
    else if (!matched.includes(existingName)) matched.push(existingName);
  }
  return { matched, unknown };
}

export function unknownSectionsMessage(unknown: string[], existing: string[]) {
  const label = unknown.length === 1 ? 'Section' : 'Sections';
  const verb = unknown.length === 1 ? 'does' : 'do';
  const options = [...existing].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const available = options.length
    ? `Existing sections: ${options.join(', ')}.`
    : 'This course has no sections yet. Add them by uploading a roster on the course edit page.';
  return `${label} ${unknown.map((section) => `"${section}"`).join(', ')} ${verb} not exist in this course. ${available}`;
}
