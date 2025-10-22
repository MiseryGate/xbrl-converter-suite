import Papa from 'papaparse';
import { BaseParser } from './BaseParser';
import { FinancialData, FinancialStatement, FinancialItem, ValidationResult, FILE_TYPES, REPORT_TYPES } from './types';

export class CsvParser extends BaseParser {
  constructor() {
    super('1.0.0', [FILE_TYPES.CSV]);
  }

  async parse(buffer: Buffer, fileName: string): Promise<FinancialData> {
    const startTime = Date.now();
    const warnings: any[] = [];
    const errors: any[] = [];

    try {
      const csvText = buffer.toString('utf-8');

      const parseResult = await new Promise<Papa.ParseResult<any>>((resolve, reject) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim(),
          transform: (value) => value.trim(),
          complete: (results) => resolve(results),
          error: (error) => reject(error)
        });
      });

      if (parseResult.errors.length > 0) {
        errors.push(...parseResult.errors.map(error => ({
          code: 'CSV_PARSE_ERROR',
          message: error.message,
          severity: 'error' as const,
          row: error.row
        })));
      }

      const data = parseResult.data as any[];

      if (data.length === 0) {
        throw new Error('CSV file is empty or contains no valid data');
      }

      const financialData = await this.convertToFinancialData(data, fileName, warnings);

      const processingTime = Date.now() - startTime;

      return {
        documentInfo: {
          fileName,
          fileType: FILE_TYPES.CSV,
          originalName: fileName,
          fileSize: buffer.length,
          currency: financialData.currency || 'USD',
          reportType: financialData.reportType || REPORT_TYPES.UNKNOWN
        },
        financialStatements: financialData.statements,
        metadata: this.createProcessingMetadata(processingTime, warnings, errors)
      };

    } catch (error) {
      errors.push({
        code: 'PARSE_FAILED',
        message: `Failed to parse CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'critical' as const
      });

      const processingTime = Date.now() - startTime;

      return {
        documentInfo: {
          fileName,
          fileType: FILE_TYPES.CSV,
          originalName: fileName,
          fileSize: buffer.length,
          currency: 'USD',
          reportType: REPORT_TYPES.UNKNOWN
        },
        financialStatements: [],
        metadata: this.createProcessingMetadata(processingTime, warnings, errors)
      };
    }
  }

  validate(data: any): ValidationResult {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(data)) {
      errors.push(this.createValidationError('data', 'Data must be an array'));
      return {
        isValid: false,
        errors,
        warnings,
        metadata: {
          totalRecords: 0,
          validRecords: 0,
          invalidRecords: 0,
          processingTime: 0
        }
      };
    }

    if (data.length === 0) {
      warnings.push(this.createValidationWarning('data', 'CSV contains no data rows'));
    }

    // Validate that each row has required structure
    let validRecords = 0;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (this.isValidRow(row)) {
        validRecords++;
      } else {
        errors.push(this.createValidationError(`row_${i}`, 'Invalid row structure', row));
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        totalRecords: data.length,
        validRecords,
        invalidRecords: data.length - validRecords,
        processingTime: 0
      }
    };
  }

  private isValidRow(row: any): boolean {
    // Basic validation - at least one non-empty field
    return row && typeof row === 'object' && Object.keys(row).length > 0;
  }

  private async convertToFinancialData(data: any[], fileName: string, warnings: any[]): Promise<{
    statements: FinancialStatement[];
    currency: string;
    reportType: string;
  }> {
    // Detect the structure of the CSV and determine report type
    const reportType = this.detectReportType(data);
    const currency = this.detectCurrencyFromData(data);

    switch (reportType) {
      case REPORT_TYPES.BALANCE_SHEET:
        return {
          statements: [await this.parseBalanceSheet(data, warnings)],
          currency,
          reportType: REPORT_TYPES.BALANCE_SHEET
        };

      case REPORT_TYPES.INCOME_STATEMENT:
        return {
          statements: [await this.parseIncomeStatement(data, warnings)],
          currency,
          reportType: REPORT_TYPES.INCOME_STATEMENT
        };

      case REPORT_TYPES.CASH_FLOW:
        return {
          statements: [await this.parseCashFlowStatement(data, warnings)],
          currency,
          reportType: REPORT_TYPES.CASH_FLOW
        };

      default:
        // Try to parse as generic financial data
        return {
          statements: [await this.parseGenericFinancialData(data, warnings)],
          currency,
          reportType: REPORT_TYPES.UNKNOWN
        };
    }
  }

  private detectReportType(data: any[]): string {
    if (data.length === 0) return REPORT_TYPES.UNKNOWN;

    const headers = Object.keys(data[0]).map(h => h.toLowerCase());
    const allHeaders = headers.join(' ').toLowerCase();

    // Balance sheet indicators
    const balanceSheetKeywords = [
      'assets', 'liabilities', 'equity', 'cash', 'receivables',
      'payables', 'inventory', 'property', 'plant', 'equipment'
    ];

    // Income statement keywords
    const incomeKeywords = [
      'revenue', 'sales', 'income', 'expenses', 'cost', 'gross profit',
      'operating income', 'net income', 'earnings'
    ];

    // Cash flow keywords
    const cashFlowKeywords = [
      'cash flow', 'operating activities', 'investing activities',
      'financing activities', 'cash from', 'cash used'
    ];

    const balanceSheetScore = balanceSheetKeywords.filter(kw => allHeaders.includes(kw)).length;
    const incomeScore = incomeKeywords.filter(kw => allHeaders.includes(kw)).length;
    const cashFlowScore = cashFlowKeywords.filter(kw => allHeaders.includes(kw)).length;

    if (balanceSheetScore >= incomeScore && balanceSheetScore >= cashFlowScore) {
      return REPORT_TYPES.BALANCE_SHEET;
    } else if (incomeScore >= cashFlowScore) {
      return REPORT_TYPES.INCOME_STATEMENT;
    } else if (cashFlowScore > 0) {
      return REPORT_TYPES.CASH_FLOW;
    }

    return REPORT_TYPES.UNKNOWN;
  }

  private detectCurrencyFromData(data: any[]): string {
    // Look for currency indicators in headers or first few rows
    const sampleData = data.slice(0, 5);
    const allText = JSON.stringify(sampleData).toLowerCase();

    if (allText.includes('$') || allText.includes('usd')) return 'USD';
    if (allText.includes('€') || allText.includes('eur')) return 'EUR';
    if (allText.includes('£') || allText.includes('gbp')) return 'GBP';

    return 'USD'; // Default
  }

  private async parseBalanceSheet(data: any[], warnings: any[]): Promise<FinancialStatement> {
    const items: FinancialItem[] = [];
    const periodEndDate = this.extractDateFromData(data) || new Date();
    const fiscalYear = periodEndDate.getFullYear();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      for (const [key, value] of Object.entries(row)) {
        if (value !== null && value !== undefined && value !== '') {
          const item = await this.createFinancialItem(key, value, i, undefined, warnings);
          if (item) {
            items.push(item);
          }
        }
      }
    }

    return {
      type: REPORT_TYPES.BALANCE_SHEET,
      periodEndDate,
      fiscalYear,
      items,
      metadata: {
        framework: 'US-GAAP',
        consolidationLevel: 'consolidated'
      }
    };
  }

  private async parseIncomeStatement(data: any[], warnings: any[]): Promise<FinancialStatement> {
    const items: FinancialItem[] = [];
    const periodEndDate = this.extractDateFromData(data) || new Date();
    const fiscalYear = periodEndDate.getFullYear();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      for (const [key, value] of Object.entries(row)) {
        if (value !== null && value !== undefined && value !== '') {
          const item = await this.createFinancialItem(key, value, i, undefined, warnings);
          if (item) {
            items.push(item);
          }
        }
      }
    }

    return {
      type: REPORT_TYPES.INCOME_STATEMENT,
      periodEndDate,
      fiscalYear,
      items,
      metadata: {
        framework: 'US-GAAP'
      }
    };
  }

  private async parseCashFlowStatement(data: any[], warnings: any[]): Promise<FinancialStatement> {
    const items: FinancialItem[] = [];
    const periodEndDate = this.extractDateFromData(data) || new Date();
    const fiscalYear = periodEndDate.getFullYear();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      for (const [key, value] of Object.entries(row)) {
        if (value !== null && value !== undefined && value !== '') {
          const item = await this.createFinancialItem(key, value, i, undefined, warnings);
          if (item) {
            items.push(item);
          }
        }
      }
    }

    return {
      type: REPORT_TYPES.CASH_FLOW,
      periodEndDate,
      fiscalYear,
      items,
      metadata: {
        framework: 'US-GAAP'
      }
    };
  }

  private async parseGenericFinancialData(data: any[], warnings: any[]): Promise<FinancialStatement> {
    const items: FinancialItem[] = [];
    const periodEndDate = new Date();
    const fiscalYear = periodEndDate.getFullYear();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      for (const [key, value] of Object.entries(row)) {
        if (value !== null && value !== undefined && value !== '') {
          const item = await this.createFinancialItem(key, value, i, undefined, warnings);
          if (item) {
            items.push(item);
          }
        }
      }
    }

    return {
      type: REPORT_TYPES.UNKNOWN,
      periodEndDate,
      fiscalYear,
      items
    };
  }

  private extractDateFromData(data: any[]): Date | null {
    // Try to extract date from data
    for (const row of data) {
      for (const [key, value] of Object.entries(row)) {
        const dateFields = ['date', 'period', 'asof', 'enddate', 'reportdate'];
        const keyLower = key.toLowerCase();

        if (dateFields.some(field => keyLower.includes(field)) && value) {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }
    }
    return null;
  }

  private async createFinancialItem(
    concept: string,
    value: any,
    row: number,
    column?: number,
    warnings: any[] = []
  ): Promise<FinancialItem | null> {
    try {
      const sanitizedValue = this.sanitizeValue(value);

      if (sanitizedValue === null || sanitizedValue === undefined) {
        return null;
      }

      return {
        concept: concept.trim(),
        value: sanitizedValue,
        unit: 'USD', // Will be updated based on document currency
        sourceReference: this.generateSourceReference(concept, row, column),
        confidence: 80 // CSV parsing typically has medium confidence
      };
    } catch (error) {
      warnings.push({
        code: 'ITEM_PARSE_ERROR',
        message: `Failed to parse item ${concept}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        row,
        column,
        severity: 'low'
      });
      return null;
    }
  }
}