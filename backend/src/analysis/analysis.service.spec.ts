import { AnalysisService } from './analysis.service';
import { SignalEngineService } from './signal-engine.service';
import { StrategyEngineService } from './strategy-engine.service';
import { AnalysisProfile } from './types/analysis-profile';
import { Recommendation } from './types/analysis-result';
import {
  MarketTrend,
  TrendMomentum,
  TrendStrength,
} from './types/trend-analysis';
import { SignalCategory, SignalDirection } from './types/signal';

describe('AnalysisService profile scoring', () => {
  const marketService = {
    getQuote: jest.fn(),
  };
  const companyService = {
    getCompanyProfile: jest.fn(),
  };
  const trendAnalysisService = {
    analyzeTrend: jest.fn(),
  };
  const signalEngineService = {
    generateSignals: jest.fn(),
  };
  const strategyEngineService = new StrategyEngineService();

  let analysisService: AnalysisService;

  beforeEach(() => {
    jest.clearAllMocks();
    analysisService = new AnalysisService(
      marketService as never,
      companyService as never,
      trendAnalysisService as never,
      signalEngineService as never,
      strategyEngineService,
    );

    marketService.getQuote.mockResolvedValue({
      symbol: 'AAPL',
      price: 200,
      currency: 'USD',
      timestamp: new Date().toISOString(),
      source: 'test',
    });
    companyService.getCompanyProfile.mockResolvedValue({
      symbol: 'AAPL',
      name: 'Apple Inc',
      exchange: 'NASDAQ',
      currency: 'USD',
      country: 'US',
      marketCapitalization: 3_000_000_000_000,
      industry: 'Technology',
      ipoDate: '1980-12-12',
      logoUrl: null,
      website: null,
      source: 'test',
    });
    trendAnalysisService.analyzeTrend.mockResolvedValue({
      trend: MarketTrend.BULLISH,
      strength: TrendStrength.HIGH,
      momentum: TrendMomentum.INCREASING,
      priceChange30Days: 8,
      volatility: 0.02,
      summary: 'bullish',
    });
    signalEngineService.generateSignals.mockReturnValue([
      {
        id: 'bullish-trend',
        title: 'Bullish Trend',
        description: 'trend',
        category: SignalCategory.TREND,
        weight: 15,
        direction: SignalDirection.POSITIVE,
      },
      {
        id: 'increasing-momentum',
        title: 'Increasing Momentum',
        description: 'momentum',
        category: SignalCategory.MOMENTUM,
        weight: 8,
        direction: SignalDirection.POSITIVE,
      },
      {
        id: 'high-volatility',
        title: 'High Volatility',
        description: 'vol',
        category: SignalCategory.VOLATILITY,
        weight: -6,
        direction: SignalDirection.NEGATIVE,
      },
    ]);
  });

  it('applies SHORT_TERM multipliers so score differs from LONG_TERM baseline', async () => {
    const shortTerm = await analysisService.analyze(
      'AAPL',
      AnalysisProfile.SHORT_TERM,
    );
    const longTerm = await analysisService.analyze(
      'AAPL',
      AnalysisProfile.LONG_TERM,
    );

    // Baseline: 50 + 15 + 8 - 6 = 67
    expect(longTerm.score).toBe(67);
    // SHORT_TERM: 50 + 15*1.4 + 8*1.5 + (-6)*1.5 = 50 + 21 + 12 - 9 = 74
    expect(shortTerm.score).toBe(74);
    expect(shortTerm.profile).toBe(AnalysisProfile.SHORT_TERM);
    expect(longTerm.profile).toBe(AnalysisProfile.LONG_TERM);
    expect(shortTerm.recommendation).toBe(Recommendation.WATCH);
    expect(longTerm.recommendation).toBe(Recommendation.WATCH);
    expect(shortTerm.holdingWindow).toEqual({ minDays: 3, maxDays: 10 });
    expect(longTerm.holdingWindow).toEqual({ minDays: 90, maxDays: 180 });
    expect(signalEngineService.generateSignals).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      AnalysisProfile.SHORT_TERM,
    );
  });
});

describe('SignalEngineService long-term extension point', () => {
  it('generates the same current market signals for LONG_TERM without inventing fundamentals', () => {
    const engine = new SignalEngineService();
    const trend = {
      trend: MarketTrend.BULLISH,
      strength: TrendStrength.MEDIUM,
      momentum: TrendMomentum.INCREASING,
      priceChange30Days: 5,
      volatility: 0.01,
      summary: 'ok',
    };
    const company = {
      symbol: 'AAPL',
      name: 'Apple Inc',
      exchange: 'NASDAQ',
      currency: 'USD',
      country: 'US',
      marketCapitalization: 3_000_000_000_000,
      industry: 'Technology',
      ipoDate: '',
      logoUrl: null,
      website: null,
      source: 'test',
    };

    const shortSignals = engine.generateSignals(
      trend,
      company,
      AnalysisProfile.SHORT_TERM,
    );
    const longSignals = engine.generateSignals(
      trend,
      company,
      AnalysisProfile.LONG_TERM,
    );

    expect(longSignals.map((signal) => signal.id)).toEqual(
      shortSignals.map((signal) => signal.id),
    );
    expect(longSignals.some((signal) => signal.category === 'NEWS')).toBe(
      false,
    );
  });
});
