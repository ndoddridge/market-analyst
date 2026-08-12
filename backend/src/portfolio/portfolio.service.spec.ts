import { BadRequestException } from '@nestjs/common';
import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { PortfolioService } from './portfolio.service';

describe('PortfolioService', () => {
  let portfolioRepository: {
    getPortfolio: jest.Mock;
    replacePortfolio: jest.Mock;
    upsertPosition: jest.Mock;
    removePosition: jest.Mock;
    clearPortfolio: jest.Mock;
    getSettings: jest.Mock;
    updateSettings: jest.Mock;
  };
  let dashboardService: { refresh: jest.Mock };

  beforeEach(() => {
    portfolioRepository = {
      getPortfolio: jest.fn(),
      replacePortfolio: jest.fn(),
      upsertPosition: jest.fn(),
      removePosition: jest.fn(),
      clearPortfolio: jest.fn(),
      getSettings: jest
        .fn()
        .mockResolvedValue({ horizonProfile: AnalysisProfile.SHORT_TERM }),
      updateSettings: jest.fn(),
    };
    dashboardService = { refresh: jest.fn().mockResolvedValue(undefined) };
  });

  function makeService(withDashboard = true) {
    return new PortfolioService(
      portfolioRepository,
      withDashboard ? (dashboardService as never) : undefined,
    );
  }

  describe('importCsv', () => {
    it('rejects with BadRequestException and never touches the repository when zero valid rows exist', async () => {
      const service = makeService();
      await expect(
        service.importCsv('not,a,valid,header\n1,2,3,4'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(portfolioRepository.replacePortfolio).not.toHaveBeenCalled();
    });

    it('replaces the portfolio and returns positions/errors/uploadedAt on success', async () => {
      const service = makeService();
      portfolioRepository.replacePortfolio.mockResolvedValue({
        positions: [
          { ticker: 'AAPL', shares: 10, avgCost: 285, currentPrice: 313.33 },
        ],
        uploadedAt: '2026-08-01T00:00:00.000Z',
        sourceFilename: 'chase.csv',
        updatedAt: '2026-08-01T00:00:00.000Z',
      });

      const csv = 'ticker,shares,avgCost,currentPrice\nAAPL,10,285,313.33';
      const result = await service.importCsv(csv, 'chase.csv');

      expect(portfolioRepository.replacePortfolio).toHaveBeenCalledWith(
        [{ ticker: 'AAPL', shares: 10, avgCost: 285, currentPrice: 313.33 }],
        { sourceFilename: 'chase.csv' },
      );
      expect(result.uploadedAt).toBe('2026-08-01T00:00:00.000Z');
      expect(result.errors).toEqual([]);
    });

    it('triggers a best-effort dashboard refresh after a successful import', async () => {
      const service = makeService();
      portfolioRepository.replacePortfolio.mockResolvedValue({
        positions: [],
        uploadedAt: '2026-08-01T00:00:00.000Z',
        sourceFilename: null,
        updatedAt: '2026-08-01T00:00:00.000Z',
      });
      const csv = 'ticker,shares,avgCost,currentPrice\nAAPL,10,285,313.33';

      await service.importCsv(csv);

      expect(dashboardService.refresh).toHaveBeenCalledWith(
        AnalysisProfile.SHORT_TERM,
      );
    });

    it('does not throw when the dashboard refresh itself fails', async () => {
      const service = makeService();
      portfolioRepository.replacePortfolio.mockResolvedValue({
        positions: [],
        uploadedAt: '2026-08-01T00:00:00.000Z',
        sourceFilename: null,
        updatedAt: '2026-08-01T00:00:00.000Z',
      });
      dashboardService.refresh.mockRejectedValue(new Error('provider down'));
      const csv = 'ticker,shares,avgCost,currentPrice\nAAPL,10,285,313.33';

      await expect(service.importCsv(csv)).resolves.toBeDefined();
    });

    it('works with no DashboardService injected at all', async () => {
      const service = makeService(false);
      portfolioRepository.replacePortfolio.mockResolvedValue({
        positions: [],
        uploadedAt: '2026-08-01T00:00:00.000Z',
        sourceFilename: null,
        updatedAt: '2026-08-01T00:00:00.000Z',
      });
      const csv = 'ticker,shares,avgCost,currentPrice\nAAPL,10,285,313.33';

      await expect(service.importCsv(csv)).resolves.toBeDefined();
    });
  });

  describe('upsertPosition', () => {
    it('rejects invalid manual input without touching the repository', async () => {
      const service = makeService();
      await expect(
        service.upsertPosition({
          ticker: 'AAPL',
          shares: '',
          avgCost: 100,
          currentPrice: 100,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(portfolioRepository.upsertPosition).not.toHaveBeenCalled();
    });

    it('delegates a valid position to the repository', async () => {
      const service = makeService();
      portfolioRepository.upsertPosition.mockResolvedValue({
        positions: [],
        uploadedAt: '2026-08-01T00:00:00.000Z',
        sourceFilename: null,
        updatedAt: '2026-08-01T00:00:00.000Z',
      });

      await service.upsertPosition({
        ticker: 'msft',
        shares: 3,
        avgCost: 400,
        currentPrice: 410.5,
      });

      expect(portfolioRepository.upsertPosition).toHaveBeenCalledWith({
        ticker: 'MSFT',
        shares: 3,
        avgCost: 400,
        currentPrice: 410.5,
      });
    });
  });

  describe('removePosition / clearPortfolio', () => {
    it('delegates removePosition to the repository', async () => {
      const service = makeService();
      portfolioRepository.removePosition.mockResolvedValue({
        positions: [],
        uploadedAt: null,
        sourceFilename: null,
        updatedAt: '2026-08-01T00:00:00.000Z',
      });
      await service.removePosition('AAPL');
      expect(portfolioRepository.removePosition).toHaveBeenCalledWith('AAPL');
    });

    it('delegates clearPortfolio to the repository', async () => {
      const service = makeService();
      portfolioRepository.clearPortfolio.mockResolvedValue({
        positions: [],
        uploadedAt: null,
        sourceFilename: null,
        updatedAt: '2026-08-01T00:00:00.000Z',
      });
      await service.clearPortfolio();
      expect(portfolioRepository.clearPortfolio).toHaveBeenCalled();
    });
  });
});
