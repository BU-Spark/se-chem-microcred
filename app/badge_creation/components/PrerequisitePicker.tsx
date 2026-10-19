'use client';

import { useMemo } from 'react';

import { useBadgesCatalog } from '@/app/hooks/useBadgesCatalog';
import { selectablePrerequisiteIds } from '@/lib/badgePrerequisites';
import pageStyles from '../page.module.css';
import chipStyles from './ChipInput.module.css';
import type { BadgeDraft } from '../types';

// Picks the badges a student must COMPLETE before starting this one. Options are
// library badges, minus this badge and anything that already depends on it (the
// API rejects those as cycles anyway; hiding them saves a failed save).
export default function PrerequisitePicker({
  draft,
  updateDraft,
  familyRootId,
}: {
  draft: BadgeDraft;
  updateDraft: <K extends keyof BadgeDraft>(field: K, value: BadgeDraft[K]) => void;
  // The edited badge's template id; null while creating a new badge.
  familyRootId: string | null;
}) {
  const { data, isLoading, error } = useBadgesCatalog(draft.hasPrerequisites);

  const options = useMemo(() => {
    const badges = data?.badges ?? [];
    const selectable = new Set(
      selectablePrerequisiteIds(
        data?.prerequisiteEdges ?? [],
        familyRootId,
        badges.map((badge) => badge.id)
      )
    );
    const chosen = new Set(draft.prerequisites.map((prereq) => prereq.id));
    return badges.filter((badge) => selectable.has(badge.id) && !chosen.has(badge.id));
  }, [data, familyRootId, draft.prerequisites]);

  const addPrerequisite = (badgeId: string) => {
    const badge = data?.badges.find((entry) => entry.id === badgeId);
    if (!badge) return;
    updateDraft('prerequisites', [...draft.prerequisites, { id: badge.id, name: badge.name }]);
  };

  const removePrerequisite = (badgeId: string) => {
    updateDraft(
      'prerequisites',
      draft.prerequisites.filter((prereq) => prereq.id !== badgeId)
    );
  };

  return (
    <div className={pageStyles.badgeInfoField}>
      <label className={pageStyles.checkboxRow} htmlFor="has-prerequisites">
        <input
          type="checkbox"
          name="has-prerequisites"
          id="has-prerequisites"
          checked={draft.hasPrerequisites}
          onChange={(event) => {
            updateDraft('hasPrerequisites', event.target.checked);
            if (!event.target.checked) updateDraft('prerequisites', []);
          }}
        />
        <span className={pageStyles.sectionLabel}>Does this badge require a prerequisite?</span>
      </label>
      <p className={pageStyles.fieldHelp}>
        Students must complete every prerequisite badge before they can start this one. A course must include the
        prerequisites before this badge can be added to it.
      </p>

      {draft.hasPrerequisites ? (
        <>
          <select
            id="prerequisite-select"
            aria-label="Add prerequisite badge"
            className={pageStyles.selectField}
            value=""
            disabled={isLoading || options.length === 0}
            onChange={(event) => addPrerequisite(event.target.value)}
          >
            <option value="">
              {isLoading ? 'Loading badges…' : options.length === 0 ? 'No other badges available' : 'Add prerequisite…'}
            </option>
            {options.map((badge) => (
              <option key={badge.id} value={badge.id}>
                {badge.name}
              </option>
            ))}
          </select>
          {error ? <p className={pageStyles.errorText}>{error}</p> : null}
          {draft.prerequisites.length > 0 ? (
            <div className={chipStyles.chips}>
              {draft.prerequisites.map((prereq) => (
                <span key={prereq.id} className={chipStyles.chip}>
                  {prereq.name}
                  <button
                    type="button"
                    className={chipStyles.chipRemove}
                    aria-label={`Remove prerequisite ${prereq.name}`}
                    onClick={() => removePrerequisite(prereq.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
