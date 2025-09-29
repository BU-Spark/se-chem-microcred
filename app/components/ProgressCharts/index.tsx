export interface ProgressChartPoint {
  label: string;
  value: number;
}

export interface ProgressChartProps {
  title?: string;
  data?: ProgressChartPoint[];
}

export function ProgressChart({ title = 'Progress Chart', data = [] }: ProgressChartProps) {
  return (
    <section>
      <h2>{title}</h2>
      {data.length === 0 ? (
        <p>No chart data available.</p>
      ) : (
        <ul>
          {data.map((point) => (
            <li key={point.label}>
              {point.label}: {point.value}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default ProgressChart;
