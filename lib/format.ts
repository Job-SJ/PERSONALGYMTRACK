import {zone} from './analytics';

export type Locale = 'en-GB' | 'nl-NL';
export const localeCookie = 'pgt-locale';
export const resolveLocale = (value?: string): Locale => value === 'nl-NL' ? value : 'en-GB';

export function formatNumber(value: number | null | undefined, digits = 0, locale: Locale = 'en-GB') {
  return value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat(locale, {maximumFractionDigits: digits}).format(value);
}

export function formatUnit(value: number | null | undefined, unit: string, digits = 0, locale: Locale = 'en-GB') {
  const formatted = formatNumber(value, digits, locale);
  return formatted === '—' ? formatted : formatted + ' ' + unit;
}

export function formatPercent(value: number, locale: Locale = 'en-GB') {
  return new Intl.NumberFormat(locale, {style: 'percent', maximumFractionDigits: 1}).format(value);
}

export function formatDate(value: string, locale: Locale = 'en-GB', options: Intl.DateTimeFormatOptions = {day: 'numeric', month: 'short'}) {
  return new Intl.DateTimeFormat(locale, {...options, timeZone: value.length === 10 ? 'UTC' : zone}).format(new Date(value));
}
