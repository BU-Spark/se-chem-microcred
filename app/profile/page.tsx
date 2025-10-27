'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { useStudentData } from '../hooks/useStudentData';
import styles from './page.module.css';

function initialsFromName(name?: string | null) {
  if (!name) {
    return 'ST';
  }
  const parts = name.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  return initials.join('') || 'ST';
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.9} stroke="#1f5fab" className={styles.editIcon}>
      <path d="m14.8 5.2 3.3 3.3M5 19l1.4-4.9 8.4-8.4 3.3 3.3-8.4 8.4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  return { first, last, isFallback: false };
}

function avatarAssetForBase(base?: string | null) {
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

  const navItems = [
    { label: 'Home', href: '/' },
    { label: 'Profile', href: '/profile' },
    { label: 'My Analytics', href: '/analytics' },
    { label: 'Badge Wallet', href: '/badges' },
    { label: 'Grades', href: '/grades' },
    { label: 'Settings', href: '/settings' },
  ];

  const rawDisplayName = studentData?.student.name ?? user?.name ?? null;
  const { first: firstName, isFallback } = parseName(rawDisplayName);
  const displayName = rawDisplayName ?? 'Student';
  const greetingName = isFallback ? 'Student' : firstName;
  const fullPrimaryName = rawDisplayName ?? 'Name not provided';
  const studentEmail = studentData?.student.email || user?.email || 'Not provided';
  const buid = studentData?.student.buid || 'Not provided';
  const createdAt = studentData?.student.createdAt
    ? new Date(studentData.student.createdAt).toLocaleDateString()
    : 'Not available';
  const gender = studentData?.student.gender || 'Not provided';
  const raceEthnicity = studentData?.student.raceEthnicity || 'Not provided';
  const parentalEducation = studentData?.student.parentalEducation || 'Not provided';
  const pellGrantQualified =
    studentData?.student.pellGrantQualified == null
      ? 'Not provided'
      : studentData.student.pellGrantQualified
        ? 'Yes'
        : 'No';

  const instructorContacts = studentData?.course?.contacts.filter((contact) => contact.type === 'INSTRUCTOR') ?? [];
  const checkerContacts = studentData?.course?.contacts.filter((contact) => contact.type === 'CHECKER') ?? [];
  const courseTitle = studentData?.course?.title || 'Course information not available';
  const courseSection = studentData?.course?.section || 'Not provided';
  const avatarSrc = avatarAssetForBase(studentData?.student.avatar?.base);

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
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.profileSummary}>
          <div className={styles.profileSummaryAvatar}>{initialsFromName(displayName)}</div>
          <div className={styles.profileSummaryName}>{displayName}</div>
        </div>
        <nav className={styles.navList}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const navItemClass = `${styles.navItem} ${isActive ? styles.navItemActive : ''}`.trim();
            return (
              <Link key={item.href} href={item.href} className={navItemClass}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.sidebarFooter}>
          <button type="button" onClick={handleSignOut} className={styles.signOffButton} disabled={isSigningOut}>
            {isSigningOut ? 'Signing off…' : 'Sign off'}
          </button>
          <div className={styles.brandFooter}>checkd.</div>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.headerRow}>
          <h1 className={styles.greeting}>Hello, {greetingName}</h1>
          <div className={styles.brandMark}>checkd.</div>
        </header>

        <section className={styles.profileCard}>
          <div className={styles.infoColumn}>
            <div>
              <h2 className={styles.sectionTitle}>Student Info:</h2>
              <div className={styles.nameBlock}>
                <div className={styles.primaryName}>{fullPrimaryName}</div>
                <div className={styles.roleLabel}>Student</div>
                <div className={styles.metaLine}>Date Created: {createdAt}</div>
              </div>
            </div>
            <div className={styles.detailGrid}>
              <div>
                <div className={styles.detailLabel}>Email:</div>
                <div className={styles.detailValue}>{studentEmail}</div>
              </div>
              <div>
                <div className={styles.detailLabel}>BUID:</div>
                <div className={styles.detailValue}>{buid}</div>
              </div>
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

          <div className={styles.avatarColumn}>
            <div className={styles.avatarFrame}>
              <Image src={avatarSrc} alt="Student avatar" width={180} height={180} className={styles.avatarImage} />
            </div>
            <Link href="/edit_avatar" className={styles.editAvatarLink}>
              Edit avatar <PenIcon />
            </Link>
          </div>

          <span className={styles.cardDivider} aria-hidden="true" />

          <aside className={styles.courseColumn}>
            <div className={styles.courseSection}>
              <h2 className={styles.sectionTitle}>Course Info:</h2>
              <div className={styles.courseMeta}>
                {courseTitle}
                <br />
                Section: {courseSection}
              </div>
            </div>
            <div className={styles.courseSection}>
              <h2 className={styles.sectionTitle}>Instructor</h2>
              <div className={styles.contactList}>
                {instructorContacts.length === 0 ? (
                  <div className={styles.emptyState}>No instructors listed.</div>
                ) : (
                  instructorContacts.map((contact) => (
                    <div key={contact.id} className={styles.contactItem}>
                      <div className={styles.contactAvatar}>
                        <Image
                          src={contact.avatarUrl ?? '/edit_avatar/emerald.svg'}
                          alt={contact.name}
                          width={60}
                          height={60}
                        />
                      </div>
                      <div className={styles.contactInfo}>
                        <span className={styles.contactName}>{contact.name}</span>
                        <span className={styles.contactEmail}>{contact.email}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className={styles.courseSection}>
              <h2 className={styles.sectionTitle}>Checker</h2>
              <div className={styles.contactList}>
                {checkerContacts.length === 0 ? (
                  <div className={styles.emptyState}>No checkers listed.</div>
                ) : (
                  checkerContacts.map((contact) => (
                    <div key={contact.id} className={styles.contactItem}>
                      <div className={styles.contactAvatar}>
                        <Image
                          src={contact.avatarUrl ?? '/edit_avatar/amethyst.svg'}
                          alt={contact.name}
                          width={60}
                          height={60}
                        />
                      </div>
                      <div className={styles.contactInfo}>
                        <span className={styles.contactName}>{contact.name}</span>
                        <span className={styles.contactEmail}>{contact.email}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </section>

        <div className={styles.editInfoRow}>
          <button type="button" className={styles.editInfoButton}>
            Edit Info
          </button>
        </div>
      </main>
    </div>
  );
}
