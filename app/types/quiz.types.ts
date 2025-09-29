export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
}

export interface QuizState {
  questions: QuizQuestion[];
  currentIndex: number;
  currentQuestion?: QuizQuestion;
  answers: Record<string, string>;
  answerQuestion: (questionId: string, answer: string) => void;
  goToNext: () => void;
  goToPrevious: () => void;
}
