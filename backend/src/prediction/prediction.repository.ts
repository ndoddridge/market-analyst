import type { CreatePredictionInput, PredictionRecord } from './types/prediction';
import type { PredictionOutcome } from './types/prediction-outcome';

/**
 * Persistence port for prediction snapshots.
 * In-memory today; swap for a DB-backed implementation later without touching evaluation.
 */
export abstract class PredictionRepository {
  abstract create(input: CreatePredictionInput): Promise<PredictionRecord>;

  abstract findById(id: string): Promise<PredictionRecord | null>;

  abstract findByDedupeKey(dedupeKey: string): Promise<PredictionRecord | null>;

  abstract listRecent(limit: number): Promise<PredictionRecord[]>;

  abstract listByTicker(ticker: string, limit: number): Promise<PredictionRecord[]>;

  /**
   * Attach or replace the outcome only. Must not mutate prediction snapshot fields.
   */
  abstract attachOutcome(
    predictionId: string,
    outcome: PredictionOutcome,
  ): Promise<PredictionRecord | null>;
}
