import { ServiceUnavailableException } from '@nestjs/common';
import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { Recommendation } from '../analysis/types/analysis-result';
import { MarketEventType } from '../events/types/market-event';
import { toMarketIsoString } from '../shared/market-clock';
import { MarketTodayService } from './market-today.service';
import {
  CatalystType,
  MarketDirection,
  SetupQuality,
  TodayAction,
} from './types/market-today';

describe('MarketTodayService', () => {
  const scannerService = {
    scan: jest.fn(),
  };
  const newsService = {
    getRecentNews: jest.fn(),
  };
  const eventsService = {
    getUpcomingEvents: jest.fn(),
  };

  let service: MarketTodayService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // UTC morning Aug 10 == still Aug 9 evening in America/New_York.
    jest.setSystemTime(new Date('2026-08-10T00:30:00.000Z'));
    service = new MarketTodayService(
      scannerService as never,
      newsService as never,
      eventsService as never,
    );
    newsService.getRecentNews.mockResolvedValue([]);
    eventsService.getUpcomingEvents.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function spyOpportunityFixture() {
    return [
      {
        ticker: 'SPY',
        companyName: 'SPDR',
        profile: AnalysisProfile.SHORT_TERM,
        recommendation: Recommendation.BUY,
        score: 83,
        confidence: 0.6,
        suggestedHoldingWindow: { minDays: 5, maxDays: 15 },
        recommendedAction: 'Open a position.',
      },
      {
        ticker: 'TSM',
        companyName: 'TSMC',
        profile: AnalysisProfile.SHORT_TERM,
        recommendation: Recommendation.SELL,
        score: 20,
        confidence: 0.6,
        suggestedHoldingWindow: { minDays: 0, maxDays: 0 },
        recommendedAction: 'Reduce or exit position.',
      },
    ];
  }

  it('builds today summary from ranked scanner results and includes catalyst', async () => {
    scannerService.scan.mockResolvedValue([
      {
        ticker: 'NVDA',
        companyName: 'NVIDIA',
        profile: AnalysisProfile.SHORT_TERM,
        recommendation: Recommendation.BUY,
        score: 90,
        confidence: 0.6,
        suggestedHoldingWindow: { minDays: 5, maxDays: 15 },
        recommendedAction: 'Open a position.',
      },
      {
        ticker: 'AAPL',
        companyName: 'Apple',
        profile: AnalysisProfile.SHORT_TERM,
        recommendation: Recommendation.WATCH,
        score: 70,
        confidence: 0.6,
        suggestedHoldingWindow: { minDays: 3, maxDays: 10 },
        recommendedAction: 'Wait.',
      },
      {
        ticker: 'AMD',
        companyName: 'AMD',
        profile: AnalysisProfile.SHORT_TERM,
        recommendation: Recommendation.SELL,
        score: 20,
        confidence: 0.6,
        suggestedHoldingWindow: { minDays: 0, maxDays: 0 },
        recommendedAction: 'Reduce or exit position.',
      },
    ]);
    newsService.getRecentNews.mockResolvedValue([
      {
        id: 'n1',
        title: 'NVIDIA demand stays strong',
        source: 'Wire',
        url: null,
        publishedAt: '2026-08-09T10:00:00.000Z',
        relatedTickers: ['NVDA'],
        querySymbol: 'NVDA',
        provider: 'Yahoo Finance',
      },
    ]);

    const result = await service.getToday(AnalysisProfile.SHORT_TERM);

    expect(scannerService.scan).toHaveBeenCalledWith({
      profile: AnalysisProfile.SHORT_TERM,
    });
    expect(result.profile).toBe(AnalysisProfile.SHORT_TERM);
    expect(result.marketDirection).toBe(MarketDirection.BULLISH);
    expect(result.topOpportunity).toEqual({
      ticker: 'NVDA',
      recommendation: TodayAction.WATCH,
      score: 90,
    });
    expect(result.topRisk).toEqual({
      ticker: 'AMD',
      recommendation: TodayAction.SELL,
      score: 20,
    });
    expect(result.catalyst).toEqual({
      type: CatalystType.NEWS,
      headline: 'NVIDIA demand stays strong',
      ticker: 'NVDA',
      date: '2026-08-09T10:00:00.000Z',
      source: 'Yahoo Finance',
    });
    expect(result.decision).toEqual(
      expect.objectContaining({
        signalScore: 90,
        setupQuality: SetupQuality.MODERATE,
      }),
    );
    expect(result.decision?.catalystScore).toBeGreaterThan(0);
    expect(result.reason).toMatch(/NVDA/);
    expect(result.summary).toContain('next few trading days');
    expect(result.summary).toContain('Catalyst: NVIDIA demand stays strong');
    expect(result.generatedAt).toBe(
      toMarketIsoString(new Date('2026-08-10T00:30:00.000Z')),
    );
  });

  it('uses market-timezone generatedAt on the UTC/local date boundary', async () => {
    scannerService.scan.mockResolvedValue(spyOpportunityFixture());

    const result = await service.getToday(AnalysisProfile.SHORT_TERM);

    expect(result.generatedAt.startsWith('2026-08-09T')).toBe(true);
    expect(result.generatedAt.endsWith('Z')).toBe(false);
    expect(result.generatedAt).toBe('2026-08-09T20:30:00.000-04:00');
  });

  it('rejects a VOO-specific product story as SPY catalyst', async () => {
    scannerService.scan.mockResolvedValue(spyOpportunityFixture());
    newsService.getRecentNews.mockResolvedValue([
      {
        id: 'voo',
        title:
          'VOO Is About to Become the First $1 Trillion ETF, and SPY Holders Are Paying 3x More for the Same Index',
        source: 'Yahoo Finance',
        url: null,
        publishedAt: '2026-08-08T18:08:06.000Z',
        relatedTickers: ['SPY', 'VOO'],
        querySymbol: 'SPY',
        provider: 'Yahoo Finance',
      },
    ]);

    const result = await service.getToday(AnalysisProfile.SHORT_TERM);

    expect(result.topOpportunity.ticker).toBe('SPY');
    expect(result.topOpportunity.recommendation).toBe(TodayAction.WATCH);
    expect(result.catalyst).toBeNull();
    expect(result.decision?.catalystScore).toBe(0);
    expect(result.reason).toMatch(/WATCH/i);
  });

  it('rejects a VFIAX-style fund fee/comparison story as an SPY SHORT_TERM catalyst', async () => {
    scannerService.scan.mockResolvedValue(spyOpportunityFixture());
    newsService.getRecentNews.mockResolvedValue([
      {
        id: 'vfiax',
        title:
          'Forget VFIAX: Vanguard Sells You the Same S&P 500 Fund Without the $3,000 Toll, or the $75 Fee Fidelity Charges to Buy It',
        source: 'Yahoo Finance',
        url: null,
        publishedAt: '2026-08-09T16:04:46.000Z',
        relatedTickers: ['SPY', 'VFIAX'],
        querySymbol: 'SPY',
        provider: 'Yahoo Finance',
      },
    ]);

    const result = await service.getToday(AnalysisProfile.SHORT_TERM);

    expect(result.topOpportunity.ticker).toBe('SPY');
    expect(result.catalyst).toBeNull();
    expect(result.decision?.catalystScore).toBe(0);
    expect(result.summary).toContain(
      'No confirmed news or event catalyst is available',
    );
  });

  it('accepts a broad-market catalyst for SPY when materially relevant', async () => {
    scannerService.scan.mockResolvedValue(spyOpportunityFixture());
    newsService.getRecentNews.mockResolvedValue([
      {
        id: 'macro',
        title: 'S&P 500 futures rise as Wall Street digests inflation data',
        source: 'Wire',
        url: null,
        publishedAt: '2026-08-09T14:00:00.000Z',
        relatedTickers: ['^GSPC', 'SPY'],
        querySymbol: 'SPY',
        provider: 'Yahoo Finance',
      },
      {
        id: 'voo',
        title:
          'VOO Is About to Become the First $1 Trillion ETF, and SPY Holders Are Paying 3x More for the Same Index',
        source: 'Yahoo Finance',
        url: null,
        publishedAt: '2026-08-09T15:00:00.000Z',
        relatedTickers: ['SPY', 'VOO'],
        querySymbol: 'SPY',
        provider: 'Yahoo Finance',
      },
    ]);

    const result = await service.getToday(AnalysisProfile.SHORT_TERM);

    expect(result.catalyst).toEqual({
      type: CatalystType.NEWS,
      headline: 'S&P 500 futures rise as Wall Street digests inflation data',
      ticker: 'SPY',
      date: '2026-08-09T14:00:00.000Z',
      source: 'Yahoo Finance',
    });
  });

  it('rejects stale catalysts according to SHORT_TERM recency rules', async () => {
    scannerService.scan.mockResolvedValue(spyOpportunityFixture());
    newsService.getRecentNews.mockResolvedValue([
      {
        id: 'old',
        title: 'S&P 500 closes lower ahead of Fed decision',
        source: 'Wire',
        url: null,
        publishedAt: '2026-07-01T00:00:00.000Z',
        relatedTickers: ['SPY'],
        querySymbol: 'SPY',
        provider: 'Yahoo Finance',
      },
    ]);

    const result = await service.getToday(AnalysisProfile.SHORT_TERM);
    expect(result.catalyst).toBeNull();
  });

  it('is deterministic for the same scanner/news inputs', async () => {
    scannerService.scan.mockResolvedValue(spyOpportunityFixture());
    newsService.getRecentNews.mockResolvedValue([
      {
        id: 'macro',
        title: 'S&P 500 futures rise as Wall Street digests inflation data',
        source: 'Wire',
        url: null,
        publishedAt: '2026-08-09T14:00:00.000Z',
        relatedTickers: ['^GSPC', 'SPY'],
        querySymbol: 'SPY',
        provider: 'Yahoo Finance',
      },
    ]);

    const first = await service.getToday(AnalysisProfile.SHORT_TERM);
    const second = await service.getToday(AnalysisProfile.SHORT_TERM);

    expect(second).toEqual(first);
  });

  it('prefers a multi-month event catalyst for LONG_TERM and uses NEUTRAL when tied', async () => {
    scannerService.scan.mockResolvedValue([
      {
        ticker: 'AAPL',
        companyName: 'Apple',
        profile: AnalysisProfile.LONG_TERM,
        recommendation: Recommendation.BUY,
        score: 80,
        confidence: 0.6,
        suggestedHoldingWindow: { minDays: 180, maxDays: 730 },
        recommendedAction: 'Open a position.',
      },
      {
        ticker: 'AMD',
        companyName: 'AMD',
        profile: AnalysisProfile.LONG_TERM,
        recommendation: Recommendation.SELL,
        score: 20,
        confidence: 0.6,
        suggestedHoldingWindow: { minDays: 0, maxDays: 0 },
        recommendedAction: 'Reduce or exit position.',
      },
    ]);
    eventsService.getUpcomingEvents.mockResolvedValue([
      {
        id: 'near',
        title: 'AAPL ex-dividend',
        type: MarketEventType.DIVIDEND,
        ticker: 'AAPL',
        eventDate: '2026-08-12T00:00:00.000Z',
        provider: 'Yahoo Finance',
      },
      {
        id: 'e1',
        title: 'AAPL earnings',
        type: MarketEventType.EARNINGS,
        ticker: 'AAPL',
        eventDate: '2026-10-29T20:00:00.000Z',
        provider: 'Yahoo Finance',
      },
    ]);
    newsService.getRecentNews.mockResolvedValue([
      {
        id: 'n1',
        title: 'Apple suppliers prepare for next iPhone cycle',
        source: 'Wire',
        url: null,
        publishedAt: '2026-08-09T10:00:00.000Z',
        relatedTickers: ['AAPL'],
        querySymbol: 'AAPL',
        provider: 'Yahoo Finance',
      },
    ]);

    const result = await service.getToday(AnalysisProfile.LONG_TERM);

    expect(result.catalyst?.type).toBe(CatalystType.EVENT);
    expect(result.catalyst?.headline).toBe('AAPL earnings');
    expect(result.catalyst?.date).toBe('2026-10-29T20:00:00.000Z');
    expect(result.marketDirection).toBe(MarketDirection.NEUTRAL);
    expect(result.decision).toBeNull();
    expect(result.topOpportunity).toEqual({
      ticker: 'AAPL',
      recommendation: TodayAction.BUY,
      score: 80,
    });
    expect(result.reason).toContain('LONG_TERM scanner score');
    expect(result.summary).toContain('multi-month opportunities');
  });

  it('rejects an unrelated company story as SPY catalyst and returns null', async () => {
    scannerService.scan.mockResolvedValue(spyOpportunityFixture());
    newsService.getRecentNews.mockResolvedValue([
      {
        id: 'bad',
        title:
          'Chinese wind turbine maker urges Burnham to overturn security ban',
        source: 'Wire',
        url: null,
        publishedAt: '2026-08-09T14:30:00.000Z',
        relatedTickers: ['SPY', 'NVDA'],
        querySymbol: 'SPY',
        provider: 'Yahoo Finance',
      },
    ]);

    const result = await service.getToday(AnalysisProfile.SHORT_TERM);

    expect(result.topOpportunity.ticker).toBe('SPY');
    expect(result.topOpportunity.recommendation).toBe(TodayAction.WATCH);
    expect(result.catalyst).toBeNull();
    expect(result.decision?.catalystScore).toBe(0);
    expect(result.summary).toContain(
      'No confirmed news or event catalyst is available',
    );
  });

  it('throws when scanner returns no results', async () => {
    scannerService.scan.mockResolvedValue([]);

    await expect(service.getToday()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
