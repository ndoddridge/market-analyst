import { ServiceUnavailableException } from '@nestjs/common';
import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { Recommendation } from '../analysis/types/analysis-result';
import { MarketTodayService } from './market-today.service';
import { MarketDirection } from './types/market-today';

describe('MarketTodayService', () => {
  const scannerService = {
    scan: jest.fn(),
  };

  let service: MarketTodayService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MarketTodayService(scannerService as never);
  });

  it('builds today summary from ranked scanner results', async () => {
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
    expect(result.summary).toContain('NVDA');
    expect(result.summary).toContain('AMD');
    expect(result.generatedAt).toEqual(expect.any(String));
  });

  it('marks direction MIXED when bullish and bearish counts tie', async () => {
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

    const result = await service.getToday(AnalysisProfile.LONG_TERM);

    expect(result.marketDirection).toBe(MarketDirection.MIXED);
    expect(result.profile).toBe(AnalysisProfile.LONG_TERM);
  });

  it('throws when scanner returns no results', async () => {
    scannerService.scan.mockResolvedValue([]);

    await expect(service.getToday()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
