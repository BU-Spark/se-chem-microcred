'use client';

import { useMemo, useState } from 'react';
import styles from './page.module.css';

interface CuePoint {
  id: string;
  timecode: string;
  prompt: string;
  questionCount: number;
}

export default function InstructorQevDemoPage() {
  const [videoUrl, setVideoUrl] = useState('https://www.youtube.com/watch?v=zxQyTK8quyY');
  const [description, setDescription] = useState('Bunsen burner walkthrough with instructor checkpoints.');
  const [cuePoints, setCuePoints] = useState<CuePoint[]>([
    { id: 'cue-1', timecode: '00:45', prompt: 'Discuss flame ignition safety', questionCount: 3 },
    { id: 'cue-2', timecode: '01:30', prompt: 'Identify correct flame height', questionCount: 2 },
  ]);

  const addCuePoint = () => {
    setCuePoints((prev) => [
      ...prev,
      { id: `cue-${prev.length + 1}`, timecode: '02:00', prompt: 'New checkpoint prompt…', questionCount: 1 },
    ]);
  };

  const updateCuePoint = (id: string, key: keyof CuePoint, value: string | number) => {
    setCuePoints((prev) => prev.map((cue) => (cue.id === id ? { ...cue, [key]: value } : cue)));
  };

  const removeCuePoint = (id: string) => {
    setCuePoints((prev) => prev.filter((cue) => cue.id !== id));
  };

  const serializedCuePoints = useMemo(
    () =>
      cuePoints
        .map(
          (cue) =>
            `${cue.timecode} – ${cue.prompt} (${cue.questionCount} question${cue.questionCount === 1 ? '' : 's'})`
        )
        .join('\n'),
    [cuePoints]
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.pageTitle}>Configure Question Embedded Video</h1>
          <p className={styles.pageSubtitle}>Prototype tool for instructors to assign checkpoints to lesson videos.</p>
        </div>
      </header>

      <section className={styles.formCard}>
        <div className={styles.fieldRow}>
          <label className={styles.field}>
            Video source URL
            <input
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="Paste YouTube link"
            />
          </label>
          <label className={styles.field}>
            Lesson description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>

        <div className={styles.cueList}>
          {cuePoints.map((cue) => (
            <div key={cue.id} className={styles.cueItem}>
              <div className={styles.cueHeader}>
                <span>{cue.prompt}</span>
                <div className={styles.cueActions}>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonGhost}`}
                    onClick={() => removeCuePoint(cue.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  Timecode (mm:ss)
                  <input
                    value={cue.timecode}
                    onChange={(event) => updateCuePoint(cue.id, 'timecode', event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  Prompt
                  <input
                    value={cue.prompt}
                    onChange={(event) => updateCuePoint(cue.id, 'prompt', event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  # of questions
                  <input
                    type="number"
                    min={1}
                    value={cue.questionCount}
                    onChange={(event) => updateCuePoint(cue.id, 'questionCount', Number(event.target.value) || 1)}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <button type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={addCuePoint}>
          Add checkpoint
        </button>
      </section>

      <section className={styles.previewCard}>
        <div className={styles.previewTitle}>Preview payload (for engineering handoff)</div>
        <div className={styles.previewList}>
          <div>
            <strong>Video:</strong> {videoUrl}
          </div>
          <div>
            <strong>Description:</strong> {description}
          </div>
          <div>
            <strong>Cue points:</strong>
            <pre style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{serializedCuePoints}</pre>
          </div>
        </div>
      </section>
    </div>
  );
}
