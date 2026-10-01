import english from './locales/en.json' with { type: 'json' };
import russian from './locales/ru.json' with { type: 'json' };
import { z } from 'zod';

export type Locale = 'ru' | 'en';
export type Message = keyof typeof english;
const translations: Record<Locale, Record<Message, string>> = { en: english, ru: russian };
let locale: Locale = 'en';
z.config(z.locales.en());
const listeners = new Set<() => void>();

export const getLocale = (): Locale => locale;
export function isLocale(value: unknown): value is Locale {
  return value === 'ru' || value === 'en';
}
export function setLocale(value: Locale) {
  if (value === locale) return;
  locale = value;
  z.config(value === 'en' ? z.locales.en() : z.locales.ru());
  for (const listener of listeners) listener();
}
export function subscribeLocale(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function tr(message: Message, ...parameters: unknown[]): string {
  const template = translations[locale][message];
  return template.replace(/\{(\d+)\}/g, (_, index: string) => String(parameters[Number(index)]));
}
