'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import Sidebar, { SIDEBAR_NAV } from '@/app/_components/Sidebar';
import { useStudentData } from '../hooks/useStudentData';
import styles from './page.module.css';

import { DEFAULT_DRAFT, DRAFT_STORAGE_KEY, STEP_DEFINITIONS } from './types';
import type { BadgeDraft, BadgesResponse, CheckpointDraft, RubricCriterion } from './types';
import {
  badgeToDraft,
  buildVideoThumbnail,
  extractYouTubeId,
  formatSecondsToTimecode,
  isValidVideoLength,
  isValidYouTubeUrl,
} from './lib/badge-helpers';
import ProgressStep from './components/ProgressStep';
import SuccessModal from './components/SuccessModal';
import BadgeInfoStep from './steps/BadgeInfoStep';
import LessonVideoStep from './steps/LessonVideoStep';
import CheckpointsStep from './steps/CheckpointsStep';
import RubricStep from './steps/RubricStep';
import ReviewStep from './steps/ReviewStep';

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
    if (isLoaded && !isSignedIn && !isSigningOut) {
      router.replace('/sign-in');
    }
  }, [isLoaded, isSignedIn, isSigningOut, router]);

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
  const videoId = extractYouTubeId(draft.youtubeUrl);
  const videoThumbnail = buildVideoThumbnail(draft.youtubeUrl);

  if (!isLoaded || !isSignedIn) return null;

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace('/splash');
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

  // Apply a transform to the checkpoints list using the LATEST committed draft
  // (functional setState), not the render-time closure. Reading draft.checkpoints
  // directly would drop edits made in rapid succession / the same React batch.
  const mutateCheckpoints = (updater: (checkpoints: CheckpointDraft[]) => CheckpointDraft[]) => {
    setDraft((current) => ({ ...current, checkpoints: updater(current.checkpoints) }));
    setSubmissionState(null);
    setSubmitError('');
  };

  const updateCheckpoint = <K extends keyof CheckpointDraft>(
    checkpointId: string,
    field: K,
    value: CheckpointDraft[K]
  ) => {
    mutateCheckpoints((checkpoints) =>
      checkpoints.map((checkpoint) => (checkpoint.id === checkpointId ? { ...checkpoint, [field]: value } : checkpoint))
    );
  };

  const updateCheckpointOption = (checkpointId: string, optionIndex: number, value: string) => {
    mutateCheckpoints((checkpoints) =>
      checkpoints.map((checkpoint) => {
        if (checkpoint.id !== checkpointId) return checkpoint;
        const nextOptions = checkpoint.options.map((option, index) => (index === optionIndex ? value : option));
        return { ...checkpoint, options: nextOptions };
      })
    );
  };

  const toggleCheckpointCorrectOption = (checkpointId: string, optionIndex: number) => {
    mutateCheckpoints((checkpoints) =>
      checkpoints.map((checkpoint) => {
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

  // Returns the new checkpoint's id so the step can immediately open its editor
  // modal. `atSeconds` is the live playhead position from the video player.
  const addCheckpoint = (atSeconds?: number) => {
    const id = `checkpoint-${Date.now()}`;
    const time = formatSecondsToTimecode(atSeconds ?? 0);
    setDraft((current) => {
      const nextCount = current.checkpoints.length + 1;
      return {
        ...current,
        checkpoints: [
          ...current.checkpoints,
          {
            id,
            title: `Checkpoint ${nextCount}`,
            time,
            points: 5,
            question: '',
            questionType: 'multipleChoice',
            options: ['', '', '', ''],
            correctIndices: [0],
            numericAnswer: '',
            numericRangeMin: '',
            numericRangeMax: '',
            unit: '',
            incorrectFeedback: '',
            incorrectFeedbackEnabled: false,
            segmentLabel: `Segment ${nextCount} Starts ${time}`,
          },
        ],
      };
    });
    setSubmissionState(null);
    setSubmitError('');
    return id;
  };

  const removeCheckpoint = (checkpointId: string) => {
    mutateCheckpoints((checkpoints) => checkpoints.filter((checkpoint) => checkpoint.id !== checkpointId));
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
        optionFeedback: ['', '', ''],
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

  // Prewritten feedback is kept index-aligned with `options`.
  const updateRubricCriterionOptionFeedback = (criterionId: string, optionIndex: number, value: string) => {
    updateDraft(
      'rubricCriteria',
      draft.rubricCriteria.map((criterion) => {
        if (criterion.id !== criterionId) return criterion;

        const optionFeedback = [...criterion.optionFeedback];
        while (optionFeedback.length < criterion.options.length) optionFeedback.push('');
        optionFeedback[optionIndex] = value;

        return { ...criterion, optionFeedback };
      })
    );
  };

  const addRubricCriterionOption = (criterionId: string) => {
    updateDraft(
      'rubricCriteria',
      draft.rubricCriteria.map((criterion) =>
        criterion.id === criterionId
          ? { ...criterion, options: [...criterion.options, ''], optionFeedback: [...criterion.optionFeedback, ''] }
          : criterion
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
          optionFeedback: criterion.optionFeedback.filter((_, index) => index !== optionIndex),
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

  const handleSuccessClose = () => {
    setIsSuccessModalOpen(false);
    // Always return to the badge list so the form can't be re-submitted (prevents
    // duplicate badges). Hard navigation: router.push() no-ops from an async handler
    // after setState in Next 15, and a full load shows the new badge with fresh data.
    if (typeof window !== 'undefined') {
      window.location.assign('/my_badges');
      return;
    }
    router.push('/my_badges');
  };

  const handleNext = async () => {
    // Block leaving the Upload Lesson Video step with an invalid link/length so
    // a value like "a" can't be saved.
    if (currentStep === 1) {
      const urlInvalid = Boolean(draft.youtubeUrl.trim()) && !isValidYouTubeUrl(draft.youtubeUrl);
      const lengthInvalid = Boolean(draft.videoLength.trim()) && !isValidVideoLength(draft.videoLength);
      if (urlInvalid || lengthInvalid) {
        setSubmitError('Fix the highlighted video fields before continuing.');
        return;
      }
    }

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
            {currentStep === 0 && <BadgeInfoStep draft={draft} updateDraft={updateDraft} />}
            {currentStep === 1 && (
              <LessonVideoStep draft={draft} updateDraft={updateDraft} videoThumbnail={videoThumbnail} />
            )}

            {currentStep === 2 && (
              <CheckpointsStep
                draft={draft}
                videoId={videoId}
                videoThumbnail={videoThumbnail}
                addCheckpoint={addCheckpoint}
                removeCheckpoint={removeCheckpoint}
                updateCheckpoint={updateCheckpoint}
                updateCheckpointOption={updateCheckpointOption}
                toggleCheckpointCorrectOption={toggleCheckpointCorrectOption}
              />
            )}

            {currentStep === 3 && (
              <RubricStep
                draft={draft}
                updateRubricItem={updateRubricItem}
                addRubricItem={addRubricItem}
                removeRubricItem={removeRubricItem}
                updateRubricCriterion={updateRubricCriterion}
                addRubricCriterion={addRubricCriterion}
                removeRubricCriterion={removeRubricCriterion}
                updateRubricCriterionOption={updateRubricCriterionOption}
                updateRubricCriterionOptionFeedback={updateRubricCriterionOptionFeedback}
                addRubricCriterionOption={addRubricCriterionOption}
                removeRubricCriterionOption={removeRubricCriterionOption}
              />
            )}

            {currentStep === 4 && <ReviewStep draft={draft} goToStep={goToStep} />}

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
        <SuccessModal
          isEditMode={isEditMode}
          courseId={courseId}
          badgeName={draft.badgeName}
          onClose={handleSuccessClose}
        />
      ) : null}
    </div>
  );
}
