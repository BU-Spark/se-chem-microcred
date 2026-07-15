'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useSignOut } from '@/app/hooks/useSignOut';
import CollapsibleSection from '@/app/components/CollapsibleSection';

import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import YoutubeThumbnail from '@/app/_components/YoutubeThumbnail';
import { BadgeDetailCard, type BadgeDetailResponse, type BadgeDetailTone } from './BadgeDetailCard';
import { StudentBadgeConfigModal } from './StudentBadgeConfigModal';
import { MessageComposeModal } from './MessageComposeModal';
import styles from './page.module.css';

// Messaging is a work-in-progress feature gated behind the same dev flag as the
// Messages inbox nav item (see Sidebar). Only show the compose action when on.
const MESSAGING_ENABLED = (process.env.NEXT_PUBLIC_CURRENT_ENVIRONMENT_DEV ?? '').toLowerCase() === 'true';

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

  status?: string;
  awardedAt?: string | null;
  score?: number | null;
  youtubeUrl?: string | null;
};

type ProfileRole = 'STUDENT' | 'CHECKER' | 'INSTRUCTOR';

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
    sections: string[];
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
    readyForFinalization: StudentProfileBadge[];
    completed: StudentProfileBadge[];
  };
};

function resolveParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function profileLabel(role?: ProfileRole | null) {
  if (role === 'CHECKER') {
    return 'Assessor';
  }

  if (role === 'INSTRUCTOR') {
    return 'Instructor';
  }

  if (role === 'STUDENT') {
    return 'Student';
  }

  return 'User';
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

function useInstructorStudentProfile(courseId?: string | null, studentId?: string | null, email?: string | null) {
  const [data, setData] = useState<InstructorMemberProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        throw new Error(payload.error ?? 'Unable to load member details.');
      }

      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load member details.');
    } finally {
      setIsLoading(false);
    }
  }, [courseId, studentId, email]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error };
}

function useInstructorStudentBadgeDetail(
  courseId?: string | null,
  studentId?: string | null,
  badgeId?: string | null,
  email?: string | null
) {
  const [data, setData] = useState<BadgeDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!courseId || !studentId || !badgeId || !email) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ email });

      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}/badges/${encodeURIComponent(badgeId)}?${params.toString()}`,
        {
          headers: { Accept: 'application/json' },
        }
      );

      const payload = await response.json().catch(() => ({
        error: `Request failed: ${response.status}`,
      }));

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to load badge detail.');
      }

      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Unable to load badge detail.');
    } finally {
      setIsLoading(false);
    }
  }, [badgeId, courseId, studentId, email]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refresh: fetchData };
}

function BadgeGrid({
  badges,
  tone = 'progress',
  onSelectBadge,
}: {
  badges: StudentProfileBadge[];
  tone?: 'progress' | 'pending' | 'completed';
  onSelectBadge?: (badgeId: string) => void;
}) {
  if (badges.length === 0) {
    return <p className={styles.emptyState}>No badges in this section.</p>;
  }

  const isInteractive = tone !== 'pending' && typeof onSelectBadge === 'function';

  return (
    <div className={styles.badgeGrid}>
      {badges.map((badge) => {
        const badgeBubbleClass = [
          styles.badgeBubble,
          tone === 'completed' ? styles.badgeBubbleCompleted : '',
          isInteractive ? styles.badgeBubbleInteractive : '',
        ].join(' ');

        const badgeMarkup = (
          <>
            <div className={badgeBubbleClass}>
              <YoutubeThumbnail
                videoUrl={badge.youtubeUrl}
                alt={`${badge.name} thumbnail`}
                className={styles.badgeBubbleImage}
              />
            </div>
            <p className={styles.badgeName}>{badge.name}</p>
          </>
        );

        return (
          <div key={badge.id} className={styles.badgeItem}>
            {isInteractive ? (
              <button type="button" className={styles.badgeTokenButton} onClick={() => onSelectBadge?.(badge.id)}>
                {badgeMarkup}
              </button>
            ) : (
              <div className={styles.badgeTokenStatic}>{badgeMarkup}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function InstructorStudentProfilePage() {
  const params = useParams<{ studentId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn, user } = useUser();
  const signOut = useSignOut();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDemographicOpen, setIsDemographicOpen] = useState(false);
  const [isNotStartedOpen, setIsNotStartedOpen] = useState(false);
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);

  const studentId = resolveParam(params?.studentId);
  const courseId = searchParams.get('courseId');
  const selectedBadgeId = searchParams.get('badgeId');
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const { data, isLoading, error } = useInstructorStudentProfile(courseId, studentId, email);
  const currentRole = data?.memberRole ?? null;
  const currentProfileLabel = profileLabel(currentRole);
  const currentProfileLabelLower = currentProfileLabel.toLowerCase();
  const showBadgesSection = currentRole === 'STUDENT';
  const courseSectionsLabel = data?.course.sections.join(', ') ?? '';

  const selectedBadgeTone: BadgeDetailTone | null = useMemo(() => {
    if (!selectedBadgeId || !data) return null;
    const { inProgress, completed, readyForFinalization } = data.badges;
    const matches = (list: { id: string }[]) => list.some((badge) => badge.id === selectedBadgeId);
    if (matches(completed) || matches(readyForFinalization)) return 'completed';
    if (matches(inProgress)) return 'progress';
    return null;
  }, [data, selectedBadgeId]);

  const {
    data: selectedBadgeDetail,
    isLoading: isBadgeDetailLoading,
    error: badgeDetailError,
    refresh: refreshBadgeDetail,
  } = useInstructorStudentBadgeDetail(
    courseId,
    studentId,
    showBadgesSection && selectedBadgeTone ? selectedBadgeId : null,
    email
  );
  const selectedBadgeDisplayTone: BadgeDetailTone | null =
    selectedBadgeDetail?.progress.assessmentComplete === true ? 'completed' : selectedBadgeTone;

  const buildProfileHref = useCallback(
    (badgeId?: string | null) => {
      const params = new URLSearchParams(searchParams.toString());

      if (badgeId) {
        params.set('badgeId', badgeId);
      } else {
        params.delete('badgeId');
      }

      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname, searchParams]
  );

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, isSigningOut, router]);

  useEffect(() => {
    if (!data || !showBadgesSection || !selectedBadgeId || selectedBadgeTone) {
      return;
    }

    router.replace(buildProfileHref(null));
  }, [buildProfileHref, data, router, selectedBadgeId, selectedBadgeTone, showBadgesSection]);

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
    } catch (signOutError) {
      console.error('Failed to sign out', signOutError);
      setIsSigningOut(false);
    }
  };

  const handleBadgeSelect = useCallback(
    (badgeId: string) => {
      router.push(buildProfileHref(badgeId));
    },
    [buildProfileHref, router]
  );

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
  const displayName = data?.course.createdBy?.name || '';

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
                  <CollapsibleSection
                    title="Demographic Info"
                    isOpen={isDemographicOpen}
                    onToggle={() => setIsDemographicOpen((current) => !current)}
                    panelId="demographic-info"
                    buttonClassName={styles.dropdownToggle}
                    panelClassName={styles.demographicGrid}
                    chevronClassName={styles.chevron}
                    chevronOpenClassName={styles.chevronOpen}
                  >
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
                  </CollapsibleSection>

                  <section className={styles.sideSection}>
                    <p className={styles.sideTitle}>Course Info:</p>
                    <p className={styles.sideMeta}>
                      {data.course.title}
                      <br />
                      {data.course.sections.length > 1 ? 'Sections' : 'Section'}:{' '}
                      {courseSectionsLabel || 'Not provided'}
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
                </aside>
              </section>

              {showBadgesSection ? (
                selectedBadgeId && selectedBadgeTone ? (
                  <>
                    {isBadgeDetailLoading ? (
                      <section className={styles.detailCard}>
                        <p className={styles.statusMessage}>Loading badge details...</p>
                      </section>
                    ) : null}

                    {!isBadgeDetailLoading && badgeDetailError ? (
                      <section className={styles.detailCard}>
                        <p className={styles.statusMessage}>{badgeDetailError}</p>
                      </section>
                    ) : null}

                    {!isBadgeDetailLoading && !badgeDetailError && selectedBadgeDetail && selectedBadgeDisplayTone ? (
                      <>
                        <BadgeDetailCard detail={selectedBadgeDetail} tone={selectedBadgeDisplayTone} />
                        <div className={styles.assessmentActionRow}>
                          <button type="button" className={styles.assessmentLink} onClick={() => setIsConfigOpen(true)}>
                            Edit configurations
                          </button>
                          {selectedBadgeDisplayTone === 'progress' ? (
                            <Link
                              href={`/assessments/${courseId}/students/${studentId}/badges/${selectedBadgeId}`}
                              className={styles.assessmentLink}
                            >
                              Open Assessment View
                            </Link>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </>
                ) : (
                  <section className={styles.badgesCard}>
                    <div className={styles.badgesHeader}>
                      <div>
                        <h2 className={styles.badgesTitle}>{currentProfileLabel} Badges</h2>
                      </div>

                      <div className={styles.badgesHeaderMeta}>
                        <span className={styles.badgesHint}>Select a badge to view details</span>
                        {MESSAGING_ENABLED ? (
                          <button
                            type="button"
                            className={styles.assessmentLink}
                            onClick={() => setIsMessageOpen(true)}
                          >
                            Message student
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <section className={styles.badgeSection}>
                      <h3 className={styles.badgeSectionTitle}>In-progress</h3>
                      <BadgeGrid badges={data.badges.inProgress} onSelectBadge={handleBadgeSelect} />
                    </section>

                    <section className={styles.badgeSection}>
                      <h3 className={styles.badgeSectionTitle}>Ready for finalization</h3>
                      <BadgeGrid
                        badges={data.badges.readyForFinalization}
                        tone="completed"
                        onSelectBadge={handleBadgeSelect}
                      />
                    </section>

                    <section className={styles.badgeSection}>
                      <CollapsibleSection
                        title="Not yet started"
                        isOpen={isNotStartedOpen}
                        onToggle={() => setIsNotStartedOpen((current) => !current)}
                        panelId="not-started-badges"
                        buttonClassName={styles.accordionRow}
                        panelClassName={styles.accordionPanel}
                        chevronClassName={styles.chevron}
                        chevronOpenClassName={styles.chevronOpen}
                      >
                        <BadgeGrid badges={data.badges.notStarted} tone="pending" />
                      </CollapsibleSection>
                    </section>

                    <section className={styles.badgeSection}>
                      <CollapsibleSection
                        title="Completed"
                        isOpen={isCompletedOpen}
                        onToggle={() => setIsCompletedOpen((current) => !current)}
                        panelId="completed-badges"
                        buttonClassName={styles.accordionRow}
                        panelClassName={styles.accordionPanel}
                        chevronClassName={styles.chevron}
                        chevronOpenClassName={styles.chevronOpen}
                      >
                        <BadgeGrid badges={data.badges.completed} tone="completed" onSelectBadge={handleBadgeSelect} />
                      </CollapsibleSection>
                    </section>
                  </section>
                )
              ) : null}
            </>
          ) : null}
        </div>
      </main>

      {isConfigOpen && selectedBadgeDetail && courseId && studentId && selectedBadgeId && email ? (
        <StudentBadgeConfigModal
          studentName={data?.member.name ?? 'Student'}
          courseId={courseId}
          studentId={studentId}
          badgeId={selectedBadgeId}
          email={email}
          initial={{
            reassessmentLimit: selectedBadgeDetail.badge.reassessmentLimit ?? null,
            cooldownDays: selectedBadgeDetail.badge.cooldownDays ?? null,
            reassessmentRequired: selectedBadgeDetail.badge.reassessmentRequired ?? null,
            allowCooldownOverride: selectedBadgeDetail.badge.allowCooldownOverride ?? false,
          }}
          onClose={() => setIsConfigOpen(false)}
          onSaved={() => {
            void refreshBadgeDetail();
          }}
        />
      ) : null}

      {MESSAGING_ENABLED && isMessageOpen && courseId && studentId ? (
        <MessageComposeModal
          studentName={data?.member.name ?? 'Student'}
          courseId={courseId}
          studentId={studentId}
          onClose={() => setIsMessageOpen(false)}
        />
      ) : null}
    </div>
  );
}
