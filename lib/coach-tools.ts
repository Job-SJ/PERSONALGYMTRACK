import {z} from 'zod';
import {analyticalQueryFields} from './coach-analysis';
import {maxMealText} from './meal-preview';

const analysis=analyticalQueryFields.omit({compare:true}).extend({
  compare:z.boolean().optional(),
  exercise:z.string().trim().min(2).max(80).optional(),
  partner:z.string().regex(/^Partner [1-9][0-9]?$/).optional(),
  noteContains:z.string().trim().min(2).max(80).optional(),
  relative:z.boolean().optional(),
  reps:z.number().int().min(1).max(50).optional(),
}).refine(query=>query.from===null||query.from<=query.through);
const meal=z.object({description:z.string().trim().min(2).max(maxMealText),day:z.iso.date().optional()}).strict();
const lift=z.object({weightKg:z.number().positive().max(1000),reps:z.number().int().min(1).max(10)}).strict();
const registry={
  analyze_fitness:{schema:analysis,description:'Read recorded training, strength/PRs, muscles, partner rankings, workouts, note matches, nutrition/maintenance, bodyweight or goals. Supply inclusive ISO dates (from null means recorded history). Use independently dated operations to compare periods. Use a Partner N alias to compare matching tagged workouts with other workouts. Filter strength, training or muscles by exercise. Strength supports exact reps and bodyweight-relative estimates. Notes supports noteContains. Combine complementary datasets for broad questions.'},
  prepare_meal:{schema:meal,description:'Prepare an editable diary preview when the athlete reports eating or asks to log a meal. For corrections return the complete revised description, keeping unaffected items, amounts and meal slot. Use comma-separated items with quantities and units when known. Specify day only if requested. Ask when the referenced item is ambiguous. Only the athlete can confirm and save.'},
  estimate_lift:{schema:lift,description:'Calculate a hypothetical estimated one-rep max for a proposed weight in kilograms and one to ten reps. Use established context for those inputs and ask when either is missing. It does not use or alter workout records.'},
};
export type CoachAnalysis=z.infer<typeof analysis>;
export const coachCapabilities=Object.entries(registry).map(([name,tool])=>name+': '+tool.description).join('\n');
export const coachTools=Object.entries(registry).map(([name,tool])=>({type:'function' as const,function:{
  name,description:tool.description,parameters:z.toJSONSchema(tool.schema),
}}));
const operation=z.discriminatedUnion('name',[
  z.object({name:z.literal('analyze_fitness'),arguments:analysis}).strict(),
  z.object({name:z.literal('prepare_meal'),arguments:meal}).strict(),
  z.object({name:z.literal('estimate_lift'),arguments:lift}).strict(),
]);
export const coachPlan=z.object({operations:z.array(operation).max(4)}).strict()
  .refine(plan=>plan.operations.filter(row=>row.name==='prepare_meal').length<=1);
export type CoachPlan=z.infer<typeof coachPlan>;
