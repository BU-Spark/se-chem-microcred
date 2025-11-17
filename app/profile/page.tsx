'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { useStudentData } from '../hooks/useStudentData';
import styles from './page.module.css';
import editIcon from '../../assets/profile/edit.png';

const NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'Profile', href: '/profile' },
  { label: 'My Analytics', href: '/analytics' },
  { label: 'Badge Wallet', href: '/badges' },
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
  name: string;
  type: string;
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

export default function ProfilePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user, signOut } = useAuth();
  const { data: studentData } = useStudentData(user?.email);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  const displayName = studentData?.student.name ?? user?.name ?? 'Student';
  const { first: firstName, last: lastName, isFallback } = parseName(studentData?.student.name ?? user?.name ?? null);

  const greetingName = isFallback ? 'Student' : firstName;
  const studentEmail = studentData?.student.email ?? user?.email ?? 'Not provided';
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
            const navClass = `navItem ${isActive ? 'navItemActive' : ''} ${styles.sidebarNavItem} ${
              isActive ? styles.sidebarNavItemActive : ''
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
          <div className="brandFooter">checkd.</div>
        </div>
      </aside>

      <main className="main">
        <div className={styles.pageContent}>
          <header className={styles.headerRow}>
            <h1 className={styles.greeting}>Hello, {greetingName}</h1>
            <div className="brandMark">checkd.</div>
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
                      <div className={styles.detailValue}>{buid}</div>
                    </div>
                  </div>
                </div>

                {/* Demographic Info section */}
                <div className={styles.demographicSection}>
                  <h3 className={styles.demographicTitle}>Demographic Info:</h3>
                  <div className={styles.detailGrid}>
                    <div>
                      <div className={styles.detailLabel}>Gender:</div>
                      <div className={styles.detailValue}>{gender}</div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Race/Ethnicity:</div>
                      <div className={styles.detailValue}>{raceEthnicity}</div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Parental Education:</div>
                      <div className={styles.detailValue}>{parentalEducation}</div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Pell Grant Qualified?</div>
                      <div className={styles.detailValue}>{pellGrantQualified}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Avatar column */}
              <div className={styles.avatarColumn}>
                <div className={styles.avatarFrame}>
                  <Image src={avatarSrc} alt="Student avatar" fill className={styles.avatarImage} />
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
              <button type="button" className={styles.editInfoButton}>
                Edit Info
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
