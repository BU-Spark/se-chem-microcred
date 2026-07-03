// Shared constants for the instructor-chosen "course image" (icon + color).
// Used by the course-creation picker, the live preview, and the rendered
// course tiles so all three stay in lockstep.

// The 7 background colors from issue #79 ("Course image creation").
export const COURSE_COLORS = [
  '#D47A7A', // red
  '#F7AEB5', // pink
  '#E9AF70', // orange
  '#9DC19B', // green
  '#A1C5D2', // aqua
  '#9F81A7', // purple
  '#C5C5C5', // grey
] as const;

// Icon foreground tones the instructor can pick. "Dark" is a neutral slate
// rather than pure black so it reads well on the lighter pastels.
export const ICON_FG_LIGHT = '#FFFFFF';
export const ICON_FG_DARK = '#1F2937';

// Search is restricted to a single Iconify icon set for a consistent look.
// Material Design Icons (~7k icons) has rich keyword metadata. Swap here to
// change the set everywhere.
export const ICON_SET = 'mdi';

// Iconify public search API — keyword search restricted to ICON_SET.
export function iconSearchUrl(query: string, limit = 48) {
  return `https://api.iconify.design/search?query=${encodeURIComponent(query)}&prefixes=${ICON_SET}&limit=${limit}`;
}

export type CourseImageFields = {
  iconName?: string | null;
  iconBgColor?: string | null;
  iconFgColor?: string | null;
};

// True when a course has a fully-specified custom image (icon + background).
export function hasCourseImage(course: CourseImageFields): boolean {
  return Boolean(course.iconName && course.iconBgColor);
}
