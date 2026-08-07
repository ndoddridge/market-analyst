import { Injectable } from '@nestjs/common';
import type { CompanyProfile } from '../company/types/company-profile';
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
  ): Signal[] {
    const signals: Signal[] = [];

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

    // Company facts — informative context only; do not affect score.
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

    // TODO: Add news sentiment signals (SignalCategory.NEWS).
    // TODO: Add earnings-related signals.
    // TODO: Add ETF strength signals (SignalCategory.MARKET).
    // TODO: Add technical indicator signals (SignalCategory.TECHNICAL).
    // TODO: Add insider trading signals.
    // TODO: Add macroeconomic event signals.

    return signals;
  }
}
