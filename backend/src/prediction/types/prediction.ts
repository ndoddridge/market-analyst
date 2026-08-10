import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AnalysisProfile } from '../../analysis/types/analysis-profile';
import {
  CatalystType,
  SetupQuality,
  TodayAction,
} from '../../market/types/market-today';
import { PredictionOutcome } from './prediction-outcome';

export class PredictionCatalystSnapshot {
  @ApiProperty({ enum: CatalystType })
  type: CatalystType;

  @ApiProperty()
  headline: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  ticker: string | null;

  @ApiProperty()
  date: string;

  @ApiProperty()
  source: string;
}

export class EvaluationWindow {
  @ApiProperty({ example: 1 })
  minDays: number;

  @ApiProperty({ example: 5 })
  maxDays: number;
}

/**
 * Immutable SHORT_TERM prediction snapshot.
 * Fields are fixed at record time and must never be rewritten after outcomes attach.
 */
export class PredictionRecord {
  @ApiProperty({ example: 'pred_01HZX...' })
  id: string;

  @ApiProperty({
    description: 'Market-timezone timestamp when the prediction was generated.',
    example: '2026-08-09T20:30:00.000-04:00',
  })
  generatedAt: string;

  @ApiProperty({ enum: AnalysisProfile, example: AnalysisProfile.SHORT_TERM })
  profile: AnalysisProfile;

  @ApiProperty({ example: 'AAPL' })
  ticker: string;

  @ApiProperty({ enum: TodayAction, example: TodayAction.WATCH })
  recommendation: TodayAction;

  @ApiProperty({ example: 74 })
  signalScore: number;

  @ApiProperty({ example: 62 })
  catalystScore: number;

  @ApiProperty({ enum: SetupQuality, example: SetupQuality.MODERATE })
  setupQuality: SetupQuality;

  @ApiPropertyOptional({
    type: PredictionCatalystSnapshot,
    nullable: true,
  })
  catalyst: PredictionCatalystSnapshot | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Entry/reference price at prediction time when available.',
    example: 214.55,
  })
  entryPrice: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'USD',
  })
  entryCurrency: string | null;

  @ApiProperty({ type: EvaluationWindow })
  evaluationWindow: EvaluationWindow;

  @ApiProperty()
  reason: string;

  @ApiPropertyOptional({
    type: PredictionOutcome,
    nullable: true,
    description: 'Attached later; never mutates the original prediction fields.',
  })
  outcome: PredictionOutcome | null;
}

export type CreatePredictionInput = Omit<PredictionRecord, 'id' | 'outcome'> & {
  /** Stable key used to prevent accidental same-day duplicates. */
  dedupeKey: string;
};
