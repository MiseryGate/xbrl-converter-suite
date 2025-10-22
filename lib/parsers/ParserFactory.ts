import { Parser, ParserFactory } from './types';
import { CsvParser } from './CsvParser';
import { ExcelParser } from './ExcelParser';
import { PdfParser } from './PdfParser';
import { JsonParser } from './JsonParser';
import { XbrlParser } from './XbrlParser';
import { FILE_TYPES } from './types';

export class DefaultParserFactory implements ParserFactory {
  private parsers: Map<string, Parser> = new Map();

  constructor() {
    this.initializeParsers();
  }

  getParser(fileType: string, mimeType?: string): Parser | null {
    // Normalize file type
    const normalizedFileType = fileType.toLowerCase();

    // Direct match
    if (this.parsers.has(normalizedFileType)) {
      return this.parsers.get(normalizedFileType)!;
    }

    // MIME type based matching
    if (mimeType) {
      const parser = this.getParserByMimeType(mimeType);
      if (parser) return parser;
    }

    // Extension-based matching
    const parser = this.getParserByExtension(fileType);
    if (parser) return parser;

    // Additional fuzzy matching
    return this.getParserByFuzzyMatch(normalizedFileType);
  }

  registerParser(fileType: string, parser: Parser): void {
    this.parsers.set(fileType.toLowerCase(), parser);
  }

  getSupportedFormats(): string[] {
    return Array.from(this.parsers.keys());
  }

  private initializeParsers(): void {
    // Initialize all built-in parsers
    this.registerParser(FILE_TYPES.CSV, new CsvParser());
    this.registerParser(FILE_TYPES.EXCEL, new ExcelParser());
    this.registerParser('xlsx', new ExcelParser());
    this.registerParser('xls', new ExcelParser());
    this.registerParser(FILE_TYPES.PDF, new PdfParser());
    this.registerParser(FILE_TYPES.JSON, new JsonParser());
    this.registerParser(FILE_TYPES.XBRL, new XbrlParser());
    this.registerParser(FILE_TYPES.XML, new XbrlParser());
    this.registerParser('xml', new XbrlParser());
  }

  private getParserByMimeType(mimeType: string): Parser | null {
    const mimeToTypeMap: Record<string, string> = {
      // CSV types
      'text/csv': FILE_TYPES.CSV,
      'application/csv': FILE_TYPES.CSV,

      // Excel types
      'application/vnd.ms-excel': FILE_TYPES.EXCEL,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FILE_TYPES.EXCEL,
      'application/vnd.ms-excel.sheet.macroenabled.12': FILE_TYPES.EXCEL,

      // PDF types
      'application/pdf': FILE_TYPES.PDF,

      // JSON types
      'application/json': FILE_TYPES.JSON,
      'text/json': FILE_TYPES.JSON,

      // XML/XBRL types
      'application/xml': FILE_TYPES.XBRL,
      'text/xml': FILE_TYPES.XBRL,
      'application/xbrl+xml': FILE_TYPES.XBRL,
      'application/xbrl': FILE_TYPES.XBRL,

      // Plain text (attempt to parse as CSV)
      'text/plain': FILE_TYPES.CSV
    };

    const fileType = mimeToTypeMap[mimeType.toLowerCase()];
    if (fileType && this.parsers.has(fileType)) {
      return this.parsers.get(fileType)!;
    }

    return null;
  }

  private getParserByExtension(fileType: string): Parser | null {
    const extensionToTypeMap: Record<string, string> = {
      // Excel extensions
      'xlsx': FILE_TYPES.EXCEL,
      'xls': FILE_TYPES.EXCEL,
      'xlsm': FILE_TYPES.EXCEL,

      // CSV extensions
      'csv': FILE_TYPES.CSV,
      'tsv': FILE_TYPES.CSV,

      // PDF extension
      'pdf': FILE_TYPES.PDF,

      // JSON extensions
      'json': FILE_TYPES.JSON,
      'jsonl': FILE_TYPES.JSON,

      // XML/XBRL extensions
      'xml': FILE_TYPES.XML,
      'xbrl': FILE_TYPES.XBRL,
      'xsd': FILE_TYPES.XML
    };

    // Remove leading dot if present
    const cleanExtension = fileType.startsWith('.') ? fileType.slice(1) : fileType;
    const fileTypeMapped = extensionToTypeMap[cleanExtension.toLowerCase()];

    if (fileTypeMapped && this.parsers.has(fileTypeMapped)) {
      return this.parsers.get(fileTypeMapped)!;
    }

    return null;
  }

  private getParserByFuzzyMatch(fileType: string): Parser | null {
    // Fuzzy matching for common variations
    const fuzzyMatches: Record<string, string> = {
      'spreadsheet': FILE_TYPES.EXCEL,
      'excel-file': FILE_TYPES.EXCEL,
      'comma-separated-values': FILE_TYPES.CSV,
      'financial-report': FILE_TYPES.XBRL,
      'structured-data': FILE_TYPES.JSON
    };

    const normalizedInput = fileType.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();

    for (const [pattern, fileTypeMapped] of Object.entries(fuzzyMatches)) {
      if (normalizedInput.includes(pattern) || pattern.includes(normalizedInput)) {
        return this.parsers.get(fileTypeMapped) || null;
      }
    }

    return null;
  }
}

// Create a singleton instance for easy access
export const parserFactory = new DefaultParserFactory();