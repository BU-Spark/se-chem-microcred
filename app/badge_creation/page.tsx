'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import type { BadgeCategory } from '@prisma/client';
import { useStudentData } from '../hooks/useStudentData';
import styles from './page.module.css';

type StepKey = 'badgeInfo' | 'lessonVideo' | 'checkpoints' | 'configurations' | 'rubric' | 'review';

type StepDefinition = {
  key: StepKey;
  label: string;
};

type CheckpointDraft = {
  id: string;
  title: string;
  time: string;
  points: number;
  question: string;
  options: string[];
  correctIndex: number;
  segmentLabel: string;
};

type RubricCriterion = {
  id: string;
  prompt: string;
  failingFeedback: string;
  coachingFeedback: string;
  passingFeedback: string;
};

type BadgeDraft = {
  badgeName: string;
  badgeDescription: string;
  category: BadgeCategory;
  availableOn: string;
  closesOn: string;
  neverCloses: boolean;
  youtubeUrl: string;
  videoTitle: string;
  videoLength: string;
  checkpoints: CheckpointDraft[];
  reassessmentLimit: number;
  cooldownDays: number;
  reassessmentRequired: boolean;
  reassessmentResources: string[];
  rubricOverview: string;
  rubricCriteria: RubricCriterion[];
};

const DRAFT_STORAGE_KEY = 'badge_creation_draft_v1';
const DEFAULT_VIDEO_FALLBACK = 'How to use a Bunsen Burner';

const STEP_DEFINITIONS: StepDefinition[] = [
  { key: 'badgeInfo', label: 'Badge Info' },
  { key: 'lessonVideo', label: 'Upload Lesson Video' },
  { key: 'checkpoints', label: 'Create Checkpoints' },
  { key: 'rubric', label: 'Create Rubric' },
  { key: 'review', label: 'Review' },
];

const DEFAULT_DRAFT: BadgeDraft = {
  badgeName: 'Bunsen Burner',
  badgeDescription:
    'While the hot plate has become the standard for heating aqueous reactions, the Bunsen burner retains its importance for precise flame applications, particularly in higher-temperature tasks like dehydrating salts and conducting flame tests. Additionally, it is commonly used in biological research labs for high-heat sterilization purposes. Knowing how to deliver consistent heating with a burner is paramount for its effective and safe utilization.',
  category: 'EQUIPMENT',
  availableOn: '2025-11-03',
  closesOn: '2025-12-10',
  neverCloses: false,
  youtubeUrl: 'https://www.youtube.com/watch?v=4l0iG6kQk8Q',
  videoTitle: DEFAULT_VIDEO_FALLBACK,
  videoLength: '00:20:00',
  checkpoints: [
    {
      id: 'checkpoint-1',
      title: 'Checkpoint 1',
      time: '00:03:00',
      points: 5,
      question: 'What is the safest first adjustment before lighting the burner?',
      options: [
        'Close or partially close the air hole',
        'Open the gas valve fully',
        'Remove the burner collar',
        'Disconnect the tubing',
      ],
      correctIndex: 0,
      segmentLabel: 'Segment 1 Starts 00:00:00',
    },
    {
      id: 'checkpoint-2',
      title: 'Checkpoint 2',
      time: '00:08:00',
      points: 5,
      question: 'Which flame color indicates the burner is adjusted correctly?',
      options: ['Bright orange', 'Tight blue flame', 'White spark', 'No visible flame'],
      correctIndex: 1,
      segmentLabel: 'Segment 2 Starts 00:05:00',
    },
    {
      id: 'checkpoint-3',
      title: 'Checkpoint 3',
      time: '00:13:00',
      points: 10,
      question: 'Why should the gas valve handle be perpendicular when off?',
      options: [
        'It confirms gas flow is stopped',
        'It makes the flame taller',
        'It keeps the tubing warm',
        'It increases air intake',
      ],
      correctIndex: 0,
      segmentLabel: 'Segment 3 Starts 00:10:00',
    },
  ],
  reassessmentLimit: 3,
  cooldownDays: 4,
  reassessmentRequired: true,
  reassessmentResources: ['https://reassessmentvideolinkgoeshere', 'https://reassessmentvideolinkgoeshere'],
  rubricOverview:
    'Make sure the lab bench is clear of flammable materials. Make sure the natural gas flow is off before connecting the burner or whenever the burner is not in use. The gas valve handle should be perpendicular to the nozzle when at the off position. Firmly connect the tubing from the burner to the gas nozzle. Close or partially close the air hole by adjusting the collar on the burner to make it easier to light. Turn on the gas nozzle to allow natural gas into the burner, then adjust after the flame is lit.',
  rubricCriteria: [
    {
      id: 'criterion-1',
      prompt: 'Student could identify the on and off positions of the gas valve.',
      failingFeedback: 'Did not identify the gas valve positions.',
      coachingFeedback: 'Attempted to identify the valve positions but needed support.',
      passingFeedback: 'Correctly identified the gas valve positions with confidence.',
    },
    {
      id: 'criterion-2',
      prompt: 'Student correctly adjusted the burner to get a tight and blue flame.',
      failingFeedback: 'Did not adjust the flame.',
      coachingFeedback: 'Attempted to adjust but did not succeed.',
      passingFeedback: 'Adjusted the flame correctly.',
    },
    {
      id: 'criterion-3',
      prompt: 'Student could explain why they adjusted the gas nozzle and collar.',
      failingFeedback: 'Unable to explain the purpose of the collar or gas nozzle.',
      coachingFeedback: 'Could explain one adjustment but not both.',
      passingFeedback: 'Clearly explained the purpose of each adjustment.',
    },
  ],
};

function initialsFromName(name?: string | null) {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return initials.join('') || 'ST';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractYouTubeId(url?: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '') || null;
    }

    const queryId = parsed.searchParams.get('v');
    if (queryId) return queryId;

    const parts = parsed.pathname.split('/');
    const embedIndex = parts.indexOf('embed');
    if (embedIndex >= 0) {
      return parts[embedIndex + 1] ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

function formatDisplayDate(dateValue: string, fallback = 'Not scheduled') {
  if (!dateValue) return fallback;

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return fallback;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildVideoEmbedUrl(url: string) {
  const videoId = extractYouTubeId(url);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

function buildVideoThumbnail(url: string) {
  const videoId = extractYouTubeId(url);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

function ProgressStep({ index, activeIndex, label }: { index: number; activeIndex: number; label: string }) {
  const isComplete = index < activeIndex;
  const isActive = index === activeIndex;

  return (
    <div className={styles.progressStep}>
      <div className={styles.progressLine} aria-hidden={index === 0} data-complete={isComplete ? 'true' : 'false'} />
      <div
        className={styles.progressDot}
        data-active={isActive ? 'true' : 'false'}
        data-complete={isComplete ? 'true' : 'false'}
      >
        {(isActive || isComplete) && <span className={styles.progressDotFill} />}
      </div>
      <span className={styles.progressLabel}>{label}</span>
    </div>
  );
}

export default function BadgeCreationPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoaded, isSignedIn } = useUser();
  const { signOut } = useAuth();
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);

  const [currentStep, setCurrentStep] = useState(0);
  const [draft, setDraft] = useState<BadgeDraft>(DEFAULT_DRAFT);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [submissionState, setSubmissionState] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!storedDraft) return;

    try {
      const parsed = JSON.parse(storedDraft) as Partial<BadgeDraft>;
      setDraft((current) => ({
        ...current,
        ...parsed,
        checkpoints: parsed.checkpoints ?? current.checkpoints,
        reassessmentResources: parsed.reassessmentResources ?? current.reassessmentResources,
        rubricCriteria: parsed.rubricCriteria ?? current.rubricCriteria,
      }));
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  const navItems = [
    { label: 'Home', href: '/' },
    { label: 'Profile', href: '/profile' },
    { label: 'My Analytics', href: '/analytics' },
    { label: 'Badge Wallet', href: '/badges' },
    { label: 'My Badges', href: '/my_badges' },
    { label: 'Grades', href: '/grades' },
    { label: 'Settings', href: '/settings' },
  ];

  const displayName = studentData?.student?.name || user?.fullName || 'Professor';
  const activeStep = STEP_DEFINITIONS[currentStep];
  const videoEmbedUrl = buildVideoEmbedUrl(draft.youtubeUrl);
  const videoThumbnail = buildVideoThumbnail(draft.youtubeUrl);

  const badgePayload = useMemo(
    () => ({
      badge: {
        slug: slugify(draft.badgeName),
        name: draft.badgeName,
        description: draft.badgeDescription,
        category: draft.category,
      },
      requirements: [],
      lesson: {
        title: draft.videoTitle || draft.badgeName,
        slug: `${slugify(draft.badgeName)}-lesson`,
        summary: draft.badgeDescription.slice(0, 120),
        description: draft.badgeDescription,
        dueDate: draft.neverCloses ? null : draft.closesOn || null,
        segments: [
          {
            title: draft.videoTitle || DEFAULT_VIDEO_FALLBACK,
            summary: `Embedded training for ${draft.badgeName}`,
            videoUrl: draft.youtubeUrl,
            durationLabel: draft.videoLength,
          },
        ],
        checkpoints: draft.checkpoints.map((checkpoint, index) => ({
          sortOrder: index,
          title: checkpoint.title,
          questionCount: 1,
          timeOffsetSeconds: checkpoint.time,
          description: checkpoint.question,
          questions: [
            {
              prompt: checkpoint.question,
              options: checkpoint.options,
              correctIndex: checkpoint.correctIndex,
            },
          ],
        })),
        skills: [],
      },
      rubric: {
        overview: draft.rubricOverview,
        criteria: draft.rubricCriteria,
      },
      surveyPrompts: [
        {
          context: 'BADGE',
          question: `How prepared did this badge leave you to safely perform ${draft.badgeName}?`,
        },
      ],
    }),
    [draft]
  );

  if (!isLoaded || !isSignedIn) return null;

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/sign-in');
    } catch (error) {
      console.error('Sign out failed', error);
      setIsSigningOut(false);
    }
  };

  const updateDraft = <K extends keyof BadgeDraft>(field: K, value: BadgeDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setSubmissionState(null);
  };

  const updateCheckpoint = <K extends keyof CheckpointDraft>(
    checkpointId: string,
    field: K,
    value: CheckpointDraft[K]
  ) => {
    updateDraft(
      'checkpoints',
      draft.checkpoints.map((checkpoint) =>
        checkpoint.id === checkpointId ? { ...checkpoint, [field]: value } : checkpoint
      )
    );
  };

  const updateCheckpointOption = (checkpointId: string, optionIndex: number, value: string) => {
    updateDraft(
      'checkpoints',
      draft.checkpoints.map((checkpoint) => {
        if (checkpoint.id !== checkpointId) return checkpoint;
        const nextOptions = checkpoint.options.map((option, index) => (index === optionIndex ? value : option));
        return { ...checkpoint, options: nextOptions };
      })
    );
  };

  const addCheckpoint = () => {
    const nextCount = draft.checkpoints.length + 1;
    updateDraft('checkpoints', [
      ...draft.checkpoints,
      {
        id: `checkpoint-${Date.now()}`,
        title: `Checkpoint ${nextCount}`,
        time: '00:00:00',
        points: 5,
        question: '',
        options: ['', '', '', ''],
        correctIndex: 0,
        segmentLabel: `Segment ${Math.max(nextCount, 1)} Starts 00:00:00`,
      },
    ]);
  };

  const removeCheckpoint = (checkpointId: string) => {
    updateDraft(
      'checkpoints',
      draft.checkpoints.filter((checkpoint) => checkpoint.id !== checkpointId)
    );
  };

  

  const updateRubricCriterion = <K extends keyof RubricCriterion>(
    criterionId: string,
    field: K,
    value: RubricCriterion[K]
  ) => {
    updateDraft(
      'rubricCriteria',
      draft.rubricCriteria.map((criterion) =>
        criterion.id === criterionId ? { ...criterion, [field]: value } : criterion
      )
    );
  };

  const goToStep = (stepIndex: number) => {
    setCurrentStep(stepIndex);
    setSubmissionState(null);
  };

  const handleNext = () => {
    if (currentStep < STEP_DEFINITIONS.length - 1) {
      setCurrentStep((step) => step + 1);
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }

    setSubmissionState(
      'Badge creation draft saved locally from the review step. No server-side create endpoint exists yet, so the flow currently preserves a schema-ready draft and returns you to My Badges.'
    );

    window.setTimeout(() => {
      router.push('/my_badges');
    }, 1200);
  };

  return (
    <div className="page">
      <aside className="sidebar">
        <div className="profile">
          <div className="avatar">{initialsFromName(displayName)}</div>
          <div className="name">{displayName}</div>
        </div>

        <nav className="navList" aria-label="Main">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`navItem${isActive ? ' navItemActive' : ''}`}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebarFooter">
          <button type="button" onClick={handleSignOut} className="signOffButton" disabled={isSigningOut}>
            {isSigningOut ? 'Signing off...' : 'Sign off'}
          </button>
        </div>
      </aside>

      <main className="main">
        <div className={styles.pageShell}>
          <header className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>Create a Badge</h1>
            </div>
            <span className={styles.wordmark}>checkd.</span>
          </header>

          <section className={styles.progressTrack} aria-label="Badge creation steps">
            {STEP_DEFINITIONS.map((step, index) => (
              <ProgressStep key={step.key} index={index} activeIndex={currentStep} label={step.label} />
            ))}
          </section>

          <section className={styles.canvasCard}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.cardEyebrow}>{activeStep.label}</p>
                <h2 className={styles.cardTitle}>
                  {activeStep.key === 'checkpoints' ? 'Add Checkpoints for:' : draft.badgeName}
                </h2>
                {activeStep.key === 'checkpoints' && (
                  <p className={styles.cardSubtitle}>
                    Select where you want to add a checkpoint in the video timeline, and click the plus button to create
                    the checkpoint.
                  </p>
                )}
              </div>
            </div>

            {submissionState ? <div className={styles.noticeBanner}>{submissionState}</div> : null}

            {currentStep === 0 && (
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
                  />
                </div>

                <div className={styles.badgeInfoField}>
                  <label className={styles.sectionLabel}>Content Availability</label>
                  <div className={styles.availabilityRow}>
                    <div className={styles.availabilityPill}>
                      <span>Content Available On:</span>
                      <strong>{formatDisplayDate(draft.availableOn)}</strong>
                    </div>
                    <div className={styles.availabilityPill}>
                      <span>Content Closes On:</span>
                      <strong>{draft.neverCloses ? 'Never closes' : formatDisplayDate(draft.closesOn)}</strong>
                    </div>
                    <label className={styles.compactToggleRow}>
                      <span>Never closes</span>
                      <button
                        type="button"
                        className={styles.toggleButton}
                        data-active={draft.neverCloses ? 'true' : 'false'}
                        onClick={() => updateDraft('neverCloses', !draft.neverCloses)}
                        aria-pressed={draft.neverCloses}
                      >
                        <span />
                      </button>
                    </label>
                  </div>

                  <div className={styles.availabilityInputs}>
                    <label className={styles.dateField}>
                      <span>Available on</span>
                      <input
                        type="date"
                        value={draft.availableOn}
                        onChange={(event) => updateDraft('availableOn', event.target.value)}
                      />
                    </label>
                    <label className={styles.dateField}>
                      <span>Closes on</span>
                      <input
                        type="date"
                        value={draft.closesOn}
                        disabled={draft.neverCloses}
                        onChange={(event) => updateDraft('closesOn', event.target.value)}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className={styles.videoStepLayout}>
                <div className={styles.videoInputPanel}>
                  <div className={styles.fieldBlock}>
                    <label className={styles.fieldLabel} htmlFor="youtubeUrl">
                      Paste YouTube link here
                    </label>
                    <input
                      id="youtubeUrl"
                      className={styles.textField}
                      value={draft.youtubeUrl}
                      onChange={(event) => updateDraft('youtubeUrl', event.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                  </div>

                  <div className={styles.fieldBlock}>
                    <label className={styles.fieldLabel} htmlFor="videoTitle">
                      Video Title
                    </label>
                    <input
                      id="videoTitle"
                      className={styles.textField}
                      value={draft.videoTitle}
                      onChange={(event) => updateDraft('videoTitle', event.target.value)}
                    />
                  </div>

                  <div className={styles.fieldBlock}>
                    <label className={styles.fieldLabel} htmlFor="videoLength">
                      Length
                    </label>
                    <input
                      id="videoLength"
                      className={styles.textField}
                      value={draft.videoLength}
                      onChange={(event) => updateDraft('videoLength', event.target.value)}
                      placeholder="00:20:00"
                    />
                  </div>
                </div>

                <div className={styles.videoPreviewPanel}>
                  <div className={styles.videoInfoBlock}>
                    <h3>{draft.videoTitle || DEFAULT_VIDEO_FALLBACK}</h3>
                    <p>Length: {draft.videoLength || '00:00:00'}</p>
                  </div>
                  <div
                    className={styles.videoPoster}
                    style={videoThumbnail ? { backgroundImage: `url(${videoThumbnail})` } : undefined}
                  >
                    {!videoThumbnail && <span>Video preview</span>}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className={styles.checkpointLayout}>
                <div className={styles.timelineRail}>
                  <div className={styles.timelineHeader}>
                    <span># of Checkpoints: {draft.checkpoints.length}</span>
                    <button type="button" className={styles.plusButton} onClick={addCheckpoint}>
                      +
                    </button>
                  </div>

                  <div className={styles.timelineList}>
                    {draft.checkpoints.map((checkpoint, index) => (
                      <div key={checkpoint.id} className={styles.timelineItem}>
                        <div className={styles.timelineSegment}>{checkpoint.segmentLabel}</div>
                        <div className={styles.timelineCheckpointMarker} />
                        <div className={styles.timelineCheckpointCopy}>
                          {checkpoint.title} {checkpoint.points} points
                        </div>
                        <button
                          type="button"
                          className={styles.removeTextButton}
                          onClick={() => removeCheckpoint(checkpoint.id)}
                        >
                          Remove
                        </button>
                        {index < draft.checkpoints.length - 1 && <div className={styles.timelineConnector} />}
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.checkpointMain}>
                  <div className={styles.videoFrameShell}>
                    {videoEmbedUrl ? (
                      <iframe
                        className={styles.videoFrame}
                        src={videoEmbedUrl}
                        title={draft.videoTitle || 'Lesson video'}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <div className={styles.videoFallback}>Paste a valid YouTube link to load the training video.</div>
                    )}
                  </div>

                  <div className={styles.checkpointEditorList}>
                    {draft.checkpoints.map((checkpoint) => (
                      <article key={checkpoint.id} className={styles.editorCard}>
                        <div className={styles.editorCardHeader}>
                          <h3>{checkpoint.title}</h3>
                          <span>{checkpoint.time}</span>
                        </div>

                        <div className={styles.editorGrid}>
                          <label className={styles.fieldStack}>
                            <span>Segment label</span>
                            <input
                              className={styles.textField}
                              value={checkpoint.segmentLabel}
                              onChange={(event) => updateCheckpoint(checkpoint.id, 'segmentLabel', event.target.value)}
                            />
                          </label>

                          <label className={styles.fieldStack}>
                            <span>Timestamp</span>
                            <input
                              className={styles.textField}
                              value={checkpoint.time}
                              onChange={(event) => updateCheckpoint(checkpoint.id, 'time', event.target.value)}
                            />
                          </label>

                          <label className={styles.fieldStack}>
                            <span>Points</span>
                            <input
                              className={styles.textField}
                              type="number"
                              min={1}
                              value={checkpoint.points}
                              onChange={(event) =>
                                updateCheckpoint(checkpoint.id, 'points', Number(event.target.value) || 1)
                              }
                            />
                          </label>
                        </div>

                        <label className={styles.fieldStack}>
                          <span>Question prompt</span>
                          <textarea
                            className={styles.textAreaCompact}
                            value={checkpoint.question}
                            onChange={(event) => updateCheckpoint(checkpoint.id, 'question', event.target.value)}
                          />
                        </label>

                        <div className={styles.optionList}>
                          {checkpoint.options.map((option, optionIndex) => (
                            <label key={`${checkpoint.id}-option-${optionIndex}`} className={styles.optionRow}>
                              <input
                                type="radio"
                                name={`${checkpoint.id}-correct`}
                                checked={checkpoint.correctIndex === optionIndex}
                                onChange={() => updateCheckpoint(checkpoint.id, 'correctIndex', optionIndex)}
                              />
                              <input
                                className={styles.textField}
                                value={option}
                                placeholder={`Choice ${optionIndex + 1}`}
                                onChange={(event) =>
                                  updateCheckpointOption(checkpoint.id, optionIndex, event.target.value)
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            )}


            {currentStep === 3 && (
              <div className={styles.rubricLayout}>
                <div className={styles.editorCard}>
                  <h3 className={styles.panelTitle}>Create Rubric</h3>
                  <textarea
                    className={styles.longTextArea}
                    value={draft.rubricOverview}
                    onChange={(event) => updateDraft('rubricOverview', event.target.value)}
                  />
                </div>

                <div className={styles.editorCard}>
                  <h3 className={styles.panelTitle}>Instructor Grading</h3>
                  <div className={styles.rubricList}>
                    {draft.rubricCriteria.map((criterion) => (
                      <div key={criterion.id} className={styles.rubricCriterionCard}>
                        <label className={styles.fieldStack}>
                          <span>Criterion</span>
                          <textarea
                            className={styles.textAreaCompact}
                            value={criterion.prompt}
                            onChange={(event) => updateRubricCriterion(criterion.id, 'prompt', event.target.value)}
                          />
                        </label>
                        <div className={styles.feedbackGrid}>
                          <label className={styles.fieldStack}>
                            <span>Needs work feedback</span>
                            <input
                              className={styles.textField}
                              value={criterion.failingFeedback}
                              onChange={(event) =>
                                updateRubricCriterion(criterion.id, 'failingFeedback', event.target.value)
                              }
                            />
                          </label>
                          <label className={styles.fieldStack}>
                            <span>Coaching feedback</span>
                            <input
                              className={styles.textField}
                              value={criterion.coachingFeedback}
                              onChange={(event) =>
                                updateRubricCriterion(criterion.id, 'coachingFeedback', event.target.value)
                              }
                            />
                          </label>
                          <label className={styles.fieldStack}>
                            <span>Passing feedback</span>
                            <input
                              className={styles.textField}
                              value={criterion.passingFeedback}
                              onChange={(event) =>
                                updateRubricCriterion(criterion.id, 'passingFeedback', event.target.value)
                              }
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className={styles.reviewStack}>
                <article className={styles.reviewCard}>
                  <div className={styles.reviewCardHeader}>
                    <h3>Badge Info</h3>
                    <button type="button" onClick={() => goToStep(0)}>
                      Edit
                    </button>
                  </div>
                  <h4>{draft.badgeName}</h4>
                  <p>{draft.badgeDescription}</p>
                  <p>
                    <strong>Content Available:</strong> {formatDisplayDate(draft.availableOn)} to{' '}
                    {draft.neverCloses ? 'Never closes' : formatDisplayDate(draft.closesOn)}
                  </p>
                </article>

                <article className={styles.reviewCard}>
                  <div className={styles.reviewCardHeader}>
                    <h3>Lesson Video</h3>
                    <button type="button" onClick={() => goToStep(1)}>
                      Edit
                    </button>
                  </div>
                  <p>{draft.youtubeUrl}</p>
                  <div className={styles.videoInfoBlock}>
                    <h4>{draft.videoTitle}</h4>
                    <p>Length: {draft.videoLength}</p>
                  </div>
                </article>

                <article className={styles.reviewCard}>
                  <div className={styles.reviewCardHeader}>
                    <h3>Checkpoints</h3>
                    <button type="button" onClick={() => goToStep(2)}>
                      Edit
                    </button>
                  </div>
                  <p># of Checkpoints: {draft.checkpoints.length}</p>
                  <div className={styles.reviewList}>
                    {draft.checkpoints.map((checkpoint) => (
                      <div key={checkpoint.id} className={styles.reviewListItem}>
                        <strong>{checkpoint.title}</strong>
                        <span>{checkpoint.segmentLabel}</span>
                        <span>{checkpoint.question}</span>
                      </div>
                    ))}
                  </div>
                </article>


                <article className={styles.reviewCard}>
                  <div className={styles.reviewCardHeader}>
                    <h3>Rubric</h3>
                    <button type="button" onClick={() => goToStep(3)}>
                      Edit
                    </button>
                  </div>
                  <p>{draft.rubricOverview}</p>
                  <div className={styles.reviewList}>
                    {draft.rubricCriteria.map((criterion) => (
                      <div key={criterion.id} className={styles.reviewListItem}>
                        <strong>{criterion.prompt}</strong>
                        <span>{criterion.passingFeedback}</span>
                      </div>
                    ))}
                  </div>
                </article>

                
              </div>
            )}

            <div className={styles.navigationRow}>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => setCurrentStep((step) => Math.max(step - 1, 0))}
                disabled={currentStep === 0}
              >
                Back
              </button>
              <button type="button" className={styles.nextButton} onClick={handleNext}>
                {currentStep === STEP_DEFINITIONS.length - 1 ? 'Finish' : 'Next'}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
