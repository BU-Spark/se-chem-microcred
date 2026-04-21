'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, useUser, useClerk } from '@clerk/nextjs';
import { useStudentData } from '../hooks/useStudentData';
import styles from './page.module.css';
import editIcon from '../../public/assets/profile/edit.png';

const NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'Profile', href: '/profile' },
  { label: 'My Analytics', href: '/analytics' },
  { label: 'Badge Wallet', href: '/badges' },
  { label: 'My Badges', href: '/my_badges' },
  { label: 'Grades', href: '/grades' },
  { label: 'Settings', href: '/settings' },
];

function initialsFromName(name?: string | null) {
  if (!name) {
    return 'ST';
  }
  const tokens = name.split(/\s+/).filter(Boolean);
  return (
    tokens
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'ST'
  );
}

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
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const clerk = useClerk();

  const { data: studentData, refresh: refreshStudentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // ---------- 1. Sensitive-data visibility ----------
  const [sensitiveHidden, setSensitiveHidden] = useState(true);
  const [sensitiveTimerId, setSensitiveTimerId] = useState<ReturnType<typeof setTimeout> | null>(null);

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

  const handleShowSensitive = async () => {
    try {
      await requestReauthentication();
      const confirmed = window.confirm('Did you finish re-authentication?');
      if (!confirmed) return;
      setSensitiveHidden(false);
      restartSensitiveTimer();
    } catch {
      // keep hidden on failure
    }
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

  const displayName = studentData?.student.name ?? user?.fullName ?? 'Student';
  const {
    first: firstName,
    last: lastName,
    isFallback,
  } = parseName(studentData?.student.name ?? user?.fullName ?? null);

  const greetingName = isFallback ? 'Student' : firstName;
  const studentEmail = studentData?.student.email ?? user?.primaryEmailAddress?.emailAddress ?? 'Not provided';
  const buid = studentData?.student.buid ?? 'Not provided';
  const createdAt = studentData?.student.createdAt
    ? new Date(studentData.student.createdAt).toLocaleDateString()
    : 'Not available';

  const gender = studentData?.student.gender ?? 'Not provided';
  const raceEthnicity = studentData?.student.raceEthnicity ?? 'Not provided';
  const parentalEducation = studentData?.student.parentalEducation ?? 'Not provided';
  const pellGrantQualified =
    studentData?.student.pellGrantQualified == null
      ? 'Not provided'
      : studentData.student.pellGrantQualified
        ? 'Yes'
        : 'No';

  const instructorContacts = studentData?.course?.contacts.filter((contact) => contact.type === 'INSTRUCTOR') ?? [];
  const checkerContacts = studentData?.course?.contacts.filter((contact) => contact.type === 'CHECKER') ?? [];
  const courseTitle = studentData?.course?.title ?? 'Course information not available';
  const courseSection = studentData?.course?.section ?? 'Not provided';
  const avatarSrc = avatarAsset(studentData?.student.avatar?.base);

  return (
    <div className="page">
      <aside className="sidebar">
        <div className={`${styles.sidebarProfile} profile`}>
          <div className={`${styles.sidebarAvatar} avatar`}>{initialsFromName(displayName)}</div>
          <div className={`${styles.sidebarName} name`}>{displayName}</div>
        </div>
        <nav className={`${styles.sidebarNavList} navList`} aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const navClass = `navItem ${isActive ? 'navItemActive' : ''} ${styles.sidebarNavItem} ${isActive ? styles.sidebarNavItemActive : ''
              }`.trim();
            return (
              <Link key={item.href} href={item.href} className={navClass}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebarFooter">
          <button type="button" className="signOffButton" onClick={handleSignOut} disabled={isSigningOut}>
            {isSigningOut ? 'Signing off…' : 'Sign off'}
          </button>
        </div>
      </aside>

      <main className="main">
        <div className={styles.pageContent}>
          <header className={styles.headerRow}>
            <h1 className={styles.greeting}>Hello, {greetingName}</h1>
          </header>

          <section className={styles.profileCard}>
            {/* LEFT PANEL: student info + avatar */}
            <div className={styles.leftPanel}>
              <div className={styles.infoColumn}>
                <div>
                  <h2 className={styles.sectionTitle}>Student Info:</h2>

                  {/* Name block: big name + subtitle (Student + Date) */}
                  <div className={styles.nameBlock}>
                    <div className={styles.primaryName}>
                      {firstName}
                      {lastName ? (
                        <>
                          <br />
                          {lastName}
                        </>
                      ) : null}
                    </div>

                    <div className={styles.subtitleBlock}>
                      <div className={styles.roleLabel}>Student</div>
                      <div className={styles.metaLine}>Date Created: {createdAt}</div>
                    </div>
                  </div>

                  {/* Email / BUID row */}
                  <div className={styles.detailGridTop}>
                    <div>
                      <div className={styles.detailLabel}>Email:</div>
                      <div className={styles.detailValue}>{studentEmail}</div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>BUID:</div>
                      <div className={`${styles.detailValue} ${sensitiveHidden ? styles.sensitiveValueMasked : ''}`}>
                        {sensitiveHidden ? 'XXXXXXX' : buid}
                      </div>
                    </div>
                  </div>

                  {/* New: change password & language links */}
                  <div className={styles.inlineActionsRow}>
                    <button type="button" className={styles.inlineLink} onClick={handleChangePassword}>
                      Change Password
                    </button>
                    <button type="button" className={styles.inlineLink} onClick={handleOpenLanguageModal}>
                      Change Language
                    </button>
                  </div>

                  {/* Sensitive toggle button */}
                  <div className={styles.sensitiveToggleRow}>
                    {sensitiveHidden ? (
                      <button type="button" className={styles.sensitiveToggleButton} onClick={handleShowSensitive}>
                        Show BUID & demographic info
                      </button>
                    ) : (
                      <span className={styles.sensitiveStatusText}>
                        Sensitive info visible (auto-hides after 10 minutes)
                      </span>
                    )}
                  </div>
                </div>

                {/* Demographic Info section */}
                <div className={styles.demographicSection}>
                  <h3 className={styles.demographicTitle}>Demographic Info:</h3>
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
                </div>
              </div>

              {/* Avatar column */}
              <div className={styles.avatarColumn}>
                <div className={styles.avatarFrame}>
                  <Image src={avatarSrc} alt="Student avatar" width={220} height={220} className={styles.avatarImage} />
                </div>

                <Link href="/edit_avatar" className={styles.editAvatarLink}>
                  <span className={styles.editAvatarText}>Edit avatar</span>
                  <Image src={editIcon} alt="Edit avatar" width={16} height={16} className={styles.editAvatarIcon} />
                </Link>
              </div>
            </div>

            {/* RIGHT PANEL: course info with vertical divider */}
            <aside className={styles.courseColumn}>
              {/* Course info */}
              <div className={styles.courseSection}>
                <h2 className={`${styles.sectionTitle} ${styles.courseInfoTitle}`}>Course Info:</h2>
                <div className={styles.courseMeta}>
                  {courseTitle}
                  <br />
                  Section: {courseSection}
                </div>
              </div>

              {/* Instructor */}
              <div className={styles.courseSection}>
                <h2 className={`${styles.sectionTitle} ${styles.instructorTitle}`}>Instructor</h2>
                <div className={styles.contactList}>
                  {instructorContacts.length === 0 ? (
                    <div className={styles.emptyState}>No instructors listed.</div>
                  ) : (
                    instructorContacts.map((contact) => {
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

              {/* Checker */}
              <div className={styles.courseSection}>
                <h2 className={`${styles.sectionTitle} ${styles.checkerTitle}`}>Checker</h2>
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
            </aside>

            {/* Edit Info button inside card, aligned to bottom-right */}
            <div className={styles.editInfoRow}>
              <button type="button" className={styles.editInfoButton} onClick={handleOpenDemographicModal}>
                Edit Info
              </button>
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
    </div>
  );
}
