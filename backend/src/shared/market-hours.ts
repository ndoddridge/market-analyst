import {
  MARKET_TIME_ZONE,
  getMarketCalendarDate,
  getMarketTimeParts,
  getTimeZoneOffsetIso,
  toMarketIsoString,
} from './market-clock';
import type { MarketStatus } from './types/market-status';

const OPEN_MINUTES = 9 * 60 + 30; // 09:30 America/New_York
const CLOSE_MINUTES = 16 * 60; // 16:00 America/New_York

/**
 * NYSE full-market-closure holidays (YYYY-MM-DD, America/New_York calendar date).
 * Hardcoded for 2026–2027 only; early-close half days are not modeled.
 * Known limitation — this list needs a manual update every year.
 */
export const NYSE_HOLIDAYS: readonly string[] = [
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // Martin Luther King Jr. Day
  '2026-02-16', // Washington's Birthday
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving Day
  '2026-12-25', // Christmas Day
  // 2027
  '2027-01-01', // New Year's Day
  '2027-01-18', // Martin Luther King Jr. Day
  '2027-02-15', // Washington's Birthday
  '2027-03-26', // Good Friday
  '2027-05-31', // Memorial Day
  '2027-07-05', // Independence Day (observed)
  '2027-09-06', // Labor Day
  '2027-11-25', // Thanksgiving Day
  '2027-12-24', // Christmas Day (observed)
];

function minutesOfDay(date: Date): number {
  const parts = getMarketTimeParts(date);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}

function isTradingDay(dateStr: string): boolean {
  const weekday = weekdayOf(dateStr);
  if (weekday === 0 || weekday === 6) {
    return false;
  }
  return !NYSE_HOLIDAYS.includes(dateStr);
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Instant for a given NY calendar date + minutes-from-midnight, DST-correct.
 * The offset is sampled at local noon on that date; NYSE sessions never span
 * a DST transition (transitions occur at 2am local), so this is exact.
 */
function sessionInstant(dateStr: string, minutesFromMidnight: number): Date {
  const noonGuess = new Date(`${dateStr}T12:00:00.000Z`);
  const offset = getTimeZoneOffsetIso(noonGuess, MARKET_TIME_ZONE);
  const hh = String(Math.floor(minutesFromMidnight / 60)).padStart(2, '0');
  const mm = String(minutesFromMidnight % 60).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:${mm}:00.000${offset}`);
}

/** Regular session only: Mon–Fri 09:30–16:00 America/New_York, minus NYSE holidays. */
export function isMarketOpen(date: Date = new Date()): boolean {
  const dateStr = getMarketCalendarDate(date);
  if (!isTradingDay(dateStr)) {
    return false;
  }
  const minutes = minutesOfDay(date);
  return minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES;
}

/** Next regular-session open at or after `date` (strictly in the future). */
export function getNextMarketOpen(date: Date = new Date()): Date {
  let dateStr = getMarketCalendarDate(date);

  if (isTradingDay(dateStr)) {
    const openInstant = sessionInstant(dateStr, OPEN_MINUTES);
    if (openInstant.getTime() > date.getTime()) {
      return openInstant;
    }
  }

  do {
    dateStr = addDaysToDateStr(dateStr, 1);
  } while (!isTradingDay(dateStr));

  return sessionInstant(dateStr, OPEN_MINUTES);
}

/** Most recent regular-session close at or before `date`. */
export function getPreviousMarketClose(date: Date = new Date()): Date {
  let dateStr = getMarketCalendarDate(date);

  if (isTradingDay(dateStr)) {
    const closeInstant = sessionInstant(dateStr, CLOSE_MINUTES);
    if (closeInstant.getTime() <= date.getTime()) {
      return closeInstant;
    }
  }

  do {
    dateStr = addDaysToDateStr(dateStr, -1);
  } while (!isTradingDay(dateStr));

  return sessionInstant(dateStr, CLOSE_MINUTES);
}

export function getMarketStatus(date: Date = new Date()): MarketStatus {
  const isOpen = isMarketOpen(date);
  const nextOpenAt = toMarketIsoString(getNextMarketOpen(date));

  if (isOpen) {
    const dateStr = getMarketCalendarDate(date);
    return {
      isOpen,
      nextOpenAt,
      nextCloseAt: toMarketIsoString(sessionInstant(dateStr, CLOSE_MINUTES)),
      lastCloseAt: null,
    };
  }

  return {
    isOpen,
    nextOpenAt,
    nextCloseAt: null,
    lastCloseAt: toMarketIsoString(getPreviousMarketClose(date)),
  };
}
