import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import styles from '../page.module.css';
import type { BadgeDraft } from '../types';
import ChipInput from '../components/ChipInput';
import BadgeImage from '@/app/components/BadgeImage/BadgeImage';
import { badgeImageFileFromDataUrl, prepareBadgeImage } from '../lib/badge-image';
import { DEFAULT_BADGE_IMAGE_SCALE, MAX_BADGE_IMAGE_SCALE, MIN_BADGE_IMAGE_SCALE } from '@/lib/badges/badge-image';

export default function BadgeInfoStep({
  draft,
  updateDraft,
}: {
  draft: BadgeDraft;
  updateDraft: <K extends keyof BadgeDraft>(field: K, value: BadgeDraft[K]) => void;
}) {
  const [imageError, setImageError] = useState('');
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [isPositionDialogOpen, setIsPositionDialogOpen] = useState(false);
  // Issue #246: alternatives to the file picker -- drag-and-drop, paste, and a URL.
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const dragStart = useRef<{ pointerId: number; x: number; y: number; positionX: number; positionY: number } | null>(
    null
  );

  useEffect(
    () => () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    },
    [localPreviewUrl]
  );

  const acceptImageFile = async (file: File) => {
    const nextPreviewUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(nextPreviewUrl);
    updateDraft('imagePositionX', 50);
    updateDraft('imagePositionY', 50);
    updateDraft('imageScale', DEFAULT_BADGE_IMAGE_SCALE);
    try {
      setImageError('');
      const preparedImageUrl = await prepareBadgeImage(file);
      setLocalPreviewUrl(preparedImageUrl);
      updateDraft('imageUrl', preparedImageUrl);
    } catch (error) {
      setLocalPreviewUrl('');
      setImageError(error instanceof Error ? error.message : 'Could not process that image.');
    }
  };

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await acceptImageFile(file);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    // Moving over a child fires dragleave on the parent; ignore those so the
    // highlight does not flicker as the pointer crosses the zone's contents.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await acceptImageFile(file);
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const file = Array.from(event.clipboardData.files)[0];
    if (!file) return;
    event.preventDefault();
    await acceptImageFile(file);
  };

  const loadImageFromUrl = async () => {
    const url = imageUrlInput.trim();
    if (!url || isLoadingUrl) return;

    setIsLoadingUrl(true);
    setImageError('');
    try {
      const response = await fetch('/api/uploads/badge-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const payload = (await response.json()) as { dataUrl?: string; error?: string };
      if (!response.ok || !payload.dataUrl) throw new Error(payload.error || 'Could not load that image.');

      await acceptImageFile(await badgeImageFileFromDataUrl(payload.dataUrl));
      setImageUrlInput('');
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Could not load that image.');
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const removeImage = () => {
    setLocalPreviewUrl('');
    setImageError('');
    setIsPositionDialogOpen(false);
    setImageUrlInput('');
    updateDraft('imageUrl', '');
    updateDraft('imageScale', DEFAULT_BADGE_IMAGE_SCALE);
  };

  const handlePositionPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      positionX: draft.imagePositionX,
      positionY: draft.imagePositionY,
    };
  };

  const handlePositionPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    updateDraft('imagePositionX', clampPosition(start.positionX - ((event.clientX - start.x) / bounds.width) * 100));
    updateDraft('imagePositionY', clampPosition(start.positionY - ((event.clientY - start.y) / bounds.height) * 100));
  };

  const handlePositionPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart.current?.pointerId === event.pointerId) dragStart.current = null;
  };

  const handleZoomWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const next = draft.imageScale - Math.sign(event.deltaY) * 5;
    updateDraft('imageScale', Math.min(MAX_BADGE_IMAGE_SCALE, Math.max(MIN_BADGE_IMAGE_SCALE, next)));
  };

  return (
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
        <label className={styles.sectionLabel} htmlFor="badgeImage">
          Badge image
        </label>
        <p className={styles.fieldHelp}>
          Upload square artwork for this badge. PNG, JPEG, or WebP; up to 8 MB. Drop a file here, paste one, or paste a
          link.
        </p>

        <div
          className={`${styles.badgeImageUploadRow} ${isDraggingOver ? styles.badgeImageDropActive : ''}`.trim()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
        >
          <div
            className={styles.badgeImagePreview}
            style={{ position: 'relative', width: 112, height: 112, flex: '0 0 112px', overflow: 'hidden' }}
          >
            <BadgeImage
              imageUrl={localPreviewUrl || draft.imageUrl}
              imagePositionX={draft.imagePositionX}
              imagePositionY={draft.imagePositionY}
              imageScale={draft.imageScale}
              videoUrl={draft.youtubeUrl}
              alt="Badge image preview"
            />
          </div>
          <div>
            <input id="badgeImage" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageChange} />
            {draft.imageUrl ? (
              <button type="button" className={styles.imageRemoveButton} onClick={removeImage}>
                Remove image
              </button>
            ) : null}
          </div>
        </div>

        <div className={styles.badgeImageUrlRow}>
          <label className={styles.visuallyHidden} htmlFor="badgeImageUrl">
            Image URL
          </label>
          <input
            id="badgeImageUrl"
            type="url"
            className={styles.badgeImageUrlInput}
            placeholder="Or paste an image URL"
            value={imageUrlInput}
            onChange={(event) => setImageUrlInput(event.target.value)}
            onKeyDown={(event) => {
              // Enter inside the wizard would otherwise advance the step.
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void loadImageFromUrl();
            }}
          />
          <button
            type="button"
            className={styles.badgeImageUrlButton}
            onClick={() => void loadImageFromUrl()}
            disabled={!imageUrlInput.trim() || isLoadingUrl}
          >
            {isLoadingUrl ? 'Loading…' : 'Use image'}
          </button>
        </div>
        {localPreviewUrl || draft.imageUrl ? (
          <div className={styles.badgeImagePositionActions}>
            <button type="button" className={styles.imageRemoveButton} onClick={() => setIsPositionDialogOpen(true)}>
              Adjust image position
            </button>
          </div>
        ) : null}
        {imageError ? <p className={styles.errorText}>{imageError}</p> : null}
      </div>

      {isPositionDialogOpen ? (
        <div className={styles.imagePositionDialogBackdrop} role="presentation">
          <section
            className={styles.imagePositionDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="positionTitle"
          >
            <h2 id="positionTitle">Position badge image</h2>
            <p>Drag to move the image, and zoom in to crop closer.</p>
            <div
              className={styles.imagePositionCanvas}
              data-testid="badge-image-position-canvas"
              style={{ position: 'relative', width: '70vw', maxWidth: 280, aspectRatio: '1', overflow: 'hidden' }}
              onPointerDown={handlePositionPointerDown}
              onPointerMove={handlePositionPointerMove}
              onPointerUp={handlePositionPointerEnd}
              onPointerCancel={handlePositionPointerEnd}
              onWheel={handleZoomWheel}
            >
              <BadgeImage
                imageUrl={localPreviewUrl || draft.imageUrl}
                imagePositionX={draft.imagePositionX}
                imagePositionY={draft.imagePositionY}
                imageScale={draft.imageScale}
                alt="Adjust badge image position"
              />
            </div>

            <div className={styles.imageZoomRow}>
              <label className={styles.imageZoomLabel} htmlFor="badgeImageZoom">
                Zoom
              </label>
              <input
                id="badgeImageZoom"
                type="range"
                className={styles.imageZoomSlider}
                min={MIN_BADGE_IMAGE_SCALE}
                max={MAX_BADGE_IMAGE_SCALE}
                step={5}
                value={draft.imageScale}
                onChange={(event) => updateDraft('imageScale', Number(event.target.value))}
              />
              <output className={styles.imageZoomValue} htmlFor="badgeImageZoom">
                {Math.round((draft.imageScale / DEFAULT_BADGE_IMAGE_SCALE) * 100)}%
              </output>
            </div>

            <div className={styles.imagePositionDialogActions}>
              <button
                type="button"
                className={styles.imageRemoveButton}
                onClick={() => {
                  updateDraft('imagePositionX', 50);
                  updateDraft('imagePositionY', 50);
                  updateDraft('imageScale', DEFAULT_BADGE_IMAGE_SCALE);
                }}
              >
                Reset image
              </button>
              <button
                type="button"
                className={styles.imagePositionDoneButton}
                onClick={() => setIsPositionDialogOpen(false)}
              >
                Done
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <div className={styles.badgeInfoField}>
        <label className={styles.sectionLabel} htmlFor="badgeSkills">
          Badge skills
        </label>
        <p className={styles.fieldHelp}>Describe the skills students will learn in this badge. Add up to 5 skills.</p>
        <ChipInput
          value={draft.skills}
          onChange={(next) => updateDraft('skills', next)}
          max={5}
          ariaLabel="Add skill"
          placeholder="Add skill..."
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
        <label className={styles.sectionLabel} htmlFor="reassessment-limit">
          Re-assessment Limit
        </label>
        <p className={styles.fieldHelp}>How many attempts after the initial in-person assessment are allowed.</p>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          name="reassessment-limit"
          id="reassessment-limit"
          className={styles.underlineInput}
          value={draft.reassessmentLimit}
          onChange={(event) => updateDraft('reassessmentLimit', clampInt(event.target.value, 0))}
          placeholder="0"
        />
      </div>
      <div className={styles.badgeInfoField}>
        <label className={styles.sectionLabel} htmlFor="cooldown-length">
          Cooldown Duration (days)
        </label>
        <p className={styles.fieldHelp}>
          How long the cooldown period is, in days, between in-person assessments (0–14).
        </p>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={14}
          step={1}
          name="cooldown-length"
          id="cooldown-length"
          className={styles.underlineInput}
          value={draft.cooldownDays}
          onChange={(event) => updateDraft('cooldownDays', clampInt(event.target.value, 0, 14))}
          placeholder="0"
        />
      </div>
      <div className={styles.badgeInfoField}>
        <label className={styles.checkboxRow} htmlFor="reassessment-required">
          <input
            type="checkbox"
            name="reassessment-required"
            id="reassessment-required"
            checked={draft.reassessmentRequired}
            onChange={(event) => updateDraft('reassessmentRequired', event.target.checked)}
          />
          <span className={styles.sectionLabel}>Re-assessment Required</span>
        </label>
        <p className={styles.fieldHelp}>
          Check if a re-assessment is required when a student fails an in-person assessment.
        </p>
      </div>
    </div>
  );
}

function clampInt(raw: string, min: number, max?: number) {
  const parsed = Number.parseInt(raw, 10);
  const value = Number.isNaN(parsed) ? min : parsed;
  const lowered = Math.max(min, value);
  return max === undefined ? lowered : Math.min(max, lowered);
}

function clampPosition(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}
