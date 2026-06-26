'use client';

import { useState } from 'react';

import styles from '../page.module.css';
import { DEFAULT_VIDEO_FALLBACK } from '../types';
import type { BadgeDraft } from '../types';
import { isValidVideoLength, isValidYouTubeUrl } from '../lib/badge-helpers';

export default function LessonVideoStep({
  draft,
  updateDraft,
  videoThumbnail,
}: {
  draft: BadgeDraft;
  updateDraft: <K extends keyof BadgeDraft>(field: K, value: BadgeDraft[K]) => void;
  videoThumbnail: string | null;
}) {
  // Track whether the instructor has manually edited the title so an auto-fill
  // never clobbers their input.
  const [titleDirty, setTitleDirty] = useState(false);

  const urlInvalid = Boolean(draft.youtubeUrl.trim()) && !isValidYouTubeUrl(draft.youtubeUrl);
  const lengthInvalid = Boolean(draft.videoLength.trim()) && !isValidVideoLength(draft.videoLength);

  const handleUrlBlur = async () => {
    if (titleDirty) return;
    if (!isValidYouTubeUrl(draft.youtubeUrl)) return;

    try {
      const response = await fetch(`/api/youtube-title?url=${encodeURIComponent(draft.youtubeUrl.trim())}`);
      if (!response.ok) return;
      const data = (await response.json()) as { title?: string | null };
      if (data.title && !titleDirty) {
        updateDraft('videoTitle', data.title);
      }
    } catch {
      // Auto-fill is best-effort; the title stays manually editable on failure.
    }
  };

  return (
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
            onBlur={handleUrlBlur}
            placeholder="https://www.youtube.com/watch?v=..."
            aria-invalid={urlInvalid}
          />
          {urlInvalid && <p className={styles.fieldError}>Enter a valid YouTube link.</p>}
        </div>

        <div className={styles.fieldBlock}>
          <label className={styles.fieldLabel} htmlFor="videoTitle">
            Video Title
          </label>
          <input
            id="videoTitle"
            className={styles.textField}
            value={draft.videoTitle}
            onChange={(event) => {
              // Clearing the field re-enables auto-fill; any other edit suppresses it.
              setTitleDirty(event.target.value.length > 0);
              updateDraft('videoTitle', event.target.value);
            }}
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
            aria-invalid={lengthInvalid}
          />
          {lengthInvalid && <p className={styles.fieldError}>Use a time like 00:20:00.</p>}
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
  );
}
