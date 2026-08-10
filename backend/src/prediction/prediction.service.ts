import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { MarketService } from '../market/market.service';
import type { MarketTodayResult } from '../market/types/market-today';
import { getMarketCalendarDate } from '../shared/market-clock';
import {
  buildPredictionDedupeKey,
  evaluatePrediction,
  isWithinEvaluationWindow,
} from './prediction-evaluation';
import { PredictionRepository } from './prediction.repository';
import type { PredictionRecord } from './types/prediction';

export type RecordTodayPredictionOptions = {
  evaluationWindow?: { minDays: number; maxDays: number };
};

@Injectable()
export class PredictionService {
  constructor(
    private readonly repository: PredictionRepository,
    private readonly marketService: MarketService,
  ) {}

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
      if (quote?.price != null && Number.isFinite(quote.price) && quote.price > 0) {
        entryPrice = quote.price;
        entryCurrency = quote.currency ?? null;
      }
    } catch {
      // Price is optional at record time; evaluation can still mark insufficient data.
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
    return this.repository.listRecent(Math.min(Math.max(limit, 1), 100));
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
   * Evaluate a stored prediction against the current market price.
   * Attaches outcome without rewriting the original prediction snapshot.
   */
  async evaluate(id: string, at: Date = new Date()): Promise<PredictionRecord> {
    const prediction = await this.getById(id);

    let evaluationPrice: number | null = null;
    try {
      const quote = await this.marketService.getQuote(prediction.ticker);
      if (quote?.price != null && Number.isFinite(quote.price)) {
        evaluationPrice = quote.price;
      }
    } catch {
      evaluationPrice = null;
    }

    const outcome = evaluatePrediction({
      prediction,
      evaluationPrice,
      evaluatedAt: at,
    });

    const updated = await this.repository.attachOutcome(prediction.id, outcome);
    if (!updated) {
      throw new NotFoundException(`Prediction "${id}" was not found.`);
    }
    return updated;
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
      outcomeStatus: string;
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
        outcomeStatus: prediction.outcome?.outcomeClassification ?? 'PENDING',
        outcome: prediction.outcome,
      })),
    };
  }
}
