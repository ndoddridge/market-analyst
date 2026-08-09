import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisService } from '../analysis/analysis.service';
import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { Recommendation } from '../analysis/types/analysis-result';
import { RiskLevel } from '../analysis/types/analysis-summary';
import { ScannerService } from './scanner.service';

describe('ScannerService', () => {
  let scannerService: ScannerService;
  let analysisService: { analyzeSummary: jest.Mock };

  beforeEach(async () => {
    analysisService = {
      analyzeSummary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScannerService,
        { provide: AnalysisService, useValue: analysisService },
      ],
    }).compile();

    scannerService = module.get(ScannerService);
  });

  it('maps analysis summaries, keeps only scanner fields, and sorts by score desc', async () => {
    analysisService.analyzeSummary.mockImplementation(async (ticker: string) => {
      const byTicker: Record<string, { score: number; action: string }> = {
        AAPL: { score: 70, action: 'Wait.' },
        MSFT: { score: 90, action: 'Open a position.' },
        NVDA: { score: 80, action: 'Open a position.' },
      };
      const entry = byTicker[ticker];

      return {
        ticker,
        companyName: `${ticker} Corp`,
        profile: AnalysisProfile.SHORT_TERM,
        recommendation: Recommendation.BUY,
        score: entry.score,
        confidence: 0.6,
        suggestedHoldingWindow: { minDays: 5, maxDays: 15 },
        riskLevel: RiskLevel.MEDIUM,
        summary: ['unused in scanner'],
        strategy: {
          recommendedAction: entry.action,
          entryStrategy: 'unused',
          entryWindow: 'unused',
          positionSizing: 'unused',
          holdingPeriod: 'unused',
          exitStrategy: 'unused',
          riskSummary: 'unused',
        },
        detailsAvailable: true,
      };
    });

    const results = await scannerService.scan({
      watchlist: ['AAPL', 'MSFT', 'NVDA'],
      profile: AnalysisProfile.SHORT_TERM,
    });

    expect(analysisService.analyzeSummary).toHaveBeenCalledTimes(3);
    expect(analysisService.analyzeSummary).toHaveBeenCalledWith(
      'AAPL',
      AnalysisProfile.SHORT_TERM,
    );
    expect(results.map((result) => result.ticker)).toEqual([
      'MSFT',
      'NVDA',
      'AAPL',
    ]);
    expect(results[0]).toEqual({
      ticker: 'MSFT',
      companyName: 'MSFT Corp',
      profile: AnalysisProfile.SHORT_TERM,
      recommendation: Recommendation.BUY,
      score: 90,
      confidence: 0.6,
      suggestedHoldingWindow: { minDays: 5, maxDays: 15 },
      recommendedAction: 'Open a position.',
    });
    expect(results[0]).not.toHaveProperty('riskLevel');
    expect(results[0]).not.toHaveProperty('strategy');
    expect(results[0]).not.toHaveProperty('summary');
  });

  it('passes LONG_TERM profile through to the analysis pipeline', async () => {
    analysisService.analyzeSummary.mockResolvedValue({
      ticker: 'AAPL',
      companyName: 'Apple Inc',
      profile: AnalysisProfile.LONG_TERM,
      recommendation: Recommendation.WATCH,
      score: 65,
      confidence: 0.6,
      suggestedHoldingWindow: { minDays: 90, maxDays: 180 },
      riskLevel: RiskLevel.MEDIUM,
      summary: ['ok'],
      strategy: {
        recommendedAction: 'Wait.',
        entryStrategy: 'unused',
        entryWindow: 'unused',
        positionSizing: 'unused',
        holdingPeriod: 'unused',
        exitStrategy: 'unused',
        riskSummary: 'unused',
      },
      detailsAvailable: true,
    });

    const results = await scannerService.scan({
      watchlist: ['AAPL'],
      profile: AnalysisProfile.LONG_TERM,
    });

    expect(analysisService.analyzeSummary).toHaveBeenCalledWith(
      'AAPL',
      AnalysisProfile.LONG_TERM,
    );
    expect(results[0].profile).toBe(AnalysisProfile.LONG_TERM);
  });

  it('skips tickers that fail analysis and still returns successful results', async () => {
    analysisService.analyzeSummary.mockImplementation(async (ticker: string) => {
      if (ticker === 'BAD') {
        throw new Error('provider failure');
      }

      return {
        ticker,
        companyName: 'Good Corp',
        profile: AnalysisProfile.SHORT_TERM,
        recommendation: Recommendation.WATCH,
        score: 65,
        confidence: 0.55,
        suggestedHoldingWindow: { minDays: 3, maxDays: 10 },
        riskLevel: RiskLevel.LOW,
        summary: ['ok'],
        strategy: {
          recommendedAction: 'Wait.',
          entryStrategy: 'unused',
          entryWindow: 'unused',
          positionSizing: 'unused',
          holdingPeriod: 'unused',
          exitStrategy: 'unused',
          riskSummary: 'unused',
        },
        detailsAvailable: true,
      };
    });

    const results = await scannerService.scan({
      watchlist: ['BAD', 'GOOD'],
    });

    expect(results).toHaveLength(1);
    expect(results[0].ticker).toBe('GOOD');
    expect(results[0].recommendedAction).toBe('Wait.');
  });

  it('returns an empty list when every ticker fails analysis', async () => {
    analysisService.analyzeSummary.mockRejectedValue(
      new Error('Configuration key "FINNHUB_API_KEY" does not exist'),
    );

    await expect(
      scannerService.scan({ watchlist: ['AAPL', 'MSFT'] }),
    ).resolves.toEqual([]);
  });
});
