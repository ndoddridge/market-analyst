import { SignalCategory } from './signal';

/**
 * User-selectable analysis horizons.
 * Profiles affect signal weighting and holding-window resolution in the pipeline.
 */
export enum AnalysisProfile {
  SHORT_TERM = 'SHORT_TERM',
  LONG_TERM = 'LONG_TERM',
}

export const DEFAULT_ANALYSIS_PROFILE = AnalysisProfile.SHORT_TERM;

/**
 * Category weight multipliers applied during scoring.
 * Values scale existing signal weights — they do not invent new market signals.
 */
export type ProfileScorePolicy = {
  /** Human-readable horizon for strategy text. */
  holdingHorizon: string;
  categoryMultipliers: Partial<Record<SignalCategory, number>>;
};

/**
 * SHORT_TERM emphasizes recent market dynamics (trend / momentum / volatility).
 * LONG_TERM keeps baseline weights today and is the extension point for future
 * long-horizon signals (fundamentals are intentionally not invented here).
 */
export const PROFILE_SCORE_POLICIES: Record<
  AnalysisProfile,
  ProfileScorePolicy
> = {
  [AnalysisProfile.SHORT_TERM]: {
    holdingHorizon: 'days to a few weeks',
    categoryMultipliers: {
      [SignalCategory.TREND]: 1.4,
      [SignalCategory.MOMENTUM]: 1.5,
      [SignalCategory.VOLATILITY]: 1.5,
    },
  },
  [AnalysisProfile.LONG_TERM]: {
    holdingHorizon: 'months to years',
    // Baseline (1.0) — long-term-specific signals can be added later.
    categoryMultipliers: {
      [SignalCategory.TREND]: 1,
      [SignalCategory.MOMENTUM]: 1,
      [SignalCategory.VOLATILITY]: 1,
    },
  },
};
