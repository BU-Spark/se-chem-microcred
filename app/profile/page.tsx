'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import styles from './page.module.css';

type Contact = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
};

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
    return { first: 'First Name', last: 'Last Name', isFallback: true };
  }
  const tokens = fullName.trim().split(/\s+/);
  if (tokens.length === 1) {
    return { first: tokens[0], last: 'Last Name', isFallback: false };
  }
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  return { first, last, isFallback: false };
}

export default function ProfilePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user, signOut } = useAuth();
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

  const { first: firstName, last: lastName, isFallback } = parseName(user?.name);
  const displayName = user?.name || `${lastName}, ${firstName}`;
  const greetingName = isFallback ? 'Student' : firstName;
  const fullPrimaryName = isFallback ? 'Last Name, First Name' : `${lastName}, ${firstName}`;
  const studentEmail = user?.emailAddresses?.[0]?.emailAddress || 'student@bu.edu';
  const buid = user?.id ? user.id.slice(0, 8).padEnd(8, 'X').toUpperCase() : 'UXXXXXXX';

  const contacts: Contact[] = [
    {
      id: 'instructor',
      name: 'Last Name, First Name',
      email: 'prof@bu.edu',
      role: 'Instructor',
      avatar: '/edit_avatar/emerald.svg',
    },
    {
      id: 'checker',
      name: 'Last Name, First Name',
      email: 'ta@bu.edu',
      role: 'Checker',
      avatar: '/edit_avatar/amethyst.svg',
    },
  ];

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
                <div className={styles.metaLine}>Date Created: XX/XX/XXXX</div>
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
                <div className={styles.detailValue}>Female</div>
              </div>
              <div>
                <div className={styles.detailLabel}>Race/Ethnicity:</div>
                <div className={styles.detailValue}>Asian</div>
              </div>
              <div>
                <div className={styles.detailLabel}>Parental Education:</div>
                <div className={styles.detailValue}>Masters degree</div>
              </div>
              <div>
                <div className={styles.detailLabel}>Pell Grant Qualified?</div>
                <div className={styles.detailValue}>Yes</div>
              </div>
            </div>
          </div>

          <div className={styles.avatarColumn}>
            <div className={styles.avatarFrame}>
              <Image
                src="/edit_avatar/sapphire.svg"
                alt="Student avatar"
                width={180}
                height={180}
                className={styles.avatarImage}
              />
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
                Chem101
                <br />
                Section: K1
              </div>
            </div>
            <div className={styles.courseSection}>
              <h2 className={styles.sectionTitle}>Instructor</h2>
              <div className={styles.contactList}>
                {contacts.slice(0, 1).map((contact) => (
                  <div key={contact.id} className={styles.contactItem}>
                    <div className={styles.contactAvatar}>
                      <Image src={contact.avatar} alt={contact.name} width={60} height={60} />
                    </div>
                    <div className={styles.contactInfo}>
                      <span className={styles.contactName}>{contact.name}</span>
                      <span className={styles.contactEmail}>{contact.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.courseSection}>
              <h2 className={styles.sectionTitle}>Checker</h2>
              <div className={styles.contactList}>
                {contacts.slice(1).map((contact) => (
                  <div key={contact.id} className={styles.contactItem}>
                    <div className={styles.contactAvatar}>
                      <Image src={contact.avatar} alt={contact.name} width={60} height={60} />
                    </div>
                    <div className={styles.contactInfo}>
                      <span className={styles.contactName}>{contact.name}</span>
                      <span className={styles.contactEmail}>{contact.email}</span>
                    </div>
                  </div>
                ))}
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
