import type { BadgeCategory } from '@prisma/client';

import styles from '../page.module.css';
import { formatDisplayDate } from '../lib/badge-helpers';
import type { BadgeDraft } from '../types';
import ChipInput from '../components/ChipInput';
import RangeCalendar from '../components/RangeCalendar';

export default function BadgeInfoStep({
  draft,
  updateDraft,
}: {
  draft: BadgeDraft;
  updateDraft: <K extends keyof BadgeDraft>(field: K, value: BadgeDraft[K]) => void;
}) {
  return (
    <div className={styles.badgeInfoLayout}>
      <div className={styles.badgeInfoField}>
        <label className={styles.sectionLabel} htmlFor="badgeName">
          Badge Name
        </label>
        <input
          id="badgeName"
          className={styles.underlineInput}
          value={draft.badgeName}
          onChange={(event) => updateDraft('badgeName', event.target.value)}
          placeholder="Badge Name"
        />
      </div>

      <div className={styles.badgeInfoField}>
        <label className={styles.sectionLabel} htmlFor="badgeSkills">
          Badge skills
        </label>
        <p className={styles.fieldHelp}>Describe the skills students will learn in this badge. Add up to 5 skills.</p>
        <ChipInput
          value={draft.skills}
          onChange={(next) => updateDraft('skills', next)}
          max={5}
          ariaLabel="Add skill"
          placeholder="Add skill..."
        />
      </div>

      <div className={styles.badgeInfoField}>
        <label className={styles.sectionLabel} htmlFor="badgeDescription">
          Badge Description
        </label>
        <textarea
          id="badgeDescription"
          className={styles.descriptionInput}
          value={draft.badgeDescription}
          onChange={(event) => updateDraft('badgeDescription', event.target.value)}
          placeholder="Describe what students will learn and demonstrate."
        />
      </div>

      <div className={styles.badgeInfoField}>
        <label className={styles.sectionLabel} htmlFor="badgeCategory">
          Category
        </label>
        <select
          id="badgeCategory"
          className={styles.selectField}
          value={draft.category}
          onChange={(event) => updateDraft('category', event.target.value as BadgeCategory)}
        >
          <option value="SAFETY">Safety</option>
          <option value="EQUIPMENT">Equipment</option>
          <option value="WASTE">Waste</option>
          <option value="OTHER">Other</option>
        </select>
      </div>

      <div className={styles.badgeInfoField}>
        <label className={styles.sectionLabel}>Content Availability</label>
        <div className={styles.availabilityRow}>
          <div className={styles.availabilityPill}>
            <span>Content Available On:</span>
            <strong>{formatDisplayDate(draft.availableOn)}</strong>
          </div>
          <div className={styles.availabilityPill}>
            <span>Content Closes On:</span>
            <strong>{draft.neverCloses ? 'Never closes' : formatDisplayDate(draft.closesOn)}</strong>
          </div>
        </div>

        <RangeCalendar
          availableOn={draft.availableOn}
          closesOn={draft.closesOn}
          neverCloses={draft.neverCloses}
          onAvailableOnChange={(value) => updateDraft('availableOn', value)}
          onClosesOnChange={(value) => updateDraft('closesOn', value)}
          onNeverClosesChange={(value) => updateDraft('neverCloses', value)}
        />
      </div>
    </div>
  );
}
