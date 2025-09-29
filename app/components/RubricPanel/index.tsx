export interface RubricCriterion {
  id: string;
  label: string;
  achieved: boolean;
}

export interface RubricPanelProps {
  criteria?: RubricCriterion[];
}

export function RubricPanel({ criteria = [] }: RubricPanelProps) {
  return (
    <section>
      <h2>Rubric</h2>
      <ul>
        {criteria.length === 0 && <li>No rubric criteria provided.</li>}
        {criteria.map((criterion) => (
          <li key={criterion.id}>
            {criterion.label} — {criterion.achieved ? 'Achieved' : 'Pending'}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default RubricPanel;
