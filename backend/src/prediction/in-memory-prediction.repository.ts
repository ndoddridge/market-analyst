import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PredictionRepository } from './prediction.repository';
import type { CreatePredictionInput, PredictionRecord } from './types/prediction';
import {
  EvaluationStatus,
  type PredictionOutcome,
} from './types/prediction-outcome';

function freezePrediction(record: PredictionRecord): PredictionRecord {
  return Object.freeze({
    ...record,
    catalyst: record.catalyst ? Object.freeze({ ...record.catalyst }) : null,
    evaluationWindow: Object.freeze({ ...record.evaluationWindow }),
    outcome: record.outcome ? Object.freeze({ ...record.outcome }) : null,
  });
}

@Injectable()
export class InMemoryPredictionRepository extends PredictionRepository {
  private readonly byId = new Map<string, PredictionRecord>();
  private readonly byDedupeKey = new Map<string, string>();

  async create(input: CreatePredictionInput): Promise<PredictionRecord> {
    const existingId = this.byDedupeKey.get(input.dedupeKey);
    if (existingId) {
      const existing = this.byId.get(existingId);
      if (existing) {
        return existing;
      }
    }

    const { dedupeKey, ...snapshot } = input;
    const record = freezePrediction({
      ...snapshot,
      id: `pred_${randomUUID().replace(/-/g, '')}`,
      outcome: null,
    });

    this.byId.set(record.id, record);
    this.byDedupeKey.set(dedupeKey, record.id);
    return record;
  }

  async findById(id: string): Promise<PredictionRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async findByDedupeKey(dedupeKey: string): Promise<PredictionRecord | null> {
    const id = this.byDedupeKey.get(dedupeKey);
    if (!id) {
      return null;
    }
    return this.byId.get(id) ?? null;
  }

  async listRecent(limit: number): Promise<PredictionRecord[]> {
    return [...this.byId.values()]
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
      .slice(0, Math.max(0, limit));
  }

  async listByTicker(
    ticker: string,
    limit: number,
  ): Promise<PredictionRecord[]> {
    const upper = ticker.toUpperCase();
    return [...this.byId.values()]
      .filter((record) => record.ticker.toUpperCase() === upper)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
      .slice(0, Math.max(0, limit));
  }

  async attachOutcome(
    predictionId: string,
    outcome: PredictionOutcome,
  ): Promise<PredictionRecord | null> {
    const existing = this.byId.get(predictionId);
    if (!existing) {
      return null;
    }

    // Never mutate a completed EVALUATED outcome (immutability guarantee).
    if (existing.outcome?.status === EvaluationStatus.EVALUATED) {
      return existing;
    }

    // Preserve original snapshot fields exactly; only swap the outcome pointer.
    const updated = freezePrediction({
      id: existing.id,
      generatedAt: existing.generatedAt,
      profile: existing.profile,
      ticker: existing.ticker,
      recommendation: existing.recommendation,
      signalScore: existing.signalScore,
      catalystScore: existing.catalystScore,
      setupQuality: existing.setupQuality,
      catalyst: existing.catalyst
        ? { ...existing.catalyst }
        : null,
      entryPrice: existing.entryPrice,
      entryCurrency: existing.entryCurrency,
      evaluationWindow: { ...existing.evaluationWindow },
      reason: existing.reason,
      outcome: { ...outcome },
    });

    this.byId.set(predictionId, updated);
    return updated;
  }

  /** Test helper — clears all records. */
  clear(): void {
    this.byId.clear();
    this.byDedupeKey.clear();
  }
}
