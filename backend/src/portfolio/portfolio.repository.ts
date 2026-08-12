import type { PortfolioPositionInput } from './types/portfolio';
import type {
  PersistedPortfolio,
  PortfolioSettings,
} from './types/portfolio-store';

/**
 * Persistence port for the single-user portfolio + dashboard settings.
 * File-backed today; swap for a DB-backed implementation later without
 * touching callers.
 */
export abstract class PortfolioRepository {
  abstract getPortfolio(): Promise<PersistedPortfolio>;

  /** Full replace — discards all previously stored positions. */
  abstract replacePortfolio(
    positions: PortfolioPositionInput[],
    meta: { sourceFilename?: string | null },
  ): Promise<PersistedPortfolio>;

  /** Merge-by-ticker upsert (manual add/edit), does not affect other positions. */
  abstract upsertPosition(
    position: PortfolioPositionInput,
  ): Promise<PersistedPortfolio>;

  abstract removePosition(ticker: string): Promise<PersistedPortfolio>;

  /** Resets the portfolio back to "never uploaded" (all positions cleared). */
  abstract clearPortfolio(): Promise<PersistedPortfolio>;

  abstract getSettings(): Promise<PortfolioSettings>;

  abstract updateSettings(
    patch: Partial<PortfolioSettings>,
  ): Promise<PortfolioSettings>;
}
