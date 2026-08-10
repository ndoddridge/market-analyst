import { Injectable } from '@nestjs/common';
import type { CompanyProfile } from '../company/types/company-profile';
import {
  AnalysisProfile,
  DEFAULT_ANALYSIS_PROFILE,
} from './types/analysis-profile';
import {
  MarketTrend,
  TrendMomentum,
  type TrendAnalysis,
} from './types/trend-analysis';
import {
  SignalCategory,
  SignalDirection,
  type Signal,
} from './types/signal';

@Injectable()
export class SignalEngineService {
  generateSignals(
    trendAnalysis: TrendAnalysis,
    company: CompanyProfile,
    profile: AnalysisProfile = DEFAULT_ANALYSIS_PROFILE,
  ): Signal[] {
    const signals: Signal[] = [];

    // Shared market signals (trend / momentum / volatility / recent movement).
    // Profile-specific scoring is applied later in AnalysisService.
    this.appendShortHorizonMarketSignals(signals, trendAnalysis);

    // Company facts — informative context only; do not affect score.
    this.appendCompanyFactSignals(signals, company);

    if (profile === AnalysisProfile.LONG_TERM) {
      this.appendLongTermSignals(signals, trendAnalysis, company);
    }

    // TODO: Add news sentiment signals (SignalCategory.NEWS).
    // TODO: Add earnings-related signals.
    // TODO: Add ETF strength signals (SignalCategory.MARKET).
    // TODO: Add technical indicator signals (SignalCategory.TECHNICAL).
    // TODO: Add insider trading signals.
    // TODO: Add macroeconomic event signals.

    return signals;
  }

  private appendShortHorizonMarketSignals(
    signals: Signal[],
    trendAnalysis: TrendAnalysis,
  ): void {
    if (trendAnalysis.trend === MarketTrend.BULLISH) {
      signals.push({
        id: 'bullish-trend',
        title: 'Bullish Trend',
        description:
          'The 20-day average closing price is above the 50-day average with meaningful recent movement.',
        category: SignalCategory.TREND,
        weight: 15,
        direction: SignalDirection.POSITIVE,
      });
    }

    if (trendAnalysis.trend === MarketTrend.BEARISH) {
      signals.push({
        id: 'bearish-trend',
        title: 'Bearish Trend',
        description:
          'The 20-day average closing price is below the 50-day average with meaningful recent movement.',
        category: SignalCategory.TREND,
        weight: -15,
        direction: SignalDirection.NEGATIVE,
      });
    }

    if (trendAnalysis.momentum === TrendMomentum.INCREASING) {
      signals.push({
        id: 'increasing-momentum',
        title: 'Increasing Momentum',
        description: '30-day price change indicates increasing upward momentum.',
        category: SignalCategory.MOMENTUM,
        weight: 8,
        direction: SignalDirection.POSITIVE,
      });
    }

    if (trendAnalysis.volatility > 0.015) {
      signals.push({
        id: 'high-volatility',
        title: 'High Volatility',
        description:
          'Daily-return volatility is elevated, which may increase short-term risk.',
        category: SignalCategory.VOLATILITY,
        weight: -6,
        direction: SignalDirection.NEGATIVE,
      });
    }
  }

  private appendCompanyFactSignals(
    signals: Signal[],
    company: CompanyProfile,
  ): void {
    if (company.marketCapitalization > 1_000_000_000_000) {
      signals.push({
        id: 'large-market-cap',
        title: 'Large Market Cap',
        description:
          'Market capitalization exceeds $1 trillion (company fact, not a scored signal).',
        category: SignalCategory.COMPANY,
        weight: 0,
        direction: SignalDirection.NEUTRAL,
      });
    }

    if (company.country === 'US') {
      signals.push({
        id: 'us-company',
        title: 'US Company',
        description:
          'Company country is US (company fact, not a scored signal).',
        category: SignalCategory.COMPANY,
        weight: 0,
        direction: SignalDirection.NEUTRAL,
      });
    }
  }

  /**
   * Extension point for LONG_TERM-only signals.
   * Intentionally empty for now — do not invent fundamental analysis yet.
   */
  private appendLongTermSignals(
    _signals: Signal[],
    _trendAnalysis: TrendAnalysis,
    _company: CompanyProfile,
  ): void {
    // TODO: Multi-year trend / drawdown context (still price-based).
    // TODO: Fundamental quality signals once real fundamental data exists.
    // TODO: Long-horizon regime / valuation signals when available.
  }
}
