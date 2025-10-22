// Core canonical data model interface that all parsers must output
export interface FinancialData {
  documentInfo: DocumentInfo;
  financialStatements: FinancialStatement[];
  metadata: ProcessingMetadata;
}

export interface DocumentInfo {
  fileName: string;
  fileType: string;
  originalName: string;
  fileSize: number;
  periodEndDate?: Date;
  fiscalYear?: number;
  fiscalQuarter?: number;
  currency: string;
  scale?: 'thousands' | 'millions' | 'billions' | 'units';
  companyName?: string;
  reportType: 'balance_sheet' | 'income_statement' | 'cash_flow' | 'comprehensive' | 'unknown';
}

export interface FinancialStatement {
  type: 'balance_sheet' | 'income_statement' | 'cash_flow' | 'equity_statement';
  periodEndDate: Date;
  fiscalYear: number;
  fiscalQuarter?: number;
  items: FinancialItem[];
  metadata?: StatementMetadata;
}

export interface FinancialItem {
  concept: string; // Standardized concept name (e.g., "Cash and Cash Equivalents")
  value: number | string | boolean;
  unit: string; // Currency unit (USD, EUR, etc.)
  scale?: number; // Scale factor (1000 for thousands, 1000000 for millions)
  decimals?: number;
  isNil?: boolean;
  context?: XBRLContext;
  sourceReference?: string; // Reference to source location
  confidence?: number; // 0-100 confidence score in parsing
  taxonomyMatch?: TaxonomyMatch;
}

export interface XBRLContext {
  entity: {
    identifier: string;
    scheme: string;
  };
  period: {
    startDate?: Date;
    endDate: Date;
    instant?: Date;
  };
  dimensions?: Array<{
    dimension: string;
    value: string;
  }>;
}

export interface TaxonomyMatch {
  xbrlTag: string;
  taxonomyFramework: 'US-GAAP' | 'IFRS' | 'Other';
  confidence: number;
  mappingMethod: 'exact_match' | 'fuzzy_match' | 'ai_assisted' | 'manual';
  synonyms: string[];
}

export interface StatementMetadata {
  framework: 'US-GAAP' | 'IFRS' | 'Other';
  auditStatus?: 'audited' | 'reviewed' | 'unaudited';
  consolidationLevel?: 'consolidated' | 'standalone' | 'parent';
  presentationFormat?: 'classified' | 'unclassified';
}

export interface ProcessingMetadata {
  parserVersion: string;
  processedAt: Date;
  processingTime: number; // milliseconds
  warnings: ProcessingWarning[];
  errors: ProcessingError[];
  aiAssisted: boolean;
  aiProcessingLog?: AIProcessingEntry[];
}

export interface ProcessingWarning {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  source: string;
  suggestion?: string;
}

export interface ProcessingError {
  code: string;
  message: string;
  severity: 'critical' | 'error' | 'warning';
  source: string;
  recoverySuggestion?: string;
}

export interface AIProcessingEntry {
  step: string;
  prompt: string;
  response: string;
  confidence: number;
  tokensUsed: number;
  processingTime: number;
  modelUsed: string;
}

// Parser interface that all specific parsers must implement
export interface Parser {
  canParse(fileType: string, mimeType?: string): boolean;
  parse(buffer: Buffer, fileName: string): Promise<FinancialData>;
  validate(data: any): ValidationResult;
  getSupportedFormats(): string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metadata: ValidationMetadata;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
  constraint: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  value?: any;
  suggestion?: string;
}

export interface ValidationMetadata {
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  processingTime: number;
  memoryUsage?: number;
}

// Parser factory interface
export interface ParserFactory {
  getParser(fileType: string, mimeType?: string): Parser | null;
  registerParser(fileType: string, parser: Parser): void;
  getSupportedFormats(): string[];
}

// File type constants
export const FILE_TYPES = {
  CSV: 'csv',
  EXCEL: 'excel',
  PDF: 'pdf',
  JSON: 'json',
  XBRL: 'xbrl',
  XML: 'xml',
  TXT: 'txt'
} as const;

export type FileType = typeof FILE_TYPES[keyof typeof FILE_TYPES];

// Report type constants
export const REPORT_TYPES = {
  BALANCE_SHEET: 'balance_sheet',
  INCOME_STATEMENT: 'income_statement',
  CASH_FLOW: 'cash_flow',
  EQUITY_STATEMENT: 'equity_statement',
  COMPREHENSIVE: 'comprehensive',
  UNKNOWN: 'unknown'
} as const;

export type ReportType = typeof REPORT_TYPES[keyof typeof REPORT_TYPES];

// Taxonomy framework constants
export const TAXONOMY_FRAMEWORKS = {
  US_GAAP: 'US-GAAP',
  IFRS: 'IFRS',
  OTHER: 'Other'
} as const;

export type TaxonomyFramework = typeof TAXONOMY_FRAMEWORKS[keyof typeof TAXONOMY_FRAMEWORKS];

// Scale constants
export const SCALES = {
  UNITS: 'units',
  THOUSANDS: 'thousands',
  MILLIONS: 'millions',
  BILLIONS: 'billions'
} as const;

export type Scale = typeof SCALES[keyof typeof SCALES];

// Currency constants
export const CURRENCIES = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  JPY: 'JPY',
  CAD: 'CAD',
  AUD: 'AUD',
  CHF: 'CHF'
} as const;

export type Currency = typeof CURRENCIES[keyof typeof CURRENCIES];