'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import type { BadgeCategory } from '@prisma/client';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
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
  questionType: 'multipleChoice' | 'shortAnswer';
  options: string[];
  correctIndices: number[];
  numericAnswer: string;
  numericRangeMin: string;
  numericRangeMax: string;
  segmentLabel: string;
};

type RubricCriterion = {
  id: string;
  prompt: string;
  options: string[];
};

type RubricItem = {
  id: string;
  text: string;
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
  rubricItems: RubricItem[];
  rubricCriteria: RubricCriterion[];
};

type BadgeCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  category: BadgeCategory | null;
  requirements: Array<{
    displayText: string;
    rubricItems: Array<{ number: number; text: string }>;
    gradingCriteria: Array<{ number: number; criterion: string | null; options: string[] }>;
    checkpoints?: Array<Partial<CheckpointDraft> & { number?: number; correctIndex?: number | null }>;
    lesson: {
      title: string;
      description: string | null;
      dueDate: string | null;
      estimatedMinutes: number | null;
      segment: {
        title: string;
        duration: number | null;
        videoUrl: string | null;
      } | null;
    } | null;
  }>;
};

type BadgesResponse = {
  badges: BadgeCatalogItem[];
};

const DRAFT_STORAGE_KEY = 'badge_creation_draft_v1';
const DEFAULT_VIDEO_FALLBACK = 'Lesson video';

const STEP_DEFINITIONS: StepDefinition[] = [
  { key: 'badgeInfo', label: 'Badge Info' },
  { key: 'lessonVideo', label: 'Upload Lesson Video' },
  { key: 'checkpoints', label: 'Create Checkpoints' },
  { key: 'rubric', label: 'Create Rubric' },
  { key: 'review', label: 'Review' },
];

const DEFAULT_DRAFT: BadgeDraft = {
  badgeName: '',
  badgeDescription: '',
  category: 'OTHER',
  availableOn: '',
  closesOn: '',
  neverCloses: true,
  youtubeUrl: '',
  videoTitle: '',
  videoLength: '',
  checkpoints: [
    {
      id: 'checkpoint-1',
      title: 'Checkpoint 1',
      time: '00:00:00',
      points: 5,
      question: '',
      questionType: 'multipleChoice',
      options: ['', '', '', ''],
      correctIndices: [0],
      numericAnswer: '',
      numericRangeMin: '',
      numericRangeMax: '',
      segmentLabel: 'Segment 1 Starts 00:00:00',
    },
  ],
  reassessmentLimit: 0,
  cooldownDays: 0,
  reassessmentRequired: false,
  reassessmentResources: [],
  rubricOverview: '',
  rubricItems: [
    {
      id: 'rubric-item-1',
      text: '',
    },
  ],
  rubricCriteria: [
    {
      id: 'criterion-1',
      prompt: '',
      options: ['', '', ''],
    },
  ],
};

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

function formatDateInput(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toISOString().slice(0, 10);
}

function formatDurationInput(seconds?: number | null, fallbackMinutes?: number | null) {
  const totalSeconds = seconds ?? (fallbackMinutes ? fallbackMinutes * 60 : 0);
  if (!totalSeconds) return '';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function checkpointFromCatalog(
  checkpoint: (Partial<CheckpointDraft> & { number?: number; correctIndex?: number | null }) | undefined,
  index: number
): CheckpointDraft {
  const title = checkpoint?.title || `Checkpoint ${index + 1}`;
  const options = checkpoint?.options?.length ? checkpoint.options : ['', '', '', ''];
  const correctIndices =
    checkpoint?.correctIndices?.length && checkpoint.correctIndices.every((optionIndex) => typeof optionIndex === 'number')
      ? checkpoint.correctIndices
      : typeof checkpoint?.correctIndex === 'number'
        ? [checkpoint.correctIndex]
        : [0];

  return {
    id: `checkpoint-${index + 1}`,
    title,
    time: checkpoint?.time || '00:00:00',
    points: Number(checkpoint?.points) || 5,
    question: checkpoint?.question || '',
    questionType: checkpoint?.questionType === 'shortAnswer' ? 'shortAnswer' : 'multipleChoice',
    options: [...options, '', '', '', ''].slice(0, Math.max(4, options.length)),
    correctIndices,
    numericAnswer: checkpoint?.numericAnswer ? String(checkpoint.numericAnswer) : '',
    numericRangeMin: checkpoint?.numericRangeMin ? String(checkpoint.numericRangeMin) : '',
    numericRangeMax: checkpoint?.numericRangeMax ? String(checkpoint.numericRangeMax) : '',
    segmentLabel: checkpoint?.segmentLabel || `Segment ${index + 1} Starts ${checkpoint?.time || '00:00:00'}`,
  };
}

function badgeToDraft(badge: BadgeCatalogItem): BadgeDraft {
  const requirement = badge.requirements[0];
  const lesson = requirement?.lesson ?? null;
  const segment = lesson?.segment ?? null;
  const rubricItems = requirement?.rubricItems?.length
    ? requirement.rubricItems.map((item) => ({
        id: `rubric-item-${item.number}`,
        text: item.text,
      }))
    : [{ id: 'rubric-item-1', text: requirement?.displayText ?? '' }];
  const rubricCriteria = requirement?.gradingCriteria?.length
    ? requirement.gradingCriteria.map((criterion) => ({
        id: `criterion-${criterion.number}`,
        prompt: criterion.criterion ?? '',
        options: criterion.options.length ? criterion.options : ['', '', ''],
      }))
    : DEFAULT_DRAFT.rubricCriteria;

  return {
    ...DEFAULT_DRAFT,
    badgeName: badge.name,
    badgeDescription: badge.description ?? '',
    category: badge.category ?? 'OTHER',
    closesOn: formatDateInput(lesson?.dueDate),
    neverCloses: !lesson?.dueDate,
    youtubeUrl: segment?.videoUrl ?? '',
    videoTitle: segment?.title ?? lesson?.title ?? '',
    videoLength: formatDurationInput(segment?.duration, lesson?.estimatedMinutes),
    checkpoints: requirement?.checkpoints?.length
      ? requirement.checkpoints.map((checkpoint, index) => checkpointFromCatalog(checkpoint, index))
      : DEFAULT_DRAFT.checkpoints,
    rubricItems,
    rubricCriteria,
  };
}

function ProgressStep({ index, activeIndex, label }: { index: number; activeIndex: number; label: string }) {
  const isComplete = index < activeIndex;
  const isActive = index === activeIndex;

  return (
    <div className={styles.progressStep}>
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
  const searchParams = useSearchParams();
  const { user, isLoaded, isSignedIn } = useUser();
  const { signOut } = useAuth();
  const { data: studentData } = useStudentData(user?.primaryEmailAddress?.emailAddress);
  const courseId = searchParams.get('courseId');
  const editBadgeId = searchParams.get('badgeId');
  const isEditMode = Boolean(editBadgeId);

  const [currentStep, setCurrentStep] = useState(0);
  const [draft, setDraft] = useState<BadgeDraft>(DEFAULT_DRAFT);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [submissionState, setSubmissionState] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingEditBadge, setIsLoadingEditBadge] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    if (typeof window === 'undefined' || isEditMode) return;

    const storedDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!storedDraft) return;

    try {
      const parsed = JSON.parse(storedDraft) as Partial<BadgeDraft>;
      setDraft((current) => ({
        ...current,
        ...parsed,
        checkpoints: parsed.checkpoints ?? current.checkpoints,
        reassessmentResources: parsed.reassessmentResources ?? current.reassessmentResources,
        rubricItems: parsed.rubricItems ?? current.rubricItems,
        rubricCriteria: parsed.rubricCriteria ?? current.rubricCriteria,
      }));
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, [isEditMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || isEditMode) return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft, isEditMode]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !editBadgeId) return;

    let isActive = true;

    const loadBadgeForEditing = async () => {
      setIsLoadingEditBadge(true);
      setSubmitError('');

      try {
        const response = await fetch('/api/badges', {
          headers: { Accept: 'application/json' },
        });
        const payload = (await response.json().catch(() => ({
          error: `Request failed with status ${response.status}`,
        }))) as BadgesResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load badge.');
        }

        const badge = payload.badges.find((entry) => entry.id === editBadgeId);
        if (!badge) {
          throw new Error('Badge not found.');
        }

        if (isActive) {
          setDraft(badgeToDraft(badge));
        }
      } catch (error) {
        if (isActive) {
          setSubmitError(error instanceof Error ? error.message : 'Failed to load badge.');
        }
      } finally {
        if (isActive) {
          setIsLoadingEditBadge(false);
        }
      }
    };

    void loadBadgeForEditing();

    return () => {
      isActive = false;
    };
  }, [editBadgeId, isLoaded, isSignedIn]);

  const displayName = studentData?.student?.name || user?.fullName || '';
  const activeStep = STEP_DEFINITIONS[currentStep];
  const videoEmbedUrl = buildVideoEmbedUrl(draft.youtubeUrl);
  const videoThumbnail = buildVideoThumbnail(draft.youtubeUrl);

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
    setSubmitError('');
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

  const toggleCheckpointCorrectOption = (checkpointId: string, optionIndex: number) => {
    updateDraft(
      'checkpoints',
      draft.checkpoints.map((checkpoint) => {
        if (checkpoint.id !== checkpointId) return checkpoint;

        const correctSet = new Set(checkpoint.correctIndices);
        if (correctSet.has(optionIndex)) {
          correctSet.delete(optionIndex);
        } else {
          correctSet.add(optionIndex);
        }

        return {
          ...checkpoint,
          correctIndices: Array.from(correctSet).sort((left, right) => left - right),
        };
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
        questionType: 'multipleChoice',
        options: ['', '', '', ''],
        correctIndices: [0],
        numericAnswer: '',
        numericRangeMin: '',
        numericRangeMax: '',
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

  const updateRubricItem = (itemId: string, text: string) => {
    updateDraft(
      'rubricItems',
      draft.rubricItems.map((item) => (item.id === itemId ? { ...item, text } : item))
    );
  };

  const addRubricItem = () => {
    updateDraft('rubricItems', [
      ...draft.rubricItems,
      {
        id: `rubric-item-${Date.now()}`,
        text: '',
      },
    ]);
  };

  const removeRubricItem = (itemId: string) => {
    if (draft.rubricItems.length <= 1) return;

    updateDraft(
      'rubricItems',
      draft.rubricItems.filter((item) => item.id !== itemId)
    );
  };

  const addRubricCriterion = () => {
    updateDraft('rubricCriteria', [
      ...draft.rubricCriteria,
      {
        id: `criterion-${Date.now()}`,
        prompt: '',
        options: ['', '', ''],
      },
    ]);
  };

  const removeRubricCriterion = (criterionId: string) => {
    if (draft.rubricCriteria.length <= 1) return;

    updateDraft(
      'rubricCriteria',
      draft.rubricCriteria.filter((criterion) => criterion.id !== criterionId)
    );
  };

  const updateRubricCriterionOption = (criterionId: string, optionIndex: number, value: string) => {
    updateDraft(
      'rubricCriteria',
      draft.rubricCriteria.map((criterion) => {
        if (criterion.id !== criterionId) return criterion;

        return {
          ...criterion,
          options: criterion.options.map((option, index) => (index === optionIndex ? value : option)),
        };
      })
    );
  };

  const addRubricCriterionOption = (criterionId: string) => {
    updateDraft(
      'rubricCriteria',
      draft.rubricCriteria.map((criterion) =>
        criterion.id === criterionId ? { ...criterion, options: [...criterion.options, ''] } : criterion
      )
    );
  };

  const removeRubricCriterionOption = (criterionId: string, optionIndex: number) => {
    updateDraft(
      'rubricCriteria',
      draft.rubricCriteria.map((criterion) => {
        if (criterion.id !== criterionId || criterion.options.length <= 1) return criterion;

        return {
          ...criterion,
          options: criterion.options.filter((_, index) => index !== optionIndex),
        };
      })
    );
  };

  const goToStep = (stepIndex: number) => {
    setCurrentStep(stepIndex);
    setSubmissionState(null);
  };

  const saveBadge = async () => {
    const response = await fetch('/api/badges', {
      method: isEditMode ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: editBadgeId,
        courseId,
        ...draft,
      }),
    });

    const payload = await response.json().catch(() => ({
      error: `Request failed with status ${response.status}`,
    }));

    if (!response.ok) {
      throw new Error(payload.error ?? `Failed to ${isEditMode ? 'update' : 'create'} badge.`);
    }

    return payload;
  };

  const handleNext = async () => {
    if (currentStep < STEP_DEFINITIONS.length - 1) {
      setCurrentStep((step) => step + 1);
      return;
    }

    setSubmitError('');
    setIsSubmitting(true);

    try {
      await saveBadge();
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
      setSubmissionState(`Badge ${isEditMode ? 'updated' : 'created'} successfully.`);
      setIsSuccessModalOpen(true);
    } catch (error) {
      console.error(error);
      setSubmitError(error instanceof Error ? error.message : `Failed to ${isEditMode ? 'update' : 'create'} badge.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`page ${styles.page}`}>
      <Sidebar navItems={SIDEBAR_NAV} displayName={displayName} onSignOut={handleSignOut} isSigningOut={isSigningOut} />

      <main className={`main ${styles.main}`}>
        <div className={styles.pageShell}>
          <header className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>{isEditMode ? 'Edit Badge' : 'Create a Badge'}</h1>
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
            {isLoadingEditBadge ? <div className={styles.noticeBanner}>Loading badge details...</div> : null}
            {submitError ? <p className={styles.errorText}>{submitError}</p> : null}

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
                    placeholder="Badge Name"
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
                    placeholder="Describe what students will learn and demonstrate."
                  />
                </div>

                <div className={styles.badgeInfoField}>
                  <label className={styles.sectionLabel} htmlFor="badgeCategory">
                    Category
                  </label>
                  <select
                    id="badgeCategory"
                    className={styles.selectField}
                    value={draft.category}
                    onChange={(event) => updateDraft('category', event.target.value as BadgeCategory)}
                  >
                    <option value="SAFETY">Safety</option>
                    <option value="EQUIPMENT">Equipment</option>
                    <option value="WASTE">Waste</option>
                    <option value="OTHER">Other</option>
                  </select>
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

                        <label className={styles.fieldStack}>
                          <span>Question type</span>
                          <select
                            aria-label={`${checkpoint.title} question type`}
                            className={styles.selectField}
                            value={checkpoint.questionType}
                            onChange={(event) =>
                              updateCheckpoint(
                                checkpoint.id,
                                'questionType',
                                event.target.value as CheckpointDraft['questionType']
                              )
                            }
                          >
                            <option value="multipleChoice">Multiple choice</option>
                            <option value="shortAnswer">Short answer number</option>
                          </select>
                        </label>

                        {checkpoint.questionType === 'multipleChoice' ? (
                          <div className={styles.optionList}>
                            {checkpoint.options.map((option, optionIndex) => (
                              <label key={`${checkpoint.id}-option-${optionIndex}`} className={styles.optionRow}>
                                <input
                                  type="checkbox"
                                  checked={checkpoint.correctIndices.includes(optionIndex)}
                                  onChange={() => toggleCheckpointCorrectOption(checkpoint.id, optionIndex)}
                                  aria-label={`Choice ${optionIndex + 1} is correct`}
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
                        ) : (
                          <div className={styles.shortAnswerGrid}>
                            <label className={styles.fieldStack}>
                              <span>Exact numeric answer</span>
                              <input
                                aria-label={`${checkpoint.title} exact numeric answer`}
                                className={styles.textField}
                                value={checkpoint.numericAnswer}
                                inputMode="decimal"
                                placeholder="42"
                                onChange={(event) =>
                                  updateCheckpoint(checkpoint.id, 'numericAnswer', event.target.value)
                                }
                              />
                            </label>
                            <label className={styles.fieldStack}>
                              <span>Accepted minimum</span>
                              <input
                                aria-label={`${checkpoint.title} accepted minimum`}
                                className={styles.textField}
                                value={checkpoint.numericRangeMin}
                                inputMode="decimal"
                                placeholder="40"
                                onChange={(event) =>
                                  updateCheckpoint(checkpoint.id, 'numericRangeMin', event.target.value)
                                }
                              />
                            </label>
                            <label className={styles.fieldStack}>
                              <span>Accepted maximum</span>
                              <input
                                aria-label={`${checkpoint.title} accepted maximum`}
                                className={styles.textField}
                                value={checkpoint.numericRangeMax}
                                inputMode="decimal"
                                placeholder="45"
                                onChange={(event) =>
                                  updateCheckpoint(checkpoint.id, 'numericRangeMax', event.target.value)
                                }
                              />
                            </label>
                          </div>
                        )}
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
                  <div className={styles.numberedRubricList}>
                    {draft.rubricItems.map((item, index) => (
                      <div key={item.id} className={styles.numberedRubricItem}>
                        <span className={styles.rubricNumber}>{index + 1}.</span>
                        <textarea
                          aria-label={`Rubric item ${index + 1}`}
                          className={styles.textAreaCompact}
                          value={item.text}
                          onChange={(event) => updateRubricItem(item.id, event.target.value)}
                          placeholder="Describe the performance expectation."
                        />
                        <button
                          type="button"
                          className={styles.removeTextButton}
                          onClick={() => removeRubricItem(item.id)}
                          disabled={draft.rubricItems.length <= 1}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryButton} onClick={addRubricItem}>
                    Add Rubric Item
                  </button>
                </div>

                <div className={styles.editorCard}>
                  <h3 className={styles.panelTitle}>Instructor Grading</h3>
                  <div className={styles.rubricList}>
                    {draft.rubricCriteria.map((criterion, criterionIndex) => (
                      <div key={criterion.id} className={styles.rubricCriterionCard}>
                        <label className={styles.fieldStack}>
                          <span>Criterion {criterionIndex + 1}</span>
                          <textarea
                            className={styles.textAreaCompact}
                            aria-label={`Criterion ${criterionIndex + 1}`}
                            value={criterion.prompt}
                            onChange={(event) => updateRubricCriterion(criterion.id, 'prompt', event.target.value)}
                            placeholder="What should the instructor evaluate?"
                          />
                        </label>
                        <div className={styles.gradingOptionsList}>
                          {criterion.options.map((option, optionIndex) => (
                            <label key={`${criterion.id}-option-${optionIndex}`} className={styles.optionRow}>
                              <input
                                type="checkbox"
                                aria-label={`Criterion ${criterionIndex + 1} option ${optionIndex + 1}`}
                              />
                              <input
                                className={styles.textField}
                                value={option}
                                placeholder={`Selection option ${optionIndex + 1}`}
                                onChange={(event) =>
                                  updateRubricCriterionOption(criterion.id, optionIndex, event.target.value)
                                }
                              />
                              <button
                                type="button"
                                className={styles.removeTextButton}
                                onClick={() => removeRubricCriterionOption(criterion.id, optionIndex)}
                                disabled={criterion.options.length <= 1}
                              >
                                Remove
                              </button>
                            </label>
                          ))}
                        </div>
                        <div className={styles.inlineActions}>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => addRubricCriterionOption(criterion.id)}
                          >
                            Add Option
                          </button>
                          <button
                            type="button"
                            className={styles.removeTextButton}
                            onClick={() => removeRubricCriterion(criterion.id)}
                            disabled={draft.rubricCriteria.length <= 1}
                          >
                            Remove Criterion
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" className={styles.secondaryButton} onClick={addRubricCriterion}>
                    Add Criterion
                  </button>
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
                    {draft.rubricItems.map((item, index) => (
                      <div key={item.id} className={styles.reviewListItem}>
                        <strong>
                          {index + 1}. {item.text || 'Empty rubric item'}
                        </strong>
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
              <button
                type="button"
                className={styles.nextButton}
                onClick={handleNext}
                disabled={isSubmitting || isLoadingEditBadge}
              >
                {currentStep === STEP_DEFINITIONS.length - 1
                  ? isSubmitting
                    ? isEditMode
                      ? 'Saving...'
                      : 'Creating...'
                    : isEditMode
                      ? 'Save Badge'
                      : 'Create Badge'
                  : 'Next'}
              </button>
            </div>
          </section>
        </div>
      </main>

      {isSuccessModalOpen ? (
        <div className={styles.successOverlay} role="dialog" aria-modal="true" aria-labelledby="badge-success-title">
          <div className={styles.successModal}>
            <button
              type="button"
              className={styles.successCloseButton}
              onClick={() => setIsSuccessModalOpen(false)}
              aria-label="Close success message"
            >
              x
            </button>
            <h2 id="badge-success-title" className={styles.successTitle}>
              Badge {isEditMode ? 'updated' : 'created'} successfully.
            </h2>
            <p className={styles.successText}>
              {isEditMode
                ? 'Your changes were saved to this badge.'
                : courseId
                  ? 'This badge was created and assigned to the selected course.'
                  : 'This badge was created independently and can be assigned to a course later.'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
