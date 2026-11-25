import { z } from 'zod';

export const setSchema = z.object({
  index: z.number().int().nonnegative(),
  type: z.enum(['normal','warmup','dropset','failure']),
  weight_kg: z.number().nullish(),
  reps: z.number().int().nonnegative().nullish(),
  duration_seconds: z.number().nonnegative().nullish(),
  distance_meters: z.number().nonnegative().nullish(),
  rpe: z.number().min(0).max(10).nullish(),
});
const timestamp = z.iso.datetime({offset:true});
export const workoutSchema = z.object({
  id: z.string().min(1), title: z.string(), description: z.string().nullish(),
  start_time: timestamp, end_time: timestamp, updated_at: timestamp.optional(),
  exercises: z.array(z.object({
    index: z.number().int().nonnegative(), title: z.string(),
    exercise_template_id: z.string().min(1), notes: z.string().nullish(), sets: z.array(setSchema),
  })),
}).refine(w => Date.parse(w.end_time) >= Date.parse(w.start_time));
export const templateSchema = z.object({
  id:z.string().min(1), title:z.string(), type:z.string(), equipment:z.string().nullish(),
  primary_muscle_group:z.string().nullish(), secondary_muscle_groups:z.array(z.string()).nullish(),
});
export const eventSchema = z.discriminatedUnion('type',[
  z.object({type:z.literal('updated'),workout:workoutSchema}),
  z.object({type:z.literal('deleted'),id:z.string().min(1),deleted_at:timestamp}),
]);
export type Template = {
  id:string; title:string; type:string; equipment?:string|null;
  primary_muscle?:string|null; secondary_muscles:string[];
};
export function normalize(w: z.infer<typeof workoutSchema>, source: 'hevy'|'csv') {
  return {
    id: source === 'csv' ? 'csv:' + w.id : w.id, title:w.title, source,
    started_at:w.start_time, ended_at:w.end_time, notes:w.description,
    workout_exercises:w.exercises.map(e=>({
      position:e.index, title:e.title, template_id:e.exercise_template_id, notes:e.notes,
      workout_sets:e.sets.map(({index,...s})=>({...s, position:index})),
    })),
  };
}
export type Workout = ReturnType<typeof normalize>;
export type SetEntry = Workout['workout_exercises'][number]['workout_sets'][number];
export type Measurement = {id:string; day:string; kind:string; value:number; source:string};
export type Goal = {id:string; title:string; kind:string; target:number; deadline:string|null; status:string; created_at:string};
