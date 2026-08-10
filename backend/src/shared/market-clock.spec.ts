import {
  getMarketCalendarDate,
  marketCalendarDaysBetween,
  toMarketIsoString,
} from './market-clock';

describe('market clock', () => {
  it('keeps the US market calendar date on the UTC-day boundary', () => {
    // 2026-08-10 00:30 UTC == 2026-08-09 20:30 in America/New_York (EDT).
    const utcRollover = new Date('2026-08-10T00:30:00.000Z');

    expect(getMarketCalendarDate(utcRollover)).toBe('2026-08-09');
    expect(toMarketIsoString(utcRollover)).toBe(
      '2026-08-09T20:30:00.000-04:00',
    );
  });

  it('formats generatedAt with a market-zone offset instead of bare UTC Z', () => {
    const afternoonEt = new Date('2026-08-09T18:15:45.123Z');
    const formatted = toMarketIsoString(afternoonEt);

    expect(formatted.startsWith('2026-08-09T')).toBe(true);
    expect(formatted.endsWith('Z')).toBe(false);
    expect(formatted).toMatch(/-0[45]:00$/);
  });

  it('measures catalyst age in market calendar days across the boundary', () => {
    const published = new Date('2026-08-08T22:00:00.000Z'); // Aug 8 evening ET
    const now = new Date('2026-08-10T01:00:00.000Z'); // still Aug 9 evening ET

    expect(getMarketCalendarDate(published)).toBe('2026-08-08');
    expect(getMarketCalendarDate(now)).toBe('2026-08-09');
    expect(marketCalendarDaysBetween(published, now)).toBe(1);
  });
});
