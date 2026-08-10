import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { MarketService } from '../market/market.service';
import type { MarketTodayResult } from '../market/types/market-today';
import { getMarketCalendarDate } from '../shared/market-clock';
import {
  buildPredictionDedupeKey,
  evaluatePrediction,
  isWithinEvaluationWindow,
  resolveEvaluationStatus,
} from './prediction-evaluation';
import { seedHistoricalPredictionFixtures } from './prediction-fixtures';
import { PredictionRepository } from './prediction.repository';
import { buildPredictionScorecard } from './prediction-scorecard';
import type { EvaluatePredictionDto } from './types/evaluate-prediction.dto';
import type { PredictionRecord } from './types/prediction';
import { EvaluationStatus } from './types/prediction-outcome';
import type { PredictionHistoryScorecard } from './types/prediction-scorecard';

export type RecordTodayPredictionOptions = {
  evaluationWindow?: { minDays: number; maxDays: number };
};

@Injectable()
export class PredictionService implements OnModuleInit {
  constructor(
    private readonly repository: PredictionRepository,
    private readonly marketService: MarketService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Seed deterministic historical fixtures so /predictions/history works immediately.
    await seedHistoricalPredictionFixtures(this.repository);
  }

  /**
   * Persist the SHORT_TERM top-opportunity decision. No-op for LONG_TERM.
   * Duplicate same-day fingerprints return the existing immutable record.
   */
  async recordFromToday(
    result: MarketTodayResult,
    options: RecordTodayPredictionOptions = {},
  ): Promise<PredictionRecord | null> {
    if (result.profile !== AnalysisProfile.SHORT_TERM || !result.decision) {
      return null;
    }

    const opportunity = result.topOpportunity;
    const decision = result.decision;
    const evaluationWindow = options.evaluationWindow ?? {
      minDays: 1,
      maxDays: 5,
    };

    let entryPrice: number | null = null;
    let entryCurrency: string | null = null;
    try {
      const quote = await this.marketService.getQuote(opportunity.ticker);
      if (
        quote?.price != null &&
        Number.isFinite(quote.price) &&
        quote.price > 0
      ) {
        entryPrice = quote.price;
        entryCurrency = quote.currency ?? null;
      }
    } catch {
      // Price is optional at record time; evaluation can still mark unavailable.
    }

    const dedupeKey = buildPredictionDedupeKey({
      profile: result.profile,
      ticker: opportunity.ticker,
      generatedAt: result.generatedAt,
      recommendation: opportunity.recommendation,
      signalScore: decision.signalScore,
      catalystScore: decision.catalystScore,
    });

    const existing = await this.repository.findByDedupeKey(dedupeKey);
    if (existing) {
      return existing;
    }

    return this.repository.create({
      dedupeKey,
      generatedAt: result.generatedAt,
      profile: result.profile,
      ticker: opportunity.ticker,
      recommendation: opportunity.recommendation,
      signalScore: decision.signalScore,
      catalystScore: decision.catalystScore,
      setupQuality: decision.setupQuality,
      catalyst: result.catalyst
        ? {
            type: result.catalyst.type,
            headline: result.catalyst.headline,
            ticker: result.catalyst.ticker,
            date: result.catalyst.date,
            source: result.catalyst.source,
          }
        : null,
      entryPrice,
      entryCurrency,
      evaluationWindow,
      reason: decision.reason || result.reason,
    });
  }

  async getById(id: string): Promise<PredictionRecord> {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new NotFoundException(`Prediction "${id}" was not found.`);
    }
    return record;
  }

  async listRecent(limit = 20): Promise<PredictionRecord[]> {
    return this.repository.listRecent(Math.min(Math.max(limit, 1), 200));
  }

  async listByTicker(
    ticker: string,
    limit = 20,
  ): Promise<PredictionRecord[]> {
    const symbol = ticker?.trim();
    if (!symbol) {
      throw new BadRequestException('Ticker symbol is required.');
    }
    return this.repository.listByTicker(
      symbol.toUpperCase(),
      Math.min(Math.max(limit, 1), 100),
    );
  }

  /**
   * Deterministic evaluation against a supplied price/date or live market quote.
   * Idempotent: already-evaluated predictions are returned unchanged.
   */
  async evaluate(
    id: string,
    dto: EvaluatePredictionDto = {},
  ): Promise<PredictionRecord> {
    const prediction = await this.getById(id);

    // Idempotent — never rewrite an existing outcome.
    if (prediction.outcome) {
      return prediction;
    }

    let evaluationPrice: number | null =
      dto.evaluationPrice != null && Number.isFinite(dto.evaluationPrice)
        ? dto.evaluationPrice
        : null;
    let evaluatedAt = dto.evaluatedAt ? new Date(dto.evaluatedAt) : new Date();

    if (dto.evaluatedAt && Number.isNaN(evaluatedAt.getTime())) {
      throw new BadRequestException(
        `Invalid evaluatedAt timestamp "${dto.evaluatedAt}".`,
      );
    }

    if (evaluationPrice == null) {
      try {
        const quote = await this.marketService.getQuote(prediction.ticker);
        if (quote?.price != null && Number.isFinite(quote.price)) {
          evaluationPrice = quote.price;
        }
      } catch {
        evaluationPrice = null;
      }
    }

    const outcome = evaluatePrediction({
      prediction,
      observation: {
        price: evaluationPrice,
        observedAt: evaluatedAt,
      },
    });

    const updated = await this.repository.attachOutcome(prediction.id, outcome);
    if (!updated) {
      throw new NotFoundException(`Prediction "${id}" was not found.`);
    }
    return updated;
  }

  async getHistoryScorecard(): Promise<PredictionHistoryScorecard> {
    // Ensure fixtures exist for a usable scorecard without waiting real days.
    await seedHistoricalPredictionFixtures(this.repository);
    const predictions = await this.repository.listRecent(500);
    return buildPredictionScorecard(predictions);
  }

  /**
   * Developer-facing summary of recent predictions and evaluation readiness.
   */
  async inspectRecent(limit = 20): Promise<{
    generatedOn: string;
    count: number;
    predictions: Array<{
      id: string;
      ticker: string;
      recommendation: string;
      setupQuality: string;
      generatedAt: string;
      entryPrice: number | null;
      evaluationWindow: { minDays: number; maxDays: number };
      withinWindow: boolean;
      outcomeStatus: EvaluationStatus;
      outcome: PredictionRecord['outcome'];
    }>;
  }> {
    const predictions = await this.listRecent(limit);
    const now = new Date();

    return {
      generatedOn: getMarketCalendarDate(now),
      count: predictions.length,
      predictions: predictions.map((prediction) => ({
        id: prediction.id,
        ticker: prediction.ticker,
        recommendation: prediction.recommendation,
        setupQuality: prediction.setupQuality,
        generatedAt: prediction.generatedAt,
        entryPrice: prediction.entryPrice,
        evaluationWindow: prediction.evaluationWindow,
        withinWindow: isWithinEvaluationWindow(prediction, now),
        outcomeStatus: resolveEvaluationStatus(prediction),
        outcome: prediction.outcome,
      })),
    };
  }
}
