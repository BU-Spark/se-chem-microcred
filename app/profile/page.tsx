'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth, useUser, useClerk } from '@clerk/nextjs';
import { useStudentData } from '../hooks/useStudentData';
import styles from './page.module.css';
import editIcon from '../../public/assets/profile/edit.png';
import EditAvatarModal from '../edit_avatar/EditAvatarModal';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
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

function splitLastFirst(name?: string | null) {
  if (!name) return { line1: 'Name not provided', line2: '' };

  const parts = name.split(',').map((p) => p.trim());
  if (parts.length === 1) {
    return { line1: parts[0], line2: '' };
  }
  return { line1: parts[0], line2: parts[1] };
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

type Contact = {
  id: string;
  name: string;
  type: string;
  email?: string | null;
  avatarUrl?: string | null;
};

function getContactAvatarSrc(contact: Contact) {
  if (contact.avatarUrl) {
    return contact.avatarUrl;
  }

  if (contact.type === 'INSTRUCTOR') {
    return '/edit_avatar/emerald.svg';
  }
  if (contact.type === 'CHECKER') {
    return '/edit_avatar/amethyst.svg';
  }

  return '/edit_avatar/default.svg';
}

// 10 minutes
const SENSITIVE_TIMEOUT_MS = 10 * 60 * 1000;

export default function ProfilePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const clerk = useClerk();

  const { data: studentData, refresh: refreshStudentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);
  // Cached avatar base (in-memory + localStorage) so the chosen avatar paints
  // immediately instead of flashing the default gem while studentData loads.
  const { avatarBase: cachedAvatarBase } = useDatabaseDisplayNameContext();
  const [isSigningOut, setIsSigningOut] = useState(false);

  // ---------- 1. Sensitive-data visibility ----------
  const [sensitiveHidden, setSensitiveHidden] = useState(true);
  const [sensitiveTimerId, setSensitiveTimerId] = useState<ReturnType<typeof setTimeout> | null>(null);

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
  const [draftGender, setDraftGender] = useState('');
  const [draftRaceEthnicity, setDraftRaceEthnicity] = useState('');
  const [draftParentalEducation, setDraftParentalEducation] = useState('');
  const [draftPellQualified, setDraftPellQualified] = useState<'Yes' | 'No' | 'Not provided'>('Not provided');
  const [isSavingDemographics, setIsSavingDemographics] = useState(false);

  // 4. Character customization
  const [isEditAvatarOpen, setIsEditAvatarOpen] = useState(false);

  // kick user to sign-in if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  // start auto-hide timer on mount
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    const id = setTimeout(() => {
      setSensitiveHidden(true);
    }, SENSITIVE_TIMEOUT_MS);
    setSensitiveTimerId(id);

    return () => {
      if (id) clearTimeout(id);
    };
  }, [isLoaded, isSignedIn]);

  // Collapse the demographic dropdown whenever sensitive info gets re-hidden
  // (e.g. the 10-minute auto-hide timer fires) so masked values aren't shown.
  useEffect(() => {
    if (sensitiveHidden) {
      setDemographicOpen(false);
    }
  }, [sensitiveHidden]);

  const restartSensitiveTimer = () => {
    if (sensitiveTimerId) clearTimeout(sensitiveTimerId);
    const id = setTimeout(() => setSensitiveHidden(true), SENSITIVE_TIMEOUT_MS);
    setSensitiveTimerId(id);
  };

  // helper: ask Clerk to re-authenticate (password / SSO).
  // Here we use the built-in Sign-in modal; after it closes we treat it as success.
  const requestReauthentication = async () => {
    try {
      // In single-session apps, Clerk won't show a SignIn modal on top
      // of an existing session. Instead, open the user profile where the
      // user can re-confirm their identity (password / 2FA / etc.).
      clerk.openUserProfile();
      // We don't actually know when the user "finished", so this helper
      // just opens the profile and returns immediately.
    } catch (err) {
      console.error('Clerk re-authentication failed', err);
      throw err;
    }
  };

  // Returns true if sensitive info became (or already was) visible.
  const handleShowSensitive = async (): Promise<boolean> => {
    try {
      await requestReauthentication();
      const confirmed = window.confirm('Did you finish re-authentication?');
      if (!confirmed) return false;
      setSensitiveHidden(false);
      restartSensitiveTimer();
      return true;
    } catch {
      // keep hidden on failure
      return false;
    }
  };

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

  const handleChangePassword = async () => {
    // One simple pattern: open Clerk's built-in profile where the user can
    // manage their password & authentication methods.
    try {
      clerk.openUserProfile();
    } catch (err) {
      console.error('Failed to open Clerk user profile', err);
    }
  };

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
    const pell =
      studentData?.student.pellGrantQualified == null
        ? 'Not provided'
        : studentData.student.pellGrantQualified
          ? 'Yes'
          : 'No';

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
      router.replace('/sign-in');
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
  const pellGrantQualified =
    studentData?.student.pellGrantQualified == null
      ? 'Not provided'
      : studentData.student.pellGrantQualified
        ? 'Yes'
        : 'No';

  const checkerContacts = studentData?.course?.contacts.filter((contact) => contact.type === 'CHECKER') ?? [];
  const courseTitle = studentData?.course?.title ?? 'Course information not available';
  const courseSection = studentData?.course?.section ?? 'Not provided';
  const avatarSrc = avatarAsset(studentData?.student.avatar?.base ?? cachedAvatarBase);

  const learningBadges = studentData?.badges.learning ?? [];
  const completedBadges = studentData?.badges.completed ?? [];

  return (
    <div className="page">
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className="main">
        <div className={styles.pageContent}>
          <header className={styles.headerRow}>
            <h1 className={styles.pageTitle}>Student Profile</h1>
            <span className={styles.greeting}>Hello, {greetingName}</span>
          </header>

          {/* ===================== Profile card ===================== */}
          <section className={styles.profileCard}>
            {/* LEFT: student info */}
            <div className={styles.infoColumn}>
              <h2 className={styles.sectionTitle}>Student Info:</h2>

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

              <div className={styles.roleLabel}>Student</div>
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
                <button type="button" className={styles.inlineLink} onClick={handleChangePassword}>
                  Change Password
                </button>
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

            {/* RIGHT: demographic dropdown + course + checker */}
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
                    <div>
                      <div className={styles.detailLabel}>Gender:</div>
                      <div className={`${styles.detailValue} ${sensitiveHidden ? styles.sensitiveValueMasked : ''}`}>
                        {sensitiveHidden ? 'XXXXXXX' : gender}
                      </div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Race/Ethnicity:</div>
                      <div className={`${styles.detailValue} ${sensitiveHidden ? styles.sensitiveValueMasked : ''}`}>
                        {sensitiveHidden ? 'XXXXXXX' : raceEthnicity}
                      </div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Parental Education:</div>
                      <div className={`${styles.detailValue} ${sensitiveHidden ? styles.sensitiveValueMasked : ''}`}>
                        {sensitiveHidden ? 'XXXXXXX' : parentalEducation}
                      </div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Pell Grant Qualified?</div>
                      <div className={`${styles.detailValue} ${sensitiveHidden ? styles.sensitiveValueMasked : ''}`}>
                        {sensitiveHidden ? 'XXXXXXX' : pellGrantQualified}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Course Info */}
              <div className={styles.courseSection}>
                <h3 className={styles.courseInfoTitle}>Course Info:</h3>
                <div className={styles.courseMeta}>
                  {courseTitle}
                  <br />
                  Section: {courseSection}
                </div>
              </div>

              {/* Checker */}
              <div className={styles.courseSection}>
                <h3 className={styles.checkerTitle}>Checker</h3>
                <div className={styles.contactList}>
                  {checkerContacts.length === 0 ? (
                    <div className={styles.emptyState}>No checkers listed.</div>
                  ) : (
                    checkerContacts.map((contact) => {
                      const { line1, line2 } = splitLastFirst(contact.name);
                      return (
                        <div key={contact.id} className={styles.contactItem}>
                          <div className={styles.contactAvatar}>
                            <Image src={getContactAvatarSrc(contact)} alt={contact.name} width={110} height={110} />
                          </div>
                          <div className={styles.contactInfo}>
                            <span className={styles.contactName}>
                              {line1}
                              {line2 ? (
                                <>
                                  <br />
                                  {line2}
                                </>
                              ) : null}
                            </span>
                            <span className={styles.contactEmail}>{contact.email}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Edit pencil for course/checker area -> demographic/edit handler */}
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
                    <div className={styles.badgeCircle} aria-hidden="true" />
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
                  <div className={styles.emptyState}>No badges to show.</div>
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
                        <div className={styles.badgeCircle} aria-hidden="true" />
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
        <div className={styles.demographicModalOverlay}>
          <div className={styles.demographicModal}>
            <h2 className={styles.demographicModalTitle}>Edit demographic info</h2>
            <p className={styles.demographicModalHint}>Only demographic fields can be changed here.</p>

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
                disabled={isSavingDemographics}
              >
                {isSavingDemographics ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLanguageModalOpen && (
        <div className={styles.languageModalOverlay}>
          <div className={styles.languageModal}>
            <h2 className={styles.languageModalTitle}>Change language</h2>
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
      {isEditAvatarOpen && <EditAvatarModal onClose={() => setIsEditAvatarOpen(false)} />}
    </div>
  );
}
