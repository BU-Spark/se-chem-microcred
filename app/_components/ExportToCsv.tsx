'use client';

import { useState } from 'react';

interface ExportCsvDataProps {
  courseId: string;
  email: string;
  className?: string;
}

/** Wrap a value in quotes and escape embedded quotes per RFC 4180. */
function toCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsv(rows: Record<string, string>[]) {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const headerLine = headers.map(toCsvCell).join(',');
  const dataLines = rows.map((row) => headers.map((header) => toCsvCell(row[header] ?? '')).join(','));

  return [headerLine, ...dataLines].join('\n');
}

function downloadCsv(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export default function ExportCsvDataButton({ courseId, email, className }: ExportCsvDataProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportToCsv = async () => {
    if (isExporting) return;

    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/courses/${encodeURIComponent(courseId)}/export?email=${encodeURIComponent(email)}`,
        { headers: { Accept: 'application/json' } }
      );

      const payload = (await response.json().catch(() => ({}))) as {
        filename?: string;
        rows?: Record<string, string>[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to export course data.');
      }

      const rows = payload.rows ?? [];

      if (rows.length === 0) {
        setError('No student data to export.');
        return;
      }

      downloadCsv(buildCsv(rows), payload.filename ?? 'student_progress.csv');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export course data.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={exportToCsv}
      className={className}
      disabled={isExporting}
      title={error ?? undefined}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
    >
      <span>{isExporting ? 'Exporting…' : 'Export'}</span>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <path
          d="M12 16V4M12 4l-4 4M12 4l4 4M5 20h14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
