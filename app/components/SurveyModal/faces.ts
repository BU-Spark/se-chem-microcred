import type { StaticImageData } from 'next/image';

import veryUnhappy from '@/public/assets/survey_faces/very_unhappy.svg';
import slightlyUnhappy from '@/public/assets/survey_faces/slightly_unhappy.svg';
import neutral from '@/public/assets/survey_faces/neutral.svg';
import slightlyHappy from '@/public/assets/survey_faces/slightly_happy.svg';
import veryHappy from '@/public/assets/survey_faces/very_happy.svg';
import veryUnhappySelected from '@/public/assets/survey_faces/very_unhappy_selected.svg';
import slightlyUnhappySelected from '@/public/assets/survey_faces/slightly_unhappy_selected.svg';
import neutralSelected from '@/public/assets/survey_faces/neutral_selected.svg';
import slightlyHappySelected from '@/public/assets/survey_faces/slightly_happy_selected.svg';
import veryHappySelected from '@/public/assets/survey_faces/very_happy_selected.svg';

import type { SurveyOption } from './SurveyModal';

/**
 * The 1–5 emoji scale every survey uses: the badge rating, the QEV rating, and
 * the instructor-facing rating aggregates on the badge page. Kept here so the
 * faces and their labels can't drift between surfaces.
 */
export const RATING_VALUES = [1, 2, 3, 4, 5] as const;

export const FACE_IMAGES: Record<number, StaticImageData> = {
  1: veryUnhappy,
  2: slightlyUnhappy,
  3: neutral,
  4: slightlyHappy,
  5: veryHappy,
};

export const FACE_IMAGES_SELECTED: Record<number, StaticImageData> = {
  1: veryUnhappySelected,
  2: slightlyUnhappySelected,
  3: neutralSelected,
  4: slightlyHappySelected,
  5: veryHappySelected,
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
    icon: FACE_IMAGES[value],
    selectedIcon: FACE_IMAGES_SELECTED[value],
  }));
}
