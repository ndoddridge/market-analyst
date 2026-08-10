/**
 * US equity market session clock.
 * Used so "today" / generatedAt stay aligned with the trading day instead of
 * rolling forward on UTC midnight while US markets are still on the prior date.
 */
export const MARKET_TIME_ZONE = 'America/New_York';

type DateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function getZonedParts(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00';

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function getTimeZoneOffsetIso(date: Date, timeZone: string): string {
  const tzName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;

  if (!tzName) {
    return 'Z';
  }

  // Examples: "GMT", "GMT-4", "GMT-04:00", "GMT+5:30"
  if (tzName === 'GMT' || tzName === 'UTC') {
    return '+00:00';
  }

  const match = tzName.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) {
    return 'Z';
  }

  const sign = match[1];
  const hours = match[2].padStart(2, '0');
  const minutes = (match[3] ?? '00').padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

/** Calendar date (YYYY-MM-DD) in the market timezone. */
export function getMarketCalendarDate(date: Date = new Date()): string {
  const parts = getZonedParts(date, MARKET_TIME_ZONE);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Instant formatted in market timezone with numeric offset.
 * Example: 2026-08-09T20:15:30.123-04:00
 */
export function toMarketIsoString(date: Date = new Date()): string {
  const parts = getZonedParts(date, MARKET_TIME_ZONE);
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  const offset = getTimeZoneOffsetIso(date, MARKET_TIME_ZONE);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${ms}${offset}`;
}

/** Elapsed whole calendar days between two instants on the market calendar. */
export function marketCalendarDaysBetween(
  from: Date,
  to: Date = new Date(),
): number {
  const fromDay = getMarketCalendarDate(from);
  const toDay = getMarketCalendarDate(to);
  const fromUtc = Date.parse(`${fromDay}T00:00:00.000Z`);
  const toUtc = Date.parse(`${toDay}T00:00:00.000Z`);
  return Math.floor((toUtc - fromUtc) / (24 * 60 * 60 * 1000));
}
