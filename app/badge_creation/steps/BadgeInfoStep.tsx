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
    </div>
  );
}
