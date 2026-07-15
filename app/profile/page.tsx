'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useUser, useReverification } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import { useStudentData } from '../hooks/useStudentData';
import { useFocusTrap } from '../hooks/useFocusTrap';
import styles from './page.module.css';
import editIcon from '../../public/assets/profile/edit.png';
import EditAvatarModal from '../edit_avatar/EditAvatarModal';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import YoutubeThumbnail from '@/app/_components/YoutubeThumbnail';
import { useDatabaseDisplayNameContext } from '../_components/DatabaseDisplayNameProvider';

function parseName(fullName?: string | null) {
  if (!fullName) {
    return { first: 'Student', last: '', isFallback: true };
  }
  const tokens = fullName.trim().split(/\s+/);
  if (tokens.length === 1) {
    return { first: tokens[0], last: '', isFallback: false };
  }
  return {
    first: tokens[0],
    last: tokens[tokens.length - 1],
    isFallback: false,
  };
}

function avatarAsset(base?: string | null) {
  switch (base) {
    case 'RUBY':
      return '/edit_avatar/ruby.svg';
    case 'EMERALD':
      return '/edit_avatar/emerald.svg';
    case 'AMETHYST':
      return '/edit_avatar/amethyst.svg';
    case 'SAPPHIRE':
    default:
      return '/edit_avatar/sapphire.svg';
  }
}

function formatCreatedDate(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function pellLabel(value?: boolean | null) {
  if (value == null) return 'Not provided';
  return value ? 'Yes' : 'No';
}

// 10 minutes
const SENSITIVE_TIMEOUT_MS = 10 * 60 * 1000;

export default function ProfilePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();
  // commenting out here again use for clerk is not needed here anymore without the change password feature
  // const clerk = useClerk();

  const { data: studentData, refresh: refreshStudentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);
  // Cached avatar base (in-memory + localStorage) so the chosen avatar paints
  // immediately instead of flashing the default gem while studentData loads.
  const {
    avatarBase: cachedAvatarBase,
    setAvatarBase: setCachedAvatarBase,
    refresh: refreshDisplayName,
  } = useDatabaseDisplayNameContext();
  const [isSigningOut, setIsSigningOut] = useState(false);

  // ---------- 1. Sensitive-data visibility ----------
  const [sensitiveHidden, setSensitiveHidden] = useState(true);
  // Held in a ref (not state) so every spawned auto-hide timer is tracked and
  // cleaned up on unmount — avoids leaking a timer that fires setState on a dead component.
  const sensitiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- Demographic dropdown (expand/collapse) ----------
  const [demographicOpen, setDemographicOpen] = useState(false);

  // ---------- Badge section dropdowns ----------
  const [notStartedOpen, setNotStartedOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);

  // ---------- 2. Language picker ----------
  // language settings (ready for future languages)
  const [language, setLanguage] = useState<'en'>('en');
  const [languageDraft, setLanguageDraft] = useState<'en'>('en');
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);

  const AVAILABLE_LANGUAGES: { code: 'en'; label: string; description: string }[] = [
    {
      code: 'en',
      label: 'English (default)',
      description: 'Currently supported',
    },
  ];

  // ---------- 3. Demographic edit modal ----------
  const [isDemographicModalOpen, setIsDemographicModalOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftGender, setDraftGender] = useState('');
  const [draftRaceEthnicity, setDraftRaceEthnicity] = useState('');
  const [draftParentalEducation, setDraftParentalEducation] = useState('');
  const [draftPellQualified, setDraftPellQualified] = useState<'Yes' | 'No' | 'Not provided'>('Not provided');
  const [isSavingDemographics, setIsSavingDemographics] = useState(false);

  // 4. Character customization
  const [isEditAvatarOpen, setIsEditAvatarOpen] = useState(false);
  // Paint the just-picked avatar immediately on save instead of waiting for the
  // (slow) studentData refetch, so the change feels instant. The background
  // refresh reconciles this with the DB value.
  const [optimisticAvatarBase, setOptimisticAvatarBase] = useState<string | null>(null);

  // kick user to sign-in if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, isSigningOut, router]);

  const restartSensitiveTimer = useCallback(() => {
    if (sensitiveTimerRef.current) clearTimeout(sensitiveTimerRef.current);
    sensitiveTimerRef.current = setTimeout(() => setSensitiveHidden(true), SENSITIVE_TIMEOUT_MS);
  }, []);

  // The auto-hide timer is started only when sensitive info is actually revealed
  // (handleShowSensitive). Here we just clear any pending timer on unmount so it
  // can't fire setState on a dead component.
  useEffect(() => {
    return () => {
      if (sensitiveTimerRef.current) clearTimeout(sensitiveTimerRef.current);
    };
  }, []);

  // Collapse the demographic dropdown whenever sensitive info gets re-hidden
  // (e.g. the 10-minute auto-hide timer fires) so masked values aren't shown.
  useEffect(() => {
    if (sensitiveHidden) {
      setDemographicOpen(false);
    }
  }, [sensitiveHidden]);

  // Real step-up auth: useReverification wraps a call to a reverification-protected
  // route. Clerk catches the reverification error, prompts the user to re-verify
  // their credentials, and retries, so the reveal cannot be bypassed by a confirm box.
  const reverifiedReveal = useReverification(async () => {
    const response = await fetch('/api/profile/reverify', { method: 'POST' });
    if (!response.ok) {
      throw new Error('Re-verification required');
    }
  });

  // Returns true if sensitive info became visible. Fails closed: if the user
  // cancels re-verification or it errors, sensitive data stays masked.
  const handleShowSensitive = async (): Promise<boolean> => {
    try {
      await reverifiedReveal();
      setSensitiveHidden(false);
      restartSensitiveTimer();
      return true;
    } catch {
      return false;
    }
  };

  // Modal a11y: trap focus, close on Escape, restore focus to the trigger on close.
  const demographicModalRef = useFocusTrap<HTMLDivElement>(isDemographicModalOpen, () =>
    setIsDemographicModalOpen(false)
  );
  const languageModalRef = useFocusTrap<HTMLDivElement>(isLanguageModalOpen, () => setIsLanguageModalOpen(false));

  // Toggle the Demographic Info dropdown. Opening it requires the sensitive
  // info to be unmasked (re-authentication), preserving the existing behavior.
  const handleToggleDemographic = async () => {
    if (demographicOpen) {
      setDemographicOpen(false);
      return;
    }
    if (sensitiveHidden) {
      const revealed = await handleShowSensitive();
      if (revealed) setDemographicOpen(true);
      return;
    }
    setDemographicOpen(true);
  };
  // This function is deprecated until there is a need will keep commented out unless feature is wanted back
  // const handleChangePassword = async () => {
  //   // One simple pattern: open Clerk's built-in profile where the user can
  //   // manage their password & authentication methods.
  //   try {
  //     clerk.openUserProfile();
  //   } catch (err) {
  //     console.error('Failed to open Clerk user profile', err);
  //   }
  // };

  const handleOpenLanguageModal = () => {
    setLanguageDraft(language); // start from current
    setIsLanguageModalOpen(true);
  };

  const handleSaveLanguage = () => {
    setLanguage(languageDraft);
    setIsLanguageModalOpen(false);
    // TODO: in the future, persist to profile / i18n context
  };

  const handleOpenDemographicModal = () => {
    // Prefill draft fields from current values (no Clerk popup here)
    const gender = studentData?.student.gender ?? 'Not provided';
    const raceEthnicity = studentData?.student.raceEthnicity ?? 'Not provided';
    const parentalEducation = studentData?.student.parentalEducation ?? 'Not provided';
    const pell = pellLabel(studentData?.student.pellGrantQualified);

    setDraftName(studentData?.student.name ?? '');
    setDraftGender(gender);
    setDraftRaceEthnicity(raceEthnicity);
    setDraftParentalEducation(parentalEducation);
    setDraftPellQualified(pell);
    setIsDemographicModalOpen(true);
  };

  const handleSaveDemographics = async () => {
    if (!studentData?.student.email) {
      setIsDemographicModalOpen(false);
      return;
    }
    setIsSavingDemographics(true);
    try {
      const response = await fetch('/api/profile/demographics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: studentData.student.email,
          name: draftName.trim(),
          gender: draftGender,
          raceEthnicity: draftRaceEthnicity,
          parentalEducation: draftParentalEducation,
          pellGrantQualified: draftPellQualified === 'Yes' ? true : draftPellQualified === 'No' ? false : null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save demographic info');
      }
      await refreshStudentData();
      // Repaint the sidebar name/avatar (served from the display-name cache)
      // with the freshly saved value instead of waiting for a full reload.
      await refreshDisplayName();
      setIsDemographicModalOpen(false);
    } catch (err) {
      console.error('Failed to save demographic info', err);
    } finally {
      setIsSavingDemographics(false);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
    } catch (error) {
      console.error('Failed to sign out', error);
      setIsSigningOut(false);
    }
  };

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const displayName = studentData?.student.name ?? '';
  const {
    first: firstName,
    last: lastName,
    isFallback,
  } = parseName(studentData?.student.name ?? user?.fullName ?? null);

  const greetingName = isFallback ? 'Student' : firstName;
  const studentEmail = studentData?.student.email ?? user?.primaryEmailAddress?.emailAddress ?? 'Not provided';
  const buid = studentData?.student.buid ?? 'Not provided';
  const createdAt = formatCreatedDate(studentData?.student.createdAt);

  const gender = studentData?.student.gender ?? 'Not provided';
  const raceEthnicity = studentData?.student.raceEthnicity ?? 'Not provided';
  const parentalEducation = studentData?.student.parentalEducation ?? 'Not provided';
  const pellGrantQualified = pellLabel(studentData?.student.pellGrantQualified);

  const demographicFields = [
    { label: 'Gender:', value: gender },
    { label: 'Race/Ethnicity:', value: raceEthnicity },
    { label: 'Parental Education:', value: parentalEducation },
    { label: 'Pell Grant Qualified?', value: pellGrantQualified },
  ];

  const avatarSrc = avatarAsset(optimisticAvatarBase ?? studentData?.student.avatar?.base ?? cachedAvatarBase);

  const learningBadges = studentData?.badges.learning ?? [];
  const completedBadges = studentData?.badges.completed ?? [];
  const notStartedBadges = studentData?.badges.notStarted ?? [];

  return (
    <div className="page">
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className="main">
        <div className={styles.pageContent}>
          <header className={styles.headerRow}>
            <h1 className={styles.pageTitle}>My Profile</h1>
            <span className={styles.greeting}>Hello, {greetingName}</span>
          </header>

          {/* ===================== Profile card ===================== */}
          <section className={styles.profileCard}>
            {/* LEFT: student info */}
            <div className={styles.infoColumn}>
              <h2 className={styles.sectionTitle}>My Info:</h2>

              <div className={styles.primaryName}>
                {lastName ? (
                  <>
                    {lastName},
                    <br />
                    {firstName}
                  </>
                ) : (
                  firstName
                )}
              </div>

              <div className={styles.metaLine}>Date Created: {createdAt}</div>

              <div className={styles.detailGridTop}>
                <div>
                  <div className={styles.detailLabel}>Email:</div>
                  <div className={styles.detailValue}>{studentEmail}</div>
                </div>
                <div>
                  <div className={styles.detailLabel}>BUID:</div>
                  <div className={`${styles.detailValue} ${sensitiveHidden ? styles.sensitiveValueMasked : ''}`}>
                    {sensitiveHidden ? 'UXXXXXXXX' : buid}
                  </div>
                </div>
              </div>

              <div className={styles.inlineActionsRow}>
                <button type="button" className={styles.inlineLink} onClick={handleOpenLanguageModal}>
                  Change Language
                </button>
              </div>
            </div>

            {/* CENTER: avatar */}
            <div className={styles.avatarColumn}>
              <div className={styles.avatarFrame}>
                <Image src={avatarSrc} alt="Student avatar" width={280} height={280} className={styles.avatarImage} />
              </div>

              <button type="button" className={styles.editAvatarLink} onClick={() => setIsEditAvatarOpen(true)}>
                <span className={styles.editAvatarText}>Edit avatar</span>
                <Image src={editIcon} alt="Edit avatar" width={16} height={16} className={styles.editAvatarIcon} />
              </button>
            </div>

            {/* RIGHT: demographic dropdown */}
            <aside className={styles.rightColumn}>
              {/* Demographic Info dropdown */}
              <div className={styles.demographicSection}>
                <button
                  type="button"
                  className={styles.demographicHeader}
                  onClick={handleToggleDemographic}
                  aria-expanded={demographicOpen}
                >
                  <span className={styles.demographicTitle}>Demographic Info</span>
                  <span className={`${styles.caret} ${demographicOpen ? styles.caretOpen : ''}`} aria-hidden="true">
                    ⌄
                  </span>
                </button>

                {demographicOpen && (
                  <div className={styles.detailGrid}>
                    {demographicFields.map((field) => (
                      <div key={field.label}>
                        <div className={styles.detailLabel}>{field.label}</div>
                        <div className={`${styles.detailValue} ${sensitiveHidden ? styles.sensitiveValueMasked : ''}`}>
                          {sensitiveHidden ? 'XXXXXXX' : field.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit pencil for demographic area -> demographic/edit handler */}
              <button type="button" className={styles.editPencil} onClick={handleOpenDemographicModal}>
                <span className={styles.editPencilText}>Edit</span>
                <Image src={editIcon} alt="" width={20} height={20} className={styles.editPencilIcon} />
              </button>
            </aside>
          </section>

          {/* ===================== Badges card ===================== */}
          <section className={styles.badgesCard}>
            <div className={styles.badgesHeader}>
              <h2 className={styles.badgesTitle}>Student Badges</h2>
              <button type="button" className={styles.editPencil} onClick={handleOpenDemographicModal}>
                <span className={styles.editPencilText}>Edit</span>
                <Image src={editIcon} alt="" width={20} height={20} className={styles.editPencilIcon} />
              </button>
            </div>

            {/* In-progress */}
            <h3 className={styles.badgeSectionLabel}>In-progress</h3>
            <div className={styles.badgeRow}>
              {learningBadges.length === 0 ? (
                <div className={styles.emptyState}>No badges in progress.</div>
              ) : (
                learningBadges.map((badge) => (
                  <div key={badge.id} className={styles.badgeToken}>
                    <div className={styles.badgeCircle}>
                      <YoutubeThumbnail
                        videoUrl={badge.youtubeUrl}
                        alt={`${badge.name} thumbnail`}
                        className={styles.badgeCircleImage}
                      />
                    </div>
                    <div className={styles.badgeName}>{badge.name}</div>
                  </div>
                ))
              )}
            </div>

            {/* Not yet started */}
            <div className={styles.badgeDropdownSection}>
              <button
                type="button"
                className={styles.badgeDropdownHeader}
                onClick={() => setNotStartedOpen((open) => !open)}
                aria-expanded={notStartedOpen}
              >
                <span className={styles.badgeSectionLabel}>Not yet started</span>
                <span className={`${styles.caret} ${notStartedOpen ? styles.caretOpen : ''}`} aria-hidden="true">
                  ⌄
                </span>
              </button>
              {notStartedOpen && (
                <div className={styles.badgeRow}>
                  {notStartedBadges.length === 0 ? (
                    <div className={styles.emptyState}>No badges to show.</div>
                  ) : (
                    notStartedBadges.map((badge) => (
                      <div key={badge.id} className={styles.badgeToken}>
                        <div className={styles.badgeCircle}>
                          <YoutubeThumbnail
                            videoUrl={badge.youtubeUrl}
                            alt={`${badge.name} thumbnail`}
                            className={styles.badgeCircleImage}
                          />
                        </div>
                        <div className={styles.badgeName}>{badge.name}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Completed */}
            <div className={styles.badgeDropdownSection}>
              <button
                type="button"
                className={styles.badgeDropdownHeader}
                onClick={() => setCompletedOpen((open) => !open)}
                aria-expanded={completedOpen}
              >
                <span className={styles.badgeSectionLabel}>Completed</span>
                <span className={`${styles.caret} ${completedOpen ? styles.caretOpen : ''}`} aria-hidden="true">
                  ⌄
                </span>
              </button>
              {completedOpen && (
                <div className={styles.badgeRow}>
                  {completedBadges.length === 0 ? (
                    <div className={styles.emptyState}>No completed badges yet.</div>
                  ) : (
                    completedBadges.map((badge) => (
                      <div key={badge.id} className={styles.badgeToken}>
                        <div className={styles.badgeCircle}>
                          <YoutubeThumbnail
                            videoUrl={badge.youtubeUrl}
                            alt={`${badge.name} thumbnail`}
                            className={styles.badgeCircleImage}
                          />
                        </div>
                        <div className={styles.badgeName}>{badge.name}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Demographic edit modal */}
      {isDemographicModalOpen && (
        <div
          className={styles.demographicModalOverlay}
          onClick={() => !isSavingDemographics && setIsDemographicModalOpen(false)}
        >
          <div
            ref={demographicModalRef}
            className={styles.demographicModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="demographic-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="demographic-modal-title" className={styles.demographicModalTitle}>
              Edit profile info
            </h2>
            <p className={styles.demographicModalHint}>Update your name and demographic details.</p>

            <label className={styles.demographicModalField}>
              <span className={styles.demographicModalLabel}>Name</span>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="First Last"
              />
            </label>

            <label className={styles.demographicModalField}>
              <span className={styles.demographicModalLabel}>Gender</span>
              <input type="text" value={draftGender} onChange={(e) => setDraftGender(e.target.value)} />
            </label>

            <label className={styles.demographicModalField}>
              <span className={styles.demographicModalLabel}>Race / Ethnicity</span>
              <input type="text" value={draftRaceEthnicity} onChange={(e) => setDraftRaceEthnicity(e.target.value)} />
            </label>

            <label className={styles.demographicModalField}>
              <span className={styles.demographicModalLabel}>Parental education</span>
              <input
                type="text"
                value={draftParentalEducation}
                onChange={(e) => setDraftParentalEducation(e.target.value)}
              />
            </label>

            <label className={styles.demographicModalField}>
              <span className={styles.demographicModalLabel}>Pell Grant qualified?</span>
              <select
                value={draftPellQualified}
                onChange={(e) => setDraftPellQualified(e.target.value as 'Yes' | 'No' | 'Not provided')}
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="Not provided">Not provided</option>
              </select>
            </label>

            <div className={styles.demographicModalActions}>
              <button
                type="button"
                className={styles.demographicModalCancel}
                onClick={() => setIsDemographicModalOpen(false)}
                disabled={isSavingDemographics}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.demographicModalSave}
                onClick={handleSaveDemographics}
                disabled={isSavingDemographics || !draftName.trim()}
              >
                {isSavingDemographics ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLanguageModalOpen && (
        <div className={styles.languageModalOverlay} onClick={() => setIsLanguageModalOpen(false)}>
          <div
            ref={languageModalRef}
            className={styles.languageModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="language-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="language-modal-title" className={styles.languageModalTitle}>
              Change language
            </h2>
            <p className={styles.languageModalHint}>
              Choose the language you’d like to use for this site. More options will be available in the future.
            </p>

            <div className={styles.languageList}>
              {AVAILABLE_LANGUAGES.map((lang) => (
                <label key={lang.code} className={styles.languageOptionRow}>
                  <input
                    type="radio"
                    name="language"
                    value={lang.code}
                    checked={languageDraft === lang.code}
                    onChange={() => setLanguageDraft(lang.code)}
                  />
                  <div className={styles.languageOptionLabel}>
                    <div className={styles.languageOptionTitle}>
                      {lang.label}
                      {language === lang.code && <span className={styles.languageTag}>Current</span>}
                    </div>
                    <div className={styles.languageOptionDesc}>{lang.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className={styles.languageModalActions}>
              <button
                type="button"
                className={styles.languageModalCancel}
                onClick={() => setIsLanguageModalOpen(false)}
              >
                Cancel
              </button>
              <button type="button" className={styles.languageModalSave} onClick={handleSaveLanguage}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {isEditAvatarOpen && (
        <EditAvatarModal
          onClose={() => setIsEditAvatarOpen(false)}
          onSaved={(base) => {
            setOptimisticAvatarBase(base);
            setCachedAvatarBase(base);
            refreshStudentData();
          }}
        />
      )}
    </div>
  );
}
