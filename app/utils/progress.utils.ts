export interface ProgressInput {
  completed: number;
  total: number;
}

export function calculateProgress({ completed, total }: ProgressInput): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((completed / total) * 100));
}
