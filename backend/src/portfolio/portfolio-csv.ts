import type { PortfolioPositionInput } from './types/portfolio';
import { CsvParseResult } from './types/portfolio';

const HEADER = ['ticker', 'shares', 'avgcost', 'currentprice'] as const;

/**
 * Parse a simple portfolio CSV.
 * Expected header: ticker,shares,avgCost,currentPrice
 * Never fabricates values — invalid rows become errors.
 */
export function parsePortfolioCsv(csvText: string): CsvParseResult {
  const text = csvText?.replace(/^\uFEFF/, '') ?? '';
  if (!text.trim()) {
    return {
      positions: [],
      errors: [{ line: 0, message: 'CSV file is empty.' }],
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      positions: [],
      errors: [{ line: 0, message: 'CSV file is empty.' }],
    };
  }

  const headerCells = splitCsvLine(lines[0]).map((cell) =>
    cell.trim().toLowerCase().replace(/\s+/g, ''),
  );
  const headerOk =
    headerCells.length >= 4 &&
    HEADER.every((name, index) => headerCells[index] === name);

  if (!headerOk) {
    return {
      positions: [],
      errors: [
        {
          line: 1,
          message:
            'Invalid CSV header. Expected: ticker,shares,avgCost,currentPrice',
        },
      ],
    };
  }

  const positions: PortfolioPositionInput[] = [];
  const errors: CsvParseResult['errors'] = [];
  const seen = new Set<string>();

  for (let index = 1; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const cells = splitCsvLine(lines[index]);
    if (cells.every((cell) => cell.trim() === '')) {
      continue;
    }

    const parsed = parsePositionRow(cells, lineNumber);
    if ('error' in parsed) {
      errors.push(parsed.error);
      continue;
    }

    const ticker = parsed.position.ticker;
    if (seen.has(ticker)) {
      errors.push({
        line: lineNumber,
        message: `Duplicate ticker "${ticker}".`,
      });
      continue;
    }

    seen.add(ticker);
    positions.push(parsed.position);
  }

  if (positions.length === 0 && errors.length === 0) {
    errors.push({ line: 0, message: 'CSV contains no position rows.' });
  }

  return { positions, errors };
}

export function createManualPosition(input: {
  ticker: string;
  shares: number | string;
  avgCost: number | string;
  currentPrice: number | string;
}): { position?: PortfolioPositionInput; error?: string } {
  const cells = [
    String(input.ticker ?? ''),
    String(input.shares ?? ''),
    String(input.avgCost ?? ''),
    String(input.currentPrice ?? ''),
  ];
  const parsed = parsePositionRow(cells, 0);
  if ('error' in parsed) {
    return { error: parsed.error.message };
  }
  return { position: parsed.position };
}

function parsePositionRow(
  cells: string[],
  line: number,
):
  | { position: PortfolioPositionInput }
  | { error: { line: number; message: string } } {
  if (cells.length < 4) {
    return {
      error: {
        line,
        message: 'Row must include ticker,shares,avgCost,currentPrice.',
      },
    };
  }

  const tickerRaw = cells[0]?.trim() ?? '';
  const ticker = tickerRaw.toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) {
    return {
      error: {
        line,
        message: `Invalid ticker "${tickerRaw || '(empty)'}".`,
      },
    };
  }

  const shares = Number(cells[1]);
  if (!Number.isFinite(shares) || shares <= 0) {
    return {
      error: {
        line,
        message: `Missing or invalid shares for ${ticker}.`,
      },
    };
  }

  const avgCost = Number(cells[2]);
  if (!Number.isFinite(avgCost) || avgCost <= 0) {
    return {
      error: {
        line,
        message: `Missing or invalid avgCost for ${ticker}.`,
      },
    };
  }

  const currentPrice = Number(cells[3]);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return {
      error: {
        line,
        message: `Missing or invalid currentPrice for ${ticker}.`,
      },
    };
  }

  return {
    position: {
      ticker,
      shares,
      avgCost,
      currentPrice,
    },
  };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}
