'use client';

import { useMemo } from 'react';

import { useBadgesCatalog } from '@/app/hooks/useBadgesCatalog';
import { selectableRelationIds, type RelationDirection } from '@/lib/badgeRelations';
import pageStyles from '../page.module.css';
import chipStyles from './ChipInput.module.css';
import type { BadgeDraft } from '../types';

type RelationType = 'PREREQUISITE' | 'SATISFIES';

// One picker per relation type; each owns a toggle and a list on the draft.
const RELATION_UI: Record<
  RelationType,
  {
    toggleField: 'hasPrerequisites' | 'hasSatisfies';
    listField: 'prerequisites' | 'satisfies';
    direction: RelationDirection;
    question: string;
    help: string;
    addLabel: string;
    noun: string;
  }
> = {
  PREREQUISITE: {
    toggleField: 'hasPrerequisites',
    listField: 'prerequisites',
    direction: 'incoming',
    question: 'Does this badge require a prerequisite?',
    help: 'Students must complete every prerequisite badge before they can start this one. A course must include the prerequisites before this badge can be added to it.',
    addLabel: 'Add prerequisite…',
    noun: 'prerequisite',
  },
  SATISFIES: {
    toggleField: 'hasSatisfies',
    listField: 'satisfies',
    direction: 'outgoing',
    question: 'Does completing this badge also earn other badges?',
    help: 'Students who complete this badge automatically earn these too, in any course that includes both. Students who already completed it earn them when you save.',
    addLabel: 'Add badge it earns…',
    noun: 'earned badge',
  },
};

// Options are library badges, minus this badge and anything that would close a
// loop for this relation type (the API rejects those anyway; hiding them saves a
// failed save).
export default function BadgeRelationPicker({
  type,
  draft,
  updateDraft,
  familyRootId,
}: {
  type: RelationType;
  draft: BadgeDraft;
  updateDraft: <K extends keyof BadgeDraft>(field: K, value: BadgeDraft[K]) => void;
  // The edited badge's template id; null while creating a new badge.
  familyRootId: string | null;
}) {
  const ui = RELATION_UI[type];
  const enabled = draft[ui.toggleField];
  const chosen = draft[ui.listField];
  const { data, isLoading, error } = useBadgesCatalog(enabled);

  const options = useMemo(() => {
    const badges = data?.badges ?? [];
    const edges = (data?.relationEdges ?? []).filter((edge) => edge.type === type);
    const selectable = new Set(
      selectableRelationIds(
        edges,
        familyRootId,
        badges.map((badge) => badge.id),
        ui.direction
      )
    );
    const chosenIds = new Set(chosen.map((badge) => badge.id));
    return badges.filter((badge) => selectable.has(badge.id) && !chosenIds.has(badge.id));
  }, [data, type, familyRootId, ui.direction, chosen]);

  const add = (badgeId: string) => {
    const badge = data?.badges.find((entry) => entry.id === badgeId);
    if (!badge) return;
    updateDraft(ui.listField, [...chosen, { id: badge.id, name: badge.name }]);
  };

  const remove = (badgeId: string) => {
    updateDraft(
      ui.listField,
      chosen.filter((badge) => badge.id !== badgeId)
    );
  };

  const toggleId = `relation-${type.toLowerCase()}`;

  return (
    <div className={pageStyles.badgeInfoField}>
      <label className={pageStyles.checkboxRow} htmlFor={toggleId}>
        <input
          type="checkbox"
          name={toggleId}
          id={toggleId}
          checked={enabled}
          onChange={(event) => {
            updateDraft(ui.toggleField, event.target.checked);
            if (!event.target.checked) updateDraft(ui.listField, []);
          }}
        />
        <span className={pageStyles.sectionLabel}>{ui.question}</span>
      </label>
      <p className={pageStyles.fieldHelp}>{ui.help}</p>

      {enabled ? (
        <>
          <select
            aria-label={ui.addLabel.replace('…', '')}
            className={pageStyles.selectField}
            value=""
            disabled={isLoading || options.length === 0}
            onChange={(event) => add(event.target.value)}
          >
            <option value="">
              {isLoading ? 'Loading badges…' : options.length === 0 ? 'No other badges available' : ui.addLabel}
            </option>
            {options.map((badge) => (
              <option key={badge.id} value={badge.id}>
                {badge.name}
              </option>
            ))}
          </select>
          {error ? <p className={pageStyles.errorText}>{error}</p> : null}
          {chosen.length > 0 ? (
            <div className={chipStyles.chips}>
              {chosen.map((badge) => (
                <span key={badge.id} className={chipStyles.chip}>
                  {badge.name}
                  <button
                    type="button"
                    className={chipStyles.chipRemove}
                    aria-label={`Remove ${ui.noun} ${badge.name}`}
                    onClick={() => remove(badge.id)}
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
