import {weekKey, shiftDay} from './analytics';

export function comparablePeriod(today: string, kind: 'week' | 'month') {
  const start = kind === 'week' ? weekKey(today) : today.slice(0, 7) + '-01';
  const thisMonth = new Date(start);
  const previous = kind === 'week' ? shiftDay(start, -7) :
    new Date(Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const dayMs = 86_400_000;
  const elapsed = Math.min((Date.parse(today) - Date.parse(start)) / dayMs, (Date.parse(start) - Date.parse(previous)) / dayMs);
  return {start, previous, elapsed, end: shiftDay(start, elapsed), previousEnd: shiftDay(previous, elapsed)};
}
