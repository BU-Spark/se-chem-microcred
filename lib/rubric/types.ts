export type RubricTaskPayload = {
  id?: string;
  text?: string | null;
  points?: number | string | null;
};

export type RubricSubgoalPayload = {
  id?: string;
  text?: string | null;
  passThreshold?: number | string | null;
  tasks?: RubricTaskPayload[] | null;
};

export type RubricGoalPayload = {
  name?: string | null;
  taInstructions?: string | null;
  subgoals?: RubricSubgoalPayload[] | null;
};
