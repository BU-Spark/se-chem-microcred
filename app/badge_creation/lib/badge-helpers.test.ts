import type { BadgeCatalogItem } from '../types';
import { badgeToDraft, goalNameForBadge } from './badge-helpers';

describe('goalNameForBadge (#302)', () => {
  it('uses the badge name for a blank goal', () => {
    expect(goalNameForBadge('  ', 'Burner')).toBe('Burner');
  });

  it('follows a rename while the goal still matches the old badge name', () => {
    expect(goalNameForBadge('Burner', 'Bunsen Burner', 'Burner')).toBe('Bunsen Burner');
  });

  it('keeps a goal the instructor wrote', () => {
    expect(goalNameForBadge('Operate safely', 'Bunsen Burner', 'Burner')).toBe('Operate safely');
  });
});

describe('badgeToDraft rubric goal', () => {
  const badge = {
    id: 'badge-1',
    name: 'Titration',
    description: null,
    requirements: [],
  } as unknown as BadgeCatalogItem;

  it('fills the goal from the badge name when the badge has no rubric', () => {
    const draft = badgeToDraft(badge);
    expect(draft.rubricGoal.name).toBe('Titration');
    expect(draft.rubricGoal.subgoals[0].text).toBe('');
    expect(draft.rubricGoal.subgoals[0].tasks[0].text).toBe('');
  });

  it('keeps a saved goal name', () => {
    const draft = badgeToDraft({
      ...badge,
      rubricGoal: { name: 'Measure accurately', instructions: null, subgoals: [] },
    } as unknown as BadgeCatalogItem);
    expect(draft.rubricGoal.name).toBe('Measure accurately');
  });
});
