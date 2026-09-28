import type { SurveyOption } from './SurveyModal';

export const RATING_VALUES = [1, 2, 3, 4, 5] as const;

export const FACE_ICONS: Record<number, string> = {
  1: 'lucide:angry',
  2: 'lucide:frown',
  3: 'lucide:meh',
  4: 'lucide:smile',
  5: 'lucide:laugh',
};

export const FACE_ALTS: Record<number, string> = {
  1: 'Very unhappy',
  2: 'Slightly unhappy',
  3: 'Neutral',
  4: 'Slightly happy',
  5: 'Very happy',
};

export function surveyFaceOptions(): SurveyOption[] {
  return RATING_VALUES.map((value) => ({
    value,
    label: FACE_ALTS[value],
    icon: FACE_ICONS[value],
  }));
}
