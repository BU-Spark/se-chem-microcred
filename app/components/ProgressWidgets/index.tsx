export interface ProgressWidgetProps {
  label: string;
  value: number;
  total?: number;
}

export function ProgressWidget({ label, value, total }: ProgressWidgetProps) {
  const percent = total && total > 0 ? Math.round((value / total) * 100) : value;
  return (
    <div>
      <strong>{label}</strong>
      <div>{percent}%</div>
    </div>
  );
}

export interface ProgressWidgetsProps {
  items?: ProgressWidgetProps[];
}

export function ProgressWidgets({ items = [] }: ProgressWidgetsProps) {
  return (
    <section>
      <h2>Progress</h2>
      {items.length === 0 && <p>No progress data available.</p>}
      {items.map((item) => (
        <ProgressWidget key={item.label} {...item} />
      ))}
    </section>
  );
}

export default ProgressWidgets;
