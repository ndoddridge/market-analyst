import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { DEFAULT_ANALYSIS_PROFILE } from '../analysis/types/analysis-profile';
import { ConfigService } from '../config/config.service';
import { PortfolioRepository } from './portfolio.repository';
import type { PortfolioPositionInput } from './types/portfolio';
import type {
  PersistedPortfolio,
  PortfolioSettings,
} from './types/portfolio-store';

const STORE_FILENAME = 'portfolio-store.json';

type StoreFile = {
  version: 1;
  portfolio: PersistedPortfolio;
  settings: PortfolioSettings;
};

function emptyPortfolio(): PersistedPortfolio {
  const now = new Date().toISOString();
  return {
    positions: [],
    uploadedAt: null,
    sourceFilename: null,
    updatedAt: now,
  };
}

function defaultSettings(): PortfolioSettings {
  return { horizonProfile: DEFAULT_ANALYSIS_PROFILE };
}

/**
 * Single-file JSON persistence for the portfolio + dashboard settings.
 * Writes are atomic (tmp file + rename) and serialized through an internal
 * queue — sufficient for a single-process, single-user app with no external
 * database. Missing/corrupt files are treated as "never uploaded" and never
 * throw, so a broken file cannot fabricate holdings.
 */
@Injectable()
export class FilePortfolioRepository extends PortfolioRepository {
  private readonly logger = new Logger(FilePortfolioRepository.name);
  private writeQueue: Promise<unknown> = Promise.resolve();
  private cache: StoreFile | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  private get filePath(): string {
    return join(this.configService.getPortfolioDataDir(), STORE_FILENAME);
  }

  private async load(): Promise<StoreFile> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoreFile> | null;
      if (!parsed || typeof parsed !== 'object' || !parsed.portfolio) {
        throw new Error('Portfolio store file is malformed.');
      }
      this.cache = {
        version: 1,
        portfolio: { ...emptyPortfolio(), ...parsed.portfolio },
        settings: { ...defaultSettings(), ...parsed.settings },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        this.logger.warn(
          `Portfolio store unreadable/corrupt; treating as never uploaded: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      this.cache = {
        version: 1,
        portfolio: emptyPortfolio(),
        settings: defaultSettings(),
      };
    }

    return this.cache;
  }

  private async persist(next: StoreFile): Promise<void> {
    this.cache = next;
    const dir = this.configService.getPortfolioDataDir();
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = join(dir, `${STORE_FILENAME}.${randomUUID()}.tmp`);
    await fs.writeFile(tmpPath, JSON.stringify(next, null, 2), 'utf8');
    await fs.rename(tmpPath, this.filePath);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(task, task);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async getPortfolio(): Promise<PersistedPortfolio> {
    const store = await this.load();
    return store.portfolio;
  }

  async replacePortfolio(
    positions: PortfolioPositionInput[],
    meta: { sourceFilename?: string | null },
  ): Promise<PersistedPortfolio> {
    return this.enqueue(async () => {
      const store = await this.load();
      const now = new Date().toISOString();
      const portfolio: PersistedPortfolio = {
        positions,
        uploadedAt: now,
        sourceFilename: meta.sourceFilename ?? null,
        updatedAt: now,
      };
      await this.persist({ ...store, portfolio });
      return portfolio;
    });
  }

  async upsertPosition(
    position: PortfolioPositionInput,
  ): Promise<PersistedPortfolio> {
    return this.enqueue(async () => {
      const store = await this.load();
      const ticker = position.ticker.toUpperCase();
      const positions = [...store.portfolio.positions];
      const index = positions.findIndex(
        (existing) => existing.ticker.toUpperCase() === ticker,
      );
      const next = { ...position, ticker };
      if (index >= 0) {
        positions[index] = next;
      } else {
        positions.push(next);
      }

      const now = new Date().toISOString();
      const portfolio: PersistedPortfolio = {
        ...store.portfolio,
        positions,
        uploadedAt: store.portfolio.uploadedAt ?? now,
        updatedAt: now,
      };
      await this.persist({ ...store, portfolio });
      return portfolio;
    });
  }

  async removePosition(ticker: string): Promise<PersistedPortfolio> {
    return this.enqueue(async () => {
      const store = await this.load();
      const upper = ticker.toUpperCase();
      const positions = store.portfolio.positions.filter(
        (existing) => existing.ticker.toUpperCase() !== upper,
      );
      const now = new Date().toISOString();
      const portfolio: PersistedPortfolio = {
        ...store.portfolio,
        positions,
        updatedAt: now,
      };
      await this.persist({ ...store, portfolio });
      return portfolio;
    });
  }

  async clearPortfolio(): Promise<PersistedPortfolio> {
    return this.enqueue(async () => {
      const store = await this.load();
      const portfolio = emptyPortfolio();
      await this.persist({ ...store, portfolio });
      return portfolio;
    });
  }

  async getSettings(): Promise<PortfolioSettings> {
    const store = await this.load();
    return store.settings;
  }

  async updateSettings(
    patch: Partial<PortfolioSettings>,
  ): Promise<PortfolioSettings> {
    return this.enqueue(async () => {
      const store = await this.load();
      const settings: PortfolioSettings = { ...store.settings, ...patch };
      await this.persist({ ...store, settings });
      return settings;
    });
  }
}
