export interface Skill {
  id: string;
  title: string;
  description?: string;
  status?: 'locked' | 'available' | 'completed';
}
