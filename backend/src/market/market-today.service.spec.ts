import { ServiceUnavailableException } from '@nestjs/common';
import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { Recommendation } from '../analysis/types/analysis-result';
import { MarketEventType } from '../events/types/market-event';
import { MarketTodayService } from './market-today.service';
import { CatalystType, MarketDirection } from './types/market-today';

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
    jest.setSystemTime(new Date('2026-08-09T12:00:00.000Z'));
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
      recommendation: Recommendation.BUY,
      score: 90,
    });
    expect(result.topRisk).toEqual({
      ticker: 'AMD',
      recommendation: Recommendation.SELL,
      score: 20,
    });
    expect(result.catalyst).toEqual({
      type: CatalystType.NEWS,
      headline: 'NVIDIA demand stays strong',
      ticker: 'NVDA',
      date: '2026-08-09T10:00:00.000Z',
      source: 'Yahoo Finance',
    });
    expect(result.summary).toContain('next few trading days');
    expect(result.summary).toContain('Catalyst: NVIDIA demand stays strong');
    expect(result.generatedAt).toEqual(expect.any(String));
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
    expect(result.summary).toContain('multi-month opportunities');
  });

  it('returns null catalyst and states unavailability when none fit the profile horizon', async () => {
    scannerService.scan.mockResolvedValue([
      {
        ticker: 'SPY',
        companyName: 'SPDR',
        profile: AnalysisProfile.SHORT_TERM,
        recommendation: Recommendation.HOLD,
        score: 50,
        confidence: 0.6,
        suggestedHoldingWindow: { minDays: 1, maxDays: 5 },
        recommendedAction: 'Maintain current position.',
      },
    ]);
    eventsService.getUpcomingEvents.mockResolvedValue([
      {
        id: 'far',
        title: 'SPY earnings',
        type: MarketEventType.EARNINGS,
        ticker: 'SPY',
        eventDate: '2026-11-01T00:00:00.000Z',
        provider: 'Yahoo Finance',
      },
    ]);
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
    expect(result.summary).toContain(
      'No confirmed news or event catalyst is available',
    );
    expect(result.marketDirection).toBe(MarketDirection.NEUTRAL);
  });

  it('rejects an unrelated company story as SPY catalyst and returns null', async () => {
    scannerService.scan.mockResolvedValue([
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
    ]);
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
    expect(result.catalyst).toBeNull();
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
