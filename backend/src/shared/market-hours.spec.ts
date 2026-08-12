import {
  getMarketStatus,
  getNextMarketOpen,
  getPreviousMarketClose,
  isMarketOpen,
} from './market-hours';

describe('market-hours', () => {
  describe('isMarketOpen', () => {
    it('is open mid-session on a normal trading day (Mon Aug 10, 2026)', () => {
      expect(isMarketOpen(new Date('2026-08-10T14:00:00.000Z'))).toBe(true);
    });

    it('is closed before the 09:30 open', () => {
      expect(isMarketOpen(new Date('2026-08-10T13:00:00.000Z'))).toBe(false);
    });

    it('is open in the final minute before close (15:59 ET)', () => {
      expect(isMarketOpen(new Date('2026-08-10T19:59:00.000Z'))).toBe(true);
    });

    it('is closed exactly at 16:00 close', () => {
      expect(isMarketOpen(new Date('2026-08-10T20:00:00.000Z'))).toBe(false);
    });

    it('is closed on a weekend regardless of time', () => {
      // Sat Aug 15, 2026, mid-day ET.
      expect(isMarketOpen(new Date('2026-08-15T16:00:00.000Z'))).toBe(false);
    });

    it('is closed on a NYSE holiday during normal session hours', () => {
      // New Year's Day 2026 (Thursday), 10:00 ET.
      expect(isMarketOpen(new Date('2026-01-01T15:00:00.000Z'))).toBe(false);
    });
  });

  describe('getNextMarketOpen', () => {
    it("returns today's open when queried before today's open", () => {
      const result = getNextMarketOpen(new Date('2026-08-10T12:00:00.000Z'));
      expect(result.toISOString()).toBe('2026-08-10T13:30:00.000Z');
    });

    it("returns tomorrow's open when the market is currently open", () => {
      const result = getNextMarketOpen(new Date('2026-08-10T14:00:00.000Z'));
      expect(result.toISOString()).toBe('2026-08-11T13:30:00.000Z');
    });

    it('skips the weekend from a Friday-after-close query', () => {
      // Fri Aug 14, 2026, after close.
      const result = getNextMarketOpen(new Date('2026-08-14T21:00:00.000Z'));
      expect(result.toISOString()).toBe('2026-08-17T13:30:00.000Z');
    });

    it('skips both the weekend and a Monday holiday (Labor Day 2026)', () => {
      // Fri Sep 4, 2026, after close; Mon Sep 7 is Labor Day.
      const result = getNextMarketOpen(new Date('2026-09-04T21:00:00.000Z'));
      expect(result.toISOString()).toBe('2026-09-08T13:30:00.000Z');
    });
  });

  describe('getPreviousMarketClose', () => {
    it("returns the prior day's close when queried before today's close", () => {
      // Wed Aug 12, 2026, 10:00 ET (market open, close not yet reached).
      const result = getPreviousMarketClose(
        new Date('2026-08-12T14:00:00.000Z'),
      );
      expect(result.toISOString()).toBe('2026-08-11T20:00:00.000Z');
    });

    it('skips the weekend + Labor Day holiday when walking backward', () => {
      // Tue Sep 8, 2026, 08:00 ET (before open).
      const result = getPreviousMarketClose(
        new Date('2026-09-08T12:00:00.000Z'),
      );
      expect(result.toISOString()).toBe('2026-09-04T20:00:00.000Z');
    });
  });

  describe('getMarketStatus', () => {
    it('reports isOpen=true with nextCloseAt set and lastCloseAt null', () => {
      const status = getMarketStatus(new Date('2026-08-10T14:00:00.000Z'));
      expect(status.isOpen).toBe(true);
      expect(status.nextCloseAt).toBe('2026-08-10T16:00:00.000-04:00');
      expect(status.lastCloseAt).toBeNull();
    });

    it('reports isOpen=false with lastCloseAt set and nextCloseAt null', () => {
      const status = getMarketStatus(new Date('2026-08-15T16:00:00.000Z'));
      expect(status.isOpen).toBe(false);
      expect(status.nextCloseAt).toBeNull();
      expect(status.lastCloseAt).not.toBeNull();
      expect(status.nextOpenAt).toBe('2026-08-17T09:30:00.000-04:00');
    });
  });
});
