import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { FilePortfolioRepository } from './file-portfolio.repository';

function makeConfigService(dir: string) {
  return { getPortfolioDataDir: () => dir } as never;
}

describe('FilePortfolioRepository', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'portfolio-store-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reports "never uploaded" when no store file exists yet', async () => {
    const repo = new FilePortfolioRepository(makeConfigService(dir));
    const portfolio = await repo.getPortfolio();
    expect(portfolio.uploadedAt).toBeNull();
    expect(portfolio.positions).toEqual([]);
  });

  it('treats a corrupt store file as "never uploaded" without throwing', async () => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      join(dir, 'portfolio-store.json'),
      '{not valid json',
      'utf8',
    );

    const repo = new FilePortfolioRepository(makeConfigService(dir));
    await expect(repo.getPortfolio()).resolves.toEqual(
      expect.objectContaining({ uploadedAt: null, positions: [] }),
    );
  });

  it('replacePortfolio fully replaces (not merges) prior positions', async () => {
    const repo = new FilePortfolioRepository(makeConfigService(dir));
    await repo.replacePortfolio(
      [{ ticker: 'AAPL', shares: 10, avgCost: 100, currentPrice: 110 }],
      { sourceFilename: 'first.csv' },
    );
    const second = await repo.replacePortfolio(
      [{ ticker: 'MSFT', shares: 5, avgCost: 200, currentPrice: 210 }],
      { sourceFilename: 'second.csv' },
    );

    expect(second.positions).toEqual([
      { ticker: 'MSFT', shares: 5, avgCost: 200, currentPrice: 210 },
    ]);
    expect(second.sourceFilename).toBe('second.csv');
    expect(second.uploadedAt).not.toBeNull();
  });

  it('persists across a simulated restart (new repository instance, same directory)', async () => {
    const first = new FilePortfolioRepository(makeConfigService(dir));
    await first.replacePortfolio(
      [{ ticker: 'NVDA', shares: 3, avgCost: 400, currentPrice: 420 }],
      { sourceFilename: 'chase.csv' },
    );
    await first.updateSettings({ horizonProfile: AnalysisProfile.LONG_TERM });

    const restarted = new FilePortfolioRepository(makeConfigService(dir));
    const portfolio = await restarted.getPortfolio();
    const settings = await restarted.getSettings();

    expect(portfolio.positions).toEqual([
      { ticker: 'NVDA', shares: 3, avgCost: 400, currentPrice: 420 },
    ]);
    expect(portfolio.sourceFilename).toBe('chase.csv');
    expect(settings.horizonProfile).toBe(AnalysisProfile.LONG_TERM);
  });

  it('upsertPosition merges by ticker without disturbing others', async () => {
    const repo = new FilePortfolioRepository(makeConfigService(dir));
    await repo.replacePortfolio(
      [{ ticker: 'AAPL', shares: 10, avgCost: 100, currentPrice: 110 }],
      {},
    );
    const updated = await repo.upsertPosition({
      ticker: 'AAPL',
      shares: 20,
      avgCost: 105,
      currentPrice: 111,
    });
    const withNew = await repo.upsertPosition({
      ticker: 'TSM',
      shares: 4,
      avgCost: 300,
      currentPrice: 310,
    });

    expect(updated.positions).toEqual([
      { ticker: 'AAPL', shares: 20, avgCost: 105, currentPrice: 111 },
    ]);
    expect(withNew.positions).toHaveLength(2);
  });

  it('removePosition removes only the given ticker', async () => {
    const repo = new FilePortfolioRepository(makeConfigService(dir));
    await repo.replacePortfolio(
      [
        { ticker: 'AAPL', shares: 10, avgCost: 100, currentPrice: 110 },
        { ticker: 'MSFT', shares: 5, avgCost: 200, currentPrice: 210 },
      ],
      {},
    );
    const result = await repo.removePosition('AAPL');
    expect(result.positions).toEqual([
      { ticker: 'MSFT', shares: 5, avgCost: 200, currentPrice: 210 },
    ]);
  });

  it('clearPortfolio resets back to "never uploaded"', async () => {
    const repo = new FilePortfolioRepository(makeConfigService(dir));
    await repo.replacePortfolio(
      [{ ticker: 'AAPL', shares: 10, avgCost: 100, currentPrice: 110 }],
      {},
    );
    const cleared = await repo.clearPortfolio();
    expect(cleared.uploadedAt).toBeNull();
    expect(cleared.positions).toEqual([]);
  });

  it('never fabricates holdings when the store is empty', async () => {
    const repo = new FilePortfolioRepository(makeConfigService(dir));
    const portfolio = await repo.getPortfolio();
    expect(portfolio.positions).toEqual([]);
  });
});
