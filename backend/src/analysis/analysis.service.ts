import { Injectable } from '@nestjs/common';
import { CompanyService } from '../company/company.service';
import { MarketService } from '../market/market.service';
import { SignalEngineService } from './signal-engine.service';
import { StrategyEngineService } from './strategy-engine.service';
import { TrendAnalysisService } from './trend-analysis.service';
import {
  AnalysisProfile,
  DEFAULT_ANALYSIS_PROFILE,
  PROFILE_SCORE_POLICIES,
} from './types/analysis-profile';
import {
  Recommendation,
  type AnalysisResult,
  type HoldingWindow,
} from './types/analysis-result';
import {
  RiskLevel,
  type AnalysisSummary,
} from './types/analysis-summary';
import {
  SignalDirection,
  type Signal,
} from './types/signal';

@Injectable()
export class AnalysisService {
  constructor(
    private readonly marketService: MarketService,
    private readonly companyService: CompanyService,
    private readonly trendAnalysisService: TrendAnalysisService,
    private readonly signalEngineService: SignalEngineService,
    private readonly strategyEngineService: StrategyEngineService,
  ) {}

  async analyze(
    symbol: string,
    profile: AnalysisProfile = DEFAULT_ANALYSIS_PROFILE,
  ): Promise<AnalysisResult> {
    const [marketData, company, trendAnalysis] = await Promise.all([
      this.marketService.getQuote(symbol),
      this.companyService.getCompanyProfile(symbol),
      this.trendAnalysisService.analyzeTrend(symbol),
    ]);

    const signals = this.signalEngineService.generateSignals(
      trendAnalysis,
      company,
      profile,
    );
    const score = this.scoreFromSignals(signals, profile);
    const recommendation = this.resolveRecommendation(score);
    const holdingWindow = this.resolveHoldingWindow(recommendation, profile);
    const summary = this.buildSummary(company.name, signals, profile);

    return {
      symbol: marketData.symbol,
      profile,
      score,
      confidence: 0.6,
      recommendation,
      holdingWindow,
      signals,
      summary,
      marketData,
      company,
      trendAnalysis,
    };
  }

  async analyzeSummary(
    symbol: string,
    profile: AnalysisProfile = DEFAULT_ANALYSIS_PROFILE,
  ): Promise<AnalysisSummary> {
    return this.toSummary(await this.analyze(symbol, profile));
  }

  private scoreFromSignals(
    signals: Signal[],
    profile: AnalysisProfile,
  ): number {
    // Recommendation engine scores market signals only — not company facts.
    const policy = PROFILE_SCORE_POLICIES[profile];
    let score = 50;

    for (const signal of signals) {
      if (
        signal.direction !== SignalDirection.POSITIVE &&
        signal.direction !== SignalDirection.NEGATIVE
      ) {
        continue;
      }

      const multiplier = policy.categoryMultipliers[signal.category] ?? 1;
      score += signal.weight * multiplier;
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  private toSummary(result: AnalysisResult): AnalysisSummary {
    return {
      ticker: result.symbol,
      companyName: result.company.name,
      profile: result.profile,
      recommendation: result.recommendation,
      score: result.score,
      confidence: result.confidence,
      suggestedHoldingWindow: result.holdingWindow,
      riskLevel: this.resolveRiskLevel(result),
      summary: this.buildSummaryBullets(result),
      strategy: this.strategyEngineService.buildStrategy(result),
      detailsAvailable: true,
    };
  }

  private resolveRiskLevel(result: AnalysisResult): RiskLevel {
    // Presentation-only mapping from existing trend volatility — does not alter scoring.
    const { volatility } = result.trendAnalysis;

    if (volatility > 0.015) {
      return RiskLevel.HIGH;
    }
    if (volatility > 0.008) {
      return RiskLevel.MEDIUM;
    }
    return RiskLevel.LOW;
  }

  private buildSummaryBullets(result: AnalysisResult): string[] {
    const bullets: string[] = [result.summary];

    bullets.push(
      `Trend: ${result.trendAnalysis.trend} with ${result.trendAnalysis.strength} strength.`,
    );

    for (const signal of result.signals) {
      bullets.push(signal.title);
    }

    return bullets;
  }

  private resolveRecommendation(score: number): Recommendation {
    // TODO: Recommendation thresholds will later incorporate additional
    // signal categories (news, earnings, technicals, macro) — not only
    // the current trend/momentum/volatility set.
    if (score >= 80) {
      return Recommendation.BUY;
    }
    if (score >= 60) {
      return Recommendation.WATCH;
    }
    if (score >= 40) {
      return Recommendation.HOLD;
    }
    return Recommendation.SELL;
  }

  private resolveHoldingWindow(
    recommendation: Recommendation,
    profile: AnalysisProfile,
  ): HoldingWindow {
    if (profile === AnalysisProfile.LONG_TERM) {
      switch (recommendation) {
        case Recommendation.BUY:
          return { minDays: 180, maxDays: 730 };
        case Recommendation.WATCH:
          return { minDays: 90, maxDays: 180 };
        case Recommendation.HOLD:
          return { minDays: 90, maxDays: 365 };
        case Recommendation.SELL:
          return { minDays: 0, maxDays: 0 };
      }
    }

    // SHORT_TERM — days to a few weeks.
    switch (recommendation) {
      case Recommendation.BUY:
        return { minDays: 5, maxDays: 15 };
      case Recommendation.WATCH:
        return { minDays: 3, maxDays: 10 };
      case Recommendation.HOLD:
        return { minDays: 1, maxDays: 5 };
      case Recommendation.SELL:
        return { minDays: 0, maxDays: 0 };
    }
  }

  private buildSummary(
    companyName: string,
    signals: Signal[],
    profile: AnalysisProfile,
  ): string {
    const traits: string[] = [];

    if (signals.some((signal) => signal.id === 'large-market-cap')) {
      traits.push('a large-cap');
    }
    if (signals.some((signal) => signal.id === 'us-company')) {
      traits.push('U.S.');
    }

    const traitText =
      traits.length > 0 ? `${traits.join(' ')} company` : 'a tracked company';

    const scoredSignals = signals.filter(
      (signal) => signal.direction !== SignalDirection.NEUTRAL,
    );
    const horizon = PROFILE_SCORE_POLICIES[profile].holdingHorizon;

    return (
      `${companyName} is currently ${traitText}. ` +
      `${profile} analysis (${horizon}) is based on ${scoredSignals.length} scored market signal(s); ` +
      `company facts are informational only.`
    );
  }
}
