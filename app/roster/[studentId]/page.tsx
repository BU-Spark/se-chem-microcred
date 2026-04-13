'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';

import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import editIcon from '@/public/assets/profile/edit.png';
import styles from './page.module.css';

type Contact = {
  id: string;
  type: 'INSTRUCTOR' | 'CHECKER';
  name: string;
  email: string;
  avatarUrl: string | null;
};

type StudentProfileBadge = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  status?: string;
  awardedAt?: string | null;
  score?: number | null;
};

type ProfileRole = 'STUDENT' | 'CHECKER';

type InstructorMemberProfileResponse = {
  memberRole: ProfileRole;
  member: {
    id: string;
    name: string | null;
    email: string | null;
    buid: string | null;
    gender: string | null;
    raceEthnicity: string | null;
    parentalEducation: string | null;
    pellGrantQualified: boolean | null;
    createdAt: string;
    avatar: {
      base: string;
      face: string;
      accessory: string | null;
    } | null;
  };
  course: {
    id: string;
    title: string;
    section: string | null;
    createdBy: {
      id: string;
      name: string | null;
      email: string | null;
      buid: string | null;
    } | null;
  };
  contacts: Contact[];
  badges: {
    inProgress: StudentProfileBadge[];
    notStarted: StudentProfileBadge[];
    completed: StudentProfileBadge[];
  };
};

function resolveParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function resolveProfileRole(role?: string | null): ProfileRole {
  return role === 'CHECKER' ? 'CHECKER' : 'STUDENT';
}

function profileLabel(role: ProfileRole) {
  return role === 'CHECKER' ? 'Assessor' : 'Student';
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

function splitNameForProfile(name?: string | null) {
  const trimmed = name?.trim();

  if (!trimmed) {
    return {
      headlineTop: 'Student,',
      headlineBottom: 'Profile',
      initials: 'ST',
    };
  }

  if (trimmed.includes(',')) {
    const [last, ...rest] = trimmed.split(',');
    const first = rest.join(',').trim();

    return {
      headlineTop: `${last.trim()},`,
      headlineBottom: first || 'Student',
      initials: `${last.trim().charAt(0)}${first.charAt(0)}`.toUpperCase(),
    };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return {
      headlineTop: `${parts[0]},`,
      headlineBottom: '',
      initials: parts[0].slice(0, 2).toUpperCase(),
    };
  }

  const first = parts.slice(0, -1).join(' ');
  const last = parts.at(-1) ?? '';

  return {
    headlineTop: `${last},`,
    headlineBottom: first,
    initials: `${first.charAt(0)}${last.charAt(0)}`.toUpperCase(),
  };
}

function formatPellGrant(value: boolean | null) {
  if (value == null) {
    return 'Not provided';
  }

  return value ? 'Yes' : 'No';
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Not available';
  }

  return parsed.toLocaleDateString();
}

function initialsFromName(name?: string | null) {
  return splitNameForProfile(name).initials || 'ST';
}

function Chevron({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="18"
      height="18"
      aria-hidden="true"
      className={[styles.chevron, isOpen ? styles.chevronOpen : ''].join(' ')}
    >
      <path
        d="M3 6.25 8 11l5-4.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BadgeGrid({
  badges,
  tone = 'progress',
}: {
  badges: StudentProfileBadge[];
  tone?: 'progress' | 'pending' | 'completed';
}) {
  if (badges.length === 0) {
    return <p className={styles.emptyState}>No badges in this section.</p>;
  }

  return (
    <div className={styles.badgeGrid}>
      {badges.map((badge) => (
        <div key={badge.id} className={styles.badgeItem}>
          <div
            className={[
              styles.badgeBubble,
              tone === 'pending' ? styles.badgeBubblePending : '',
              tone === 'completed' ? styles.badgeBubbleCompleted : '',
            ].join(' ')}
            aria-hidden="true"
          />
          <p className={styles.badgeName}>{badge.name}</p>
        </div>
      ))}
    </div>
  );
}

function useInstructorStudentProfile(
  courseId?: string | null,
  studentId?: string | null,
  role: ProfileRole = 'STUDENT',
  email?: string | null
) {
  const [data, setData] = useState<InstructorMemberProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberLabel = profileLabel(role).toLowerCase();

  const fetchData = useCallback(async () => {
    if (!courseId || !studentId || !email) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ email });

      if (role === 'CHECKER') {
        params.set('role', role);
      }

      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}?${params.toString()}`,
        {
          headers: { Accept: 'application/json' },
        }
      );

      const payload = await response.json().catch(() => ({
        error: `Request failed: ${response.status}`,
      }));

      if (!response.ok) {
        throw new Error(payload.error ?? `Unable to load ${memberLabel} details.`);
      }

      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : `Unable to load ${memberLabel} details.`);
    } finally {
      setIsLoading(false);
    }
  }, [courseId, studentId, role, email, memberLabel]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error };
}

export default function InstructorStudentProfilePage() {
  const params = useParams<{ studentId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDemographicOpen, setIsDemographicOpen] = useState(false);
  const [isNotStartedOpen, setIsNotStartedOpen] = useState(false);
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);

  const studentId = resolveParam(params?.studentId);
  const courseId = searchParams.get('courseId');
  const role = resolveProfileRole(searchParams.get('role'));
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const { data, isLoading, error } = useInstructorStudentProfile(courseId, studentId, role, email);
  const currentRole = data?.memberRole ?? role;
  const currentProfileLabel = profileLabel(currentRole);
  const currentProfileLabelLower = currentProfileLabel.toLowerCase();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/sign-in');
    } catch (signOutError) {
      console.error('Failed to sign out', signOutError);
      setIsSigningOut(false);
    }
  };

  const sideContact = useMemo(() => {
    if (!data) {
      return null;
    }

    if (currentRole === 'CHECKER') {
      return data.course.createdBy
        ? {
            id: data.course.createdBy.id,
            type: 'INSTRUCTOR' as const,
            name: data.course.createdBy.name ?? 'Course Instructor',
            email: data.course.createdBy.email ?? '',
            avatarUrl: null,
          }
        : null;
    }

    return data.contacts.find((contact) => contact.type === 'CHECKER') ?? null;
  }, [data, currentRole]);
  const sideContactTitle = currentRole === 'CHECKER' ? 'Instructor' : 'Checker';
  const emptyContactMessage = currentRole === 'CHECKER' ? 'No instructor assigned.' : 'No checker assigned.';
  const memberDisplay = useMemo(() => splitNameForProfile(data?.member.name), [data?.member.name]);
  const memberAvatarSrc = avatarAsset(data?.member.avatar?.base);
  const displayName = user?.fullName || 'Professor';

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <div className={styles.page}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={styles.main}>
        <div className={styles.content}>
          <header className={styles.header}>
            <h1 className={styles.pageTitle}>{currentProfileLabel} Profile</h1>
          </header>

          {!courseId && !isLoading ? (
            <p className={styles.statusMessage}>
              Open a {currentProfileLabelLower} from a course roster to view this page.
            </p>
          ) : null}

          {isLoading ? <p className={styles.statusMessage}>Loading {currentProfileLabelLower} profile...</p> : null}

          {!isLoading && error ? <p className={styles.statusMessage}>{error}</p> : null}

          {!isLoading && !error && data ? (
            <>
              <section className={styles.profileCard}>
                <div className={styles.profileMain}>
                  <div className={styles.infoColumn}>
                    <p className={styles.sectionKicker}>{currentProfileLabel} Info:</p>

                    <div className={styles.nameBlock}>
                      <h2 className={styles.studentName}>
                        <span>{memberDisplay.headlineTop}</span>
                        {memberDisplay.headlineBottom ? <span>{memberDisplay.headlineBottom}</span> : null}
                      </h2>

                      <div className={styles.metaBlock}>
                        <p className={styles.roleLabel}>{currentProfileLabel}</p>
                        <p className={styles.createdAt}>Date Created: {formatDate(data.member.createdAt)}</p>
                      </div>
                    </div>

                    <div className={styles.detailGrid}>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Email:</span>
                        <span className={styles.detailValue}>{data.member.email || 'Not provided'}</span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>BUID:</span>
                        <span className={styles.detailValue}>{data.member.buid || 'Not provided'}</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.avatarColumn}>
                    <div className={styles.avatarFrame}>
                      {data.member.avatar ? (
                        <Image
                          src={memberAvatarSrc}
                          alt={`${currentProfileLabel} avatar`}
                          width={196}
                          height={196}
                          className={styles.avatarImage}
                        />
                      ) : (
                        <div className={styles.avatarFallback}>{initialsFromName(data.member.name)}</div>
                      )}
                    </div>
                  </div>
                </div>

                <aside className={styles.profileSide}>
                  <button
                    type="button"
                    className={styles.dropdownToggle}
                    onClick={() => setIsDemographicOpen((current) => !current)}
                  >
                    <span>Demographic Info</span>
                    <Chevron isOpen={isDemographicOpen} />
                  </button>

                  {isDemographicOpen ? (
                    <div className={styles.demographicGrid}>
                      <div className={styles.demographicItem}>
                        <span className={styles.detailLabel}>Gender</span>
                        <span className={styles.detailValue}>{data.member.gender || 'Not provided'}</span>
                      </div>
                      <div className={styles.demographicItem}>
                        <span className={styles.detailLabel}>Race / Ethnicity</span>
                        <span className={styles.detailValue}>{data.member.raceEthnicity || 'Not provided'}</span>
                      </div>
                      <div className={styles.demographicItem}>
                        <span className={styles.detailLabel}>Parental Education</span>
                        <span className={styles.detailValue}>{data.member.parentalEducation || 'Not provided'}</span>
                      </div>
                      <div className={styles.demographicItem}>
                        <span className={styles.detailLabel}>Pell Grant Qualified</span>
                        <span className={styles.detailValue}>{formatPellGrant(data.member.pellGrantQualified)}</span>
                      </div>
                    </div>
                  ) : null}

                  <section className={styles.sideSection}>
                    <p className={styles.sideTitle}>Course Info:</p>
                    <p className={styles.sideMeta}>
                      {data.course.title}
                      <br />
                      Section: {data.course.section || 'Not provided'}
                    </p>
                  </section>

                  <section className={styles.sideSection}>
                    <p className={styles.sideTitle}>{sideContactTitle}</p>

                    {sideContact ? (
                      <div className={styles.contactCard}>
                        <div className={styles.contactAvatarShell}>
                          {sideContact.avatarUrl ? (
                            <Image
                              src={sideContact.avatarUrl}
                              alt={sideContact.name}
                              width={86}
                              height={86}
                              className={styles.contactAvatarImage}
                            />
                          ) : (
                            <div className={styles.contactAvatarFallback}>{initialsFromName(sideContact.name)}</div>
                          )}
                        </div>

                        <div className={styles.contactInfo}>
                          <p className={styles.contactName}>{splitNameForProfile(sideContact.name).headlineTop}</p>
                          <p className={styles.contactName}>{splitNameForProfile(sideContact.name).headlineBottom}</p>
                          <p className={styles.contactEmail}>{sideContact.email || 'Not provided'}</p>
                        </div>
                      </div>
                    ) : (
                      <p className={styles.emptyState}>{emptyContactMessage}</p>
                    )}
                  </section>

                  <div className={styles.cardStubAction}>
                    <span className={styles.editStub}>
                      Edit
                      <Image src={editIcon} alt="" width={15} height={15} />
                    </span>
                  </div>
                </aside>
              </section>

              <section className={styles.badgesCard}>
                <div className={styles.badgesHeader}>
                  <div>
                    <h2 className={styles.badgesTitle}>{currentProfileLabel} Badges</h2>
                  </div>

                  <div className={styles.badgesHeaderMeta}>
                    <span className={styles.badgesHint}>Select a badge to edit</span>
                    <span className={styles.editStub}>
                      Edit
                      <Image src={editIcon} alt="" width={15} height={15} />
                    </span>
                  </div>
                </div>

                <section className={styles.badgeSection}>
                  <h3 className={styles.badgeSectionTitle}>In-progress</h3>
                  <BadgeGrid badges={data.badges.inProgress} />
                </section>

                <button
                  type="button"
                  className={styles.accordionRow}
                  onClick={() => setIsNotStartedOpen((current) => !current)}
                >
                  <span>Not yet started</span>
                  <Chevron isOpen={isNotStartedOpen} />
                </button>

                {isNotStartedOpen ? (
                  <div className={styles.accordionPanel}>
                    <BadgeGrid badges={data.badges.notStarted} tone="pending" />
                  </div>
                ) : null}

                <button
                  type="button"
                  className={styles.accordionRow}
                  onClick={() => setIsCompletedOpen((current) => !current)}
                >
                  <span>Completed</span>
                  <Chevron isOpen={isCompletedOpen} />
                </button>

                {isCompletedOpen ? (
                  <div className={styles.accordionPanel}>
                    <BadgeGrid badges={data.badges.completed} tone="completed" />
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
