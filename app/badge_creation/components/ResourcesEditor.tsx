import { useRef, useState, type ChangeEvent } from 'react';

import styles from './ResourcesEditor.module.css';
import pageStyles from '../page.module.css';
import type { ResourceDraft } from '../types';
import { formatFileSize, newResourceTempId } from '../lib/resources';
import {
  BadgeResourceValidationError,
  MAX_PDF_BYTES,
  MAX_RESOURCES_PER_BADGE,
  normalizeResourceLink,
  normalizeResourceTitle,
  sanitizePdfFileName,
} from '@/lib/badges/badge-resource-rules';

export default function ResourcesEditor({
  resources,
  onChange,
  droppedFileCount = 0,
}: {
  resources: ResourceDraft[];
  onChange: (next: ResourceDraft[]) => void;
  droppedFileCount?: number;
}) {
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFull = resources.length >= MAX_RESOURCES_PER_BADGE;

  const addLink = () => {
    try {
      const { url, hostname } = normalizeResourceLink(linkUrl);
      const title = normalizeResourceTitle(linkTitle, hostname);
      onChange([...resources, { tempId: newResourceTempId(), kind: 'LINK', title, url }]);
      setLinkTitle('');
      setLinkUrl('');
      setError('');
    } catch (caught) {
      setError(caught instanceof BadgeResourceValidationError ? caught.message : 'Enter a valid link.');
    }
  };

  const addFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    // The server re-checks the bytes; this just saves a wasted upload.
    if (file.type && file.type !== 'application/pdf') {
      setError('Only PDF files can be uploaded.');
      return;
    }
    if (file.size === 0) {
      setError('That file is empty.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(`PDFs can be at most ${formatFileSize(MAX_PDF_BYTES)}. This one is ${formatFileSize(file.size)}.`);
      return;
    }
    const fileName = sanitizePdfFileName(file.name);
    onChange([
      ...resources,
      {
        tempId: newResourceTempId(),
        kind: 'FILE',
        title: fileName.replace(/\.pdf$/i, ''),
        fileName,
        sizeBytes: file.size,
        file,
      },
    ]);
    setError('');
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= resources.length) return;
    const next = [...resources];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (tempId: string) => onChange(resources.filter((resource) => resource.tempId !== tempId));

  return (
    <div className={pageStyles.badgeInfoField}>
      <span className={pageStyles.sectionLabel} id="badge-resources-label">
        Extra Resources
      </span>
      <p className={pageStyles.fieldHelp}>
        Optional study material students can open from the badge&apos;s feedback page at any time. Add website links or
        PDFs (up to {formatFileSize(MAX_PDF_BYTES)} each, {MAX_RESOURCES_PER_BADGE} resources total).
      </p>

      <div className={styles.addRow}>
        <input
          type="text"
          aria-label="Link title"
          placeholder="Title (optional)"
          value={linkTitle}
          onChange={(event) => setLinkTitle(event.target.value)}
        />
        <input
          type="url"
          aria-label="Link URL"
          placeholder="https://..."
          value={linkUrl}
          onChange={(event) => setLinkUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addLink();
            }
          }}
        />
        <button type="button" className={styles.addButton} onClick={addLink} disabled={isFull || !linkUrl.trim()}>
          Add link
        </button>
        <button
          type="button"
          className={styles.addButton}
          onClick={() => fileInputRef.current?.click()}
          disabled={isFull}
        >
          Upload PDF
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className={styles.fileInput}
          aria-label="Upload PDF"
          tabIndex={-1}
          onChange={addFile}
        />
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {droppedFileCount > 0 ? (
        <p className={styles.notice} role="status">
          {droppedFileCount === 1
            ? 'One PDF from your saved draft needs to be re-attached.'
            : `${droppedFileCount} PDFs from your saved draft need to be re-attached.`}
        </p>
      ) : null}

      {resources.length > 0 ? (
        <ul className={styles.list} aria-labelledby="badge-resources-label">
          {resources.map((resource, index) => (
            <li key={resource.tempId} className={styles.item}>
              <span className={styles.kind}>{resource.kind === 'LINK' ? 'Link' : 'PDF'}</span>
              <span className={styles.itemText}>
                <span className={styles.itemTitle}>{resource.title}</span>
                <span className={styles.itemMeta}>
                  {resource.kind === 'LINK'
                    ? resource.url
                    : `${resource.fileName} · ${formatFileSize(resource.sizeBytes)}${resource.existingId ? '' : ' · uploads on save'}`}
                </span>
              </span>
              <span className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Move ${resource.title} up`}
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Move ${resource.title} down`}
                  onClick={() => move(index, 1)}
                  disabled={index === resources.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Remove ${resource.title}`}
                  onClick={() => remove(resource.tempId)}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
