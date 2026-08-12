import { AnalysisProfile } from '../../analysis/types/analysis-profile';
import type { PortfolioPositionInput } from './portfolio';

export type PersistedPortfolio = {
  positions: PortfolioPositionInput[];
  /** null means "never uploaded" — distinct from an upload that resulted in zero rows. */
  uploadedAt: string | null;
  sourceFilename: string | null;
  updatedAt: string;
};

export type PortfolioSettings = {
  horizonProfile: AnalysisProfile;
};
