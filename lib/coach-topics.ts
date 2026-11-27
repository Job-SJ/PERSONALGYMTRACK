import {z} from 'zod';

export const topics={
  strength:'Am I getting stronger?',
  bench:'What does my bench press progression show?',
  nutrition:'How is my nutrition progressing?',
  month:'What changed over the past month?',
  goals:'Am I moving toward my goals?',
  next:'What should I focus on in my next training session?',
  week:'Summarize my training week.',
} as const;
export const topicSchema=z.enum(Object.keys(topics) as [keyof typeof topics,...(keyof typeof topics)[]]);
export type Topic=z.infer<typeof topicSchema>;
