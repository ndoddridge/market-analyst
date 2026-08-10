import type { PortfolioPositionInput } from './types/portfolio';
import { CsvParseResult } from './types/portfolio';

const HEADER = ['ticker', 'shares', 'avgcost', 'currentprice'] as const;
const CHASE_REQUIRED = ['ticker', 'quantity', 'unitcost', 'price'] as const;

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

  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map((line) => line.trim());
  const nonEmptyIndexes = lines
    .map((line, index) => (line.length > 0 ? index : -1))
    .filter((index) => index >= 0);

  if (nonEmptyIndexes.length === 0) {
    return {
      positions: [],
      errors: [{ line: 0, message: 'CSV file is empty.' }],
    };
  }

  const headerLineIndex = nonEmptyIndexes[0];
  const headerCells = splitCsvLine(lines[headerLineIndex]).map((cell) =>
    cell.trim().toLowerCase().replace(/\s+/g, ''),
  );
  const headerOk =
    headerCells.length >= 4 &&
    HEADER.every((name, index) => headerCells[index] === name);
const chaseHeaderOk = CHASE_REQUIRED.every((name) => headerCells.includes(name));

  if (headerOk === false && chaseHeaderOk === false) {
    return {
      positions: [],
      errors: [
        {
          line: headerLineIndex + 1,
          message:
            'Invalid CSV header. Expected: ticker,shares,avgCost,currentPrice',
        },
      ],
    };
  }

  const positions: PortfolioPositionInput[] = [];
  const errors: CsvParseResult['errors'] = [];
  const seen = new Set<string>();

  for (const index of nonEmptyIndexes.slice(1)) {
    const lineNumber = index + 1;
    const cells = splitCsvLine(lines[index]);
    if (cells.every((cell) => cell.trim() === '')) {
      continue;
    }

    const parsed = chaseHeaderOk ? parsePositionRow([cells[headerCells.indexOf('ticker')], cells[headerCells.indexOf('quantity')], cells[headerCells.indexOf('unitcost')], cells[headerCells.indexOf('price')]], lineNumber) : parsePositionRow(cells, lineNumber);
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
