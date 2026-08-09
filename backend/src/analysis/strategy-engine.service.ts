import { Injectable } from '@nestjs/common';
import { PROFILE_SCORE_POLICIES } from './types/analysis-profile';
import { Recommendation, type AnalysisResult } from './types/analysis-result';
import type { Strategy } from './types/strategy';

@Injectable()
export class StrategyEngineService {
  /**
   * Converts an existing AnalysisResult into an actionable plan.
   * Does not perform market analysis — recommendation is already decided upstream.
   */
  buildStrategy(result: AnalysisResult): Strategy {
    // TODO: Dynamic holding windows based on trend strength / volatility.
    // TODO: ATR-based exit targets and stop distances.
    // TODO: Risk-adjusted position sizing (volatility / confidence scaled).
    // TODO: Portfolio-aware sizing across existing holdings.
    // TODO: Explicit stop-loss recommendations.

    const holdingPeriod = this.formatHoldingPeriod(result);

    switch (result.recommendation) {
      case Recommendation.BUY:
        return {
          recommendedAction: 'Open a position.',
          entryStrategy:
            'Enter on the next session open or on a shallow pullback while the bullish thesis holds.',
          entryWindow: 'Within 1-2 trading days if conditions remain favorable.',
          positionSizing: '75% of planned allocation.',
          holdingPeriod,
          exitStrategy:
            'Take profits after 8-12% gain or weakening momentum.',
          riskSummary: this.buildRiskSummary(result, 'elevated'),
        };
      case Recommendation.WATCH:
        return {
          recommendedAction: 'Wait.',
          entryStrategy:
            'Do not open a full position yet; wait for confirmation of the current setup.',
          entryWindow: 'After breakout or trend confirmation.',
          positionSizing: '25% of planned allocation (probe only).',
          holdingPeriod,
          exitStrategy: 'Re-evaluate after breakout confirmation.',
          riskSummary: this.buildRiskSummary(result, 'conditional'),
        };
      case Recommendation.HOLD:
        return {
          recommendedAction: 'Maintain current position.',
          entryStrategy: 'No new entry; keep the existing exposure unchanged.',
          entryWindow: 'Not applicable.',
          positionSizing: 'No additional allocation.',
          holdingPeriod,
          exitStrategy:
            'Hold unless thesis invalidation appears; then re-run analysis.',
          riskSummary: this.buildRiskSummary(result, 'steady'),
        };
      case Recommendation.SELL:
        return {
          recommendedAction: 'Reduce or exit position.',
          entryStrategy: 'No new long entry.',
          entryWindow: 'Not applicable.',
          positionSizing: '0% of planned allocation.',
          holdingPeriod,
          exitStrategy: 'Immediately or into strength.',
          riskSummary: this.buildRiskSummary(result, 'defensive'),
        };
    }
  }

  private formatHoldingPeriod(result: AnalysisResult): string {
    const { minDays, maxDays } = result.holdingWindow;
    const horizon = PROFILE_SCORE_POLICIES[result.profile].holdingHorizon;

    if (minDays === 0 && maxDays === 0) {
      return `0 trading days for new exposure (${result.profile}, ${horizon}).`;
    }

    return `${minDays}-${maxDays} days (${result.profile}, ${horizon}).`;
  }

  private buildRiskSummary(
    result: AnalysisResult,
    posture: 'elevated' | 'conditional' | 'steady' | 'defensive',
  ): string {
    const volatilityNote =
      result.trendAnalysis.volatility > 0.015
        ? 'Volatility is elevated; prefer smaller risk per trade.'
        : 'Volatility is moderate; size within normal risk limits.';

    switch (posture) {
      case 'elevated':
        return `Constructive setup with ${posture} commitment. ${volatilityNote}`;
      case 'conditional':
        return `Setup is incomplete; keep risk light until confirmation. ${volatilityNote}`;
      case 'steady':
        return `Neutral posture — maintain exposure without adding risk. ${volatilityNote}`;
      case 'defensive':
        return `Defensive posture — prioritize capital preservation. ${volatilityNote}`;
    }
  }
}
