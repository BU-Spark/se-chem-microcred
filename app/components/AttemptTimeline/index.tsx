export interface AttemptItem {
  id: string;
  label: string;
  timestamp: string;
}

export interface AttemptTimelineProps {
  attempts?: AttemptItem[];
}

export function AttemptTimeline({ attempts = [] }: AttemptTimelineProps) {
  return (
    <section>
      <h2>Attempt Timeline</h2>
      <ul>
        {attempts.length === 0 && <li>No attempts recorded.</li>}
        {attempts.map((attempt) => (
          <li key={attempt.id}>
            <strong>{attempt.label}</strong> — {new Date(attempt.timestamp).toLocaleString()}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AttemptTimeline;
