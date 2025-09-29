import { useCallback, useState } from 'react';
import type { QuizQuestion, QuizState } from '../types/quiz.types';

export interface UseQuizOptions {
  questions?: QuizQuestion[];
}

export function useQuiz(options: UseQuizOptions = {}): QuizState {
  const { questions = [] } = options;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const answerQuestion = useCallback((questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((index) => Math.min(index + 1, questions.length - 1));
  }, [questions.length]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((index) => Math.max(index - 1, 0));
  }, []);

  return {
    questions,
    currentIndex,
    currentQuestion: questions[currentIndex],
    answers,
    answerQuestion,
    goToNext,
    goToPrevious,
  };
}
