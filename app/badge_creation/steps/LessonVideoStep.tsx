import styles from '../page.module.css';
import { DEFAULT_VIDEO_FALLBACK } from '../types';
import type { BadgeDraft } from '../types';

export default function LessonVideoStep({
  draft,
  updateDraft,
  videoThumbnail,
}: {
  draft: BadgeDraft;
  updateDraft: <K extends keyof BadgeDraft>(field: K, value: BadgeDraft[K]) => void;
  videoThumbnail: string | null;
}) {
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
  );
}
