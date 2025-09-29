import { useEffect, useState } from 'react';

export interface SkillSummary {
  id: string;
  title: string;
  description?: string;
}

interface SkillsState {
  skills: SkillSummary[];
  isLoading: boolean;
  error?: Error;
}

export function useSkills(): SkillsState {
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const response = await fetch('/api/skills');
        if (!response.ok) {
          throw new Error(`Failed to load skills: ${response.status}`);
        }
        const data = (await response.json()) as { skills?: SkillSummary[] };
        if (!cancelled) {
          setSkills(data.skills ?? []);
          setError(undefined);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Unknown error fetching skills.'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { skills, isLoading, error };
}
