'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';

import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import rosterStyles from '@/app/roster/[studentId]/page.module.css';
import styles from './page.module.css';

type Contact = {
  id: string;
  type: 'INSTRUCTOR' | 'CHECKER';
  name: string;
  email: string;
  avatarUrl: string | null;
};

type StudentProfileResponse = {
  memberRole: 'STUDENT' | 'CHECKER' | 'INSTRUCTOR';
  member: {
    id: string;
    name: string | null;
    email: string | null;
    buid: string | null;
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
};

type BadgeDetailResponse = {
  badge: {
    id: string;
    name: string;
    description: string | null;
    status: string;
  };
  progress: {
    percentComplete: number;
    precheckComplete: boolean;
    assessmentComplete: boolean;
    currentCheckpoint: string | null;
    totalCheckpoints: number;
    completedCheckpoints: number;
  };
  assessment?: {
    criteria: Array<{
      id: string;
      criterionKey: string;
      criterion: string;
      options: string[];
      sortOrder: number;
    }>;
  };
};

type CriterionDraft = {
  criterionKey: string;
  criterion: string;
  selectedOption: string;
  notes: string;
  passed: boolean;
  sortOrder: number;
};

function resolveParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
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

function initialsFromName(name?: string | null) {
  return splitNameForProfile(name).initials || 'ST';
}

function contactDisplayName(name?: string | null, email?: string | null) {
  return name?.trim() || email?.trim() || 'Instructor';
}

function useAssessmentReadiness(
  courseId?: string | null,
  studentId?: string | null,
  badgeId?: string | null,
  email?: string | null
) {
  const [profile, setProfile] = useState<StudentProfileResponse | null>(null);
  const [badgeDetail, setBadgeDetail] = useState<BadgeDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!courseId || !studentId || !badgeId || !email) {
      setProfile(null);
      setBadgeDetail(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ email });
      const [profileResponse, badgeResponse] = await Promise.all([
        fetch(`/api/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}?${params}`, {
          headers: { Accept: 'application/json' },
        }),
        fetch(
          `/api/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}/badges/${encodeURIComponent(
            badgeId
          )}?${params}`,
          {
            headers: { Accept: 'application/json' },
          }
        ),
      ]);

      const profilePayload = await profileResponse.json().catch(() => ({
        error: `Request failed: ${profileResponse.status}`,
      }));
      const badgePayload = await badgeResponse.json().catch(() => ({
        error: `Request failed: ${badgeResponse.status}`,
      }));

      if (!profileResponse.ok) {
        throw new Error(profilePayload.error ?? 'Unable to load student profile.');
      }

      if (!badgeResponse.ok) {
        throw new Error(badgePayload.error ?? 'Unable to load badge readiness.');
      }

      setProfile(profilePayload);
      setBadgeDetail(badgePayload);
    } catch (err) {
      setProfile(null);
      setBadgeDetail(null);
      setError(err instanceof Error ? err.message : 'Unable to load assessment readiness.');
    } finally {
      setIsLoading(false);
    }
  }, [badgeId, courseId, email, studentId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { profile, badgeDetail, isLoading, error, refresh: fetchData };
}

export default function AssessmentReadinessPage() {
  const params = useParams<{ courseId: string; studentId: string; badgeId: string }>();
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isAssessmentStarted, setIsAssessmentStarted] = useState(false);
  const [criterionDrafts, setCriterionDrafts] = useState<CriterionDraft[]>([]);
  const [score, setScore] = useState('100');
  const [passed, setPassed] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const courseId = resolveParam(params?.courseId);
  const studentId = resolveParam(params?.studentId);
  const badgeId = resolveParam(params?.badgeId);
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const { profile, badgeDetail, isLoading, error } = useAssessmentReadiness(courseId, studentId, badgeId, email);

  useEffect(() => {
    if (isLoaded && !isSignedIn && !isSigningOut) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, isSigningOut, router]);

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

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    if (profile && badgeDetail) {
      router.push(`/roster/${profile.member.id}?courseId=${profile.course.id}&badgeId=${badgeDetail.badge.id}`);
      return;
    }

    router.push(courseId ? `/courses/${courseId}` : '/');
  };

  const memberDisplay = useMemo(() => splitNameForProfile(profile?.member.name), [profile?.member.name]);
  const instructor = profile?.course.createdBy ?? null;
  const sideContact = profile?.contacts.find((contact) => contact.type === 'INSTRUCTOR') ?? instructor;
  const canStartAssessment = badgeDetail?.progress.precheckComplete === true;
  const assessmentComplete = badgeDetail?.progress.assessmentComplete === true;
  const canStartNewAssessment = canStartAssessment && !assessmentComplete;
  const assessmentStatus = badgeDetail?.progress.assessmentComplete ? 'Complete' : 'Incomplete';
  const currentStep = badgeDetail?.progress.currentCheckpoint || (canStartAssessment ? 'Assessment' : 'Precheck');
  const displayName = user?.fullName || profile?.course.createdBy?.name || '';

  useEffect(() => {
    if (!badgeDetail) {
      setCriterionDrafts([]);
      return;
    }

    const criteria = badgeDetail.assessment?.criteria ?? [];

    setCriterionDrafts(
      criteria.length > 0
        ? criteria.map((criterion, index) => ({
            criterionKey: criterion.criterionKey,
            criterion: criterion.criterion,
            selectedOption: criterion.options[0] ?? '',
            notes: '',
            passed: true,
            sortOrder: criterion.sortOrder ?? index,
          }))
        : [
            {
              criterionKey: 'overall',
              criterion: 'Overall badge performance',
              selectedOption: '',
              notes: '',
              passed: true,
              sortOrder: 0,
            },
          ]
    );
    setIsAssessmentStarted(false);
    setSubmitError(null);
  }, [badgeDetail]);

  const updateCriterionDraft = (criterionKey: string, patch: Partial<CriterionDraft>) => {
    setCriterionDrafts((current) =>
      current.map((criterion) => (criterion.criterionKey === criterionKey ? { ...criterion, ...patch } : criterion))
    );
  };

  const submitAssessment = async () => {
    if (!courseId || !studentId || !badgeId || !email) {
      return;
    }

    const parsedScore = Number(score);

    if (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      setSubmitError('Enter a score from 0 to 100.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitStatus(null);

    try {
      const params = new URLSearchParams({ email });
      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}/badges/${encodeURIComponent(
          badgeId
        )}?${params}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            passed,
            score: Math.round(parsedScore),
            feedback,
            criteria: criterionDrafts,
          }),
        }
      );
      const payload = await response.json().catch(() => ({
        error: `Request failed: ${response.status}`,
      }));

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to record assessment.');
      }

      setSubmitStatus(passed ? 'Assessment recorded. Badge is ready for finalization.' : 'Assessment recorded.');
      setIsAssessmentStarted(false);
      router.push(`/courses/${courseId}?view=assessor`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to record assessment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return (
    <div className={rosterStyles.page}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={rosterStyles.main}>
        <div className={rosterStyles.content}>
          <button type="button" className={styles.topBackLink} onClick={handleBack}>
            <span aria-hidden="true">←</span> Back
          </button>

          <header className={rosterStyles.header}>
            <h1 className={rosterStyles.pageTitle}>{badgeDetail?.badge.name ?? 'Assessment'}</h1>
          </header>

          {isLoading ? <p className={rosterStyles.statusMessage}>Loading assessment readiness...</p> : null}
          {!isLoading && error ? <p className={rosterStyles.statusMessage}>{error}</p> : null}

          {!isLoading && !error && profile && badgeDetail ? (
            <>
              <section className={rosterStyles.profileCard}>
                <div className={rosterStyles.profileMain}>
                  <div className={rosterStyles.infoColumn}>
                    <p className={rosterStyles.sectionKicker}>Student Info:</p>
                    <div className={rosterStyles.nameBlock}>
                      <h2 className={rosterStyles.studentName}>
                        <span>{memberDisplay.headlineTop}</span>
                        {memberDisplay.headlineBottom ? <span>{memberDisplay.headlineBottom}</span> : null}
                      </h2>
                    </div>

                    <div className={rosterStyles.detailGrid}>
                      <div className={rosterStyles.detailItem}>
                        <span className={rosterStyles.detailLabel}>Email:</span>
                        <span className={rosterStyles.detailValue}>{profile.member.email || 'Not provided'}</span>
                      </div>
                      <div className={rosterStyles.detailItem}>
                        <span className={rosterStyles.detailLabel}>BUID:</span>
                        <span className={rosterStyles.detailValue}>{profile.member.buid || 'Not provided'}</span>
                      </div>
                    </div>
                  </div>

                  <div className={rosterStyles.avatarColumn}>
                    <div className={rosterStyles.avatarFrame}>
                      {profile.member.avatar ? (
                        <Image
                          src={avatarAsset(profile.member.avatar.base)}
                          alt="Student avatar"
                          width={196}
                          height={196}
                          className={rosterStyles.avatarImage}
                        />
                      ) : (
                        <div className={rosterStyles.avatarFallback}>{initialsFromName(profile.member.name)}</div>
                      )}
                    </div>
                  </div>
                </div>

                <aside className={rosterStyles.profileSide}>
                  <section className={rosterStyles.sideSection}>
                    <p className={rosterStyles.sideTitle}>Course Info:</p>
                    <p className={rosterStyles.sideMeta}>
                      {profile.course.title}
                      <br />
                      {profile.course.sections.length > 1 ? 'Sections' : 'Section'}:{' '}
                      {profile.course.sections.join(', ') || 'Not provided'}
                    </p>
                  </section>

                  <section className={rosterStyles.sideSection}>
                    <p className={rosterStyles.sideTitle}>Instructor</p>
                    {sideContact ? (
                      <div className={rosterStyles.contactCard}>
                        <div className={rosterStyles.contactAvatarShell}>
                          {'avatarUrl' in sideContact && sideContact.avatarUrl ? (
                            <Image
                              src={sideContact.avatarUrl}
                              alt={contactDisplayName(sideContact.name, sideContact.email)}
                              width={86}
                              height={86}
                              className={rosterStyles.contactAvatarImage}
                            />
                          ) : (
                            <div className={rosterStyles.contactAvatarFallback}>
                              {initialsFromName(contactDisplayName(sideContact.name, sideContact.email))}
                            </div>
                          )}
                        </div>
                        <div className={rosterStyles.contactInfo}>
                          <p className={rosterStyles.contactName}>
                            {contactDisplayName(sideContact.name, sideContact.email)}
                          </p>
                          <p className={rosterStyles.contactEmail}>{sideContact.email || 'Not provided'}</p>
                        </div>
                      </div>
                    ) : (
                      <p className={rosterStyles.emptyState}>No instructor assigned.</p>
                    )}
                  </section>
                </aside>
              </section>

              <section className={rosterStyles.detailCard}>
                <div className={rosterStyles.detailCardHeader}>
                  <span className={rosterStyles.detailCardKicker}>Student Progress for:</span>
                  <span className={rosterStyles.detailCardHeading}>{badgeDetail.badge.name}</span>
                </div>

                <div className={styles.readinessBody}>
                  <div className={rosterStyles.progressStatusColumn}>
                    <p className={rosterStyles.progressStatusLine}>
                      <span className={rosterStyles.progressStatusLabel}>Precheck status:</span>{' '}
                      <span className={rosterStyles.progressStatusValue}>
                        {badgeDetail.progress.precheckComplete ? 'Complete' : 'Incomplete'}
                      </span>
                    </p>
                    <p className={rosterStyles.progressStatusLine}>
                      <span className={rosterStyles.progressStatusLabel}>Assessment status:</span>{' '}
                      <span className={rosterStyles.progressStatusValue}>{assessmentStatus}</span>
                    </p>
                    <p className={rosterStyles.progressStatusLine}>
                      <span className={rosterStyles.progressStatusLabel}>Currently at:</span>{' '}
                      <span className={rosterStyles.progressStatusValue}>{currentStep}</span>
                    </p>
                  </div>

                  <div className={styles.clearanceRow}>
                    <span className={canStartAssessment ? styles.clearanceSuccess : styles.clearanceBlocked}>
                      {canStartAssessment ? '✓' : '×'}
                    </span>
                    <strong>{canStartAssessment ? 'Cleared for Assessment' : 'Not cleared for Assessment'}</strong>
                  </div>

                  {!canStartAssessment ? (
                    <div className={styles.unablePanel}>
                      <h2>Unable to assess</h2>
                      <p>This student still has the following requirements:</p>
                      <p>
                        Precheck progress: {badgeDetail.progress.completedCheckpoints} of{' '}
                        {badgeDetail.progress.totalCheckpoints} checkpoints complete
                      </p>
                      <p>
                        Please have the student complete the requirement before attempting an in-person assessment. If
                        you think this is a mistake, contact your instructor.
                      </p>
                    </div>
                  ) : null}

                  {canStartNewAssessment && isAssessmentStarted ? (
                    <div className={styles.assessmentPanel}>
                      <div className={styles.assessmentPanelHeader}>
                        <h2>Assessor Grading</h2>
                        <div className={styles.passToggle} role="group" aria-label="Assessment outcome">
                          <button
                            type="button"
                            className={passed ? styles.toggleButtonActive : styles.toggleButton}
                            onClick={() => setPassed(true)}
                          >
                            Pass
                          </button>
                          <button
                            type="button"
                            className={!passed ? styles.toggleButtonActive : styles.toggleButton}
                            onClick={() => setPassed(false)}
                          >
                            Needs reassessment
                          </button>
                        </div>
                      </div>

                      <label className={styles.scoreField}>
                        <span>Score</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={score}
                          onChange={(event) => setScore(event.target.value)}
                        />
                      </label>

                      <div className={styles.criteriaList}>
                        {criterionDrafts.map((criterion) => (
                          <div key={criterion.criterionKey} className={styles.criterionCard}>
                            <div className={styles.criterionHeader}>
                              <h3>{criterion.criterion}</h3>
                              <label className={styles.criterionPass}>
                                <input
                                  type="checkbox"
                                  checked={criterion.passed}
                                  onChange={(event) =>
                                    updateCriterionDraft(criterion.criterionKey, { passed: event.target.checked })
                                  }
                                />
                                Met
                              </label>
                            </div>

                            {badgeDetail.assessment?.criteria.find(
                              (entry) => entry.criterionKey === criterion.criterionKey
                            )?.options.length ? (
                              <label className={styles.criteriaField}>
                                <span>Observed outcome</span>
                                <select
                                  value={criterion.selectedOption}
                                  onChange={(event) =>
                                    updateCriterionDraft(criterion.criterionKey, {
                                      selectedOption: event.target.value,
                                    })
                                  }
                                >
                                  {badgeDetail.assessment.criteria
                                    .find((entry) => entry.criterionKey === criterion.criterionKey)
                                    ?.options.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            ) : null}

                            <label className={styles.criteriaField}>
                              <span>Notes</span>
                              <textarea
                                value={criterion.notes}
                                onChange={(event) =>
                                  updateCriterionDraft(criterion.criterionKey, { notes: event.target.value })
                                }
                                rows={3}
                              />
                            </label>
                          </div>
                        ))}
                      </div>

                      <label className={styles.criteriaField}>
                        <span>Overall feedback</span>
                        <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={4} />
                      </label>

                      {submitError ? <p className={styles.errorText}>{submitError}</p> : null}
                    </div>
                  ) : null}

                  {submitStatus ? <p className={styles.successText}>{submitStatus}</p> : null}
                </div>
              </section>

              <div className={styles.actionRow}>
                <button type="button" className={styles.backLink} onClick={handleBack}>
                  Back
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={!canStartNewAssessment || isSubmitting}
                  onClick={() => {
                    if (!isAssessmentStarted) {
                      setIsAssessmentStarted(true);
                      return;
                    }

                    void submitAssessment();
                  }}
                >
                  {assessmentComplete
                    ? 'Assessment complete'
                    : isAssessmentStarted
                      ? isSubmitting
                        ? 'Recording...'
                        : 'Submit Assessment'
                      : 'Confirm and Start'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
