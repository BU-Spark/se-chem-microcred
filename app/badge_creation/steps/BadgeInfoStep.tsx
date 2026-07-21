import styles from '../page.module.css';
import type { BadgeDraft } from '../types';
import ChipInput from '../components/ChipInput';

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
        <label className={styles.sectionLabel} htmlFor="reassessment-limit">
          Re-assessment Limit
        </label>
        <p className={styles.fieldHelp}>How many attempts after the initial in-person assessment are allowed.</p>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          name="reassessment-limit"
          id="reassessment-limit"
          className={styles.underlineInput}
          value={draft.reassessmentLimit}
          onChange={(event) => updateDraft('reassessmentLimit', clampInt(event.target.value, 0))}
          placeholder="0"
        />
      </div>
      <div className={styles.badgeInfoField}>
        <label className={styles.sectionLabel} htmlFor="cooldown-length">
          Cooldown Duration (days)
        </label>
        <p className={styles.fieldHelp}>
          How long the cooldown period is, in days, between in-person assessments (0–14).
        </p>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={14}
          step={1}
          name="cooldown-length"
          id="cooldown-length"
          className={styles.underlineInput}
          value={draft.cooldownDays}
          onChange={(event) => updateDraft('cooldownDays', clampInt(event.target.value, 0, 14))}
          placeholder="0"
        />
      </div>
      <div className={styles.badgeInfoField}>
        <label className={styles.checkboxRow} htmlFor="reassessment-required">
          <input
            type="checkbox"
            name="reassessment-required"
            id="reassessment-required"
            checked={draft.reassessmentRequired}
            onChange={(event) => updateDraft('reassessmentRequired', event.target.checked)}
          />
          <span className={styles.sectionLabel}>Re-assessment Required</span>
        </label>
        <p className={styles.fieldHelp}>
          Check if a re-assessment is required when a student fails an in-person assessment.
        </p>
      </div>
    </div>
  );
}

// Coerce a numeric-input string to a clamped integer, treating blank/invalid input
// as the low bound so the draft never stores NaN.
function clampInt(raw: string, min: number, max?: number) {
  const parsed = Number.parseInt(raw, 10);
  const value = Number.isNaN(parsed) ? min : parsed;
  const lowered = Math.max(min, value);
  return max === undefined ? lowered : Math.min(max, lowered);
}
