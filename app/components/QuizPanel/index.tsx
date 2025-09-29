export interface QuizPanelProps {
  title?: string;
  totalQuestions?: number;
}

export function QuizPanel({ title = 'Quiz', totalQuestions = 0 }: QuizPanelProps) {
  return (
    <section>
      <h2>{title}</h2>
      <p>Total questions: {totalQuestions}</p>
      <p>Quiz interactions will be implemented later.</p>
    </section>
  );
}

export default QuizPanel;
