import { Parser, FinancialData, ValidationResult, ProcessingMetadata } from './types';

export abstract class BaseParser implements Parser {
  protected parserVersion: string;
  protected supportedFormats: string[];

  constructor(parserVersion: string, supportedFormats: string[]) {
    this.parserVersion = parserVersion;
    this.supportedFormats = supportedFormats;
  }

  abstract parse(buffer: Buffer, fileName: string): Promise<FinancialData>;
  abstract validate(data: any): ValidationResult;

  canParse(fileType: string, mimeType?: string): boolean {
    return this.supportedFormats.includes(fileType.toLowerCase());
  }

  getSupportedFormats(): string[] {
    return [...this.supportedFormats];
  }

  protected createProcessingMetadata(
    processingTime: number,
    warnings: any[] = [],
    errors: any[] = [],
    aiAssisted: boolean = false
  ): ProcessingMetadata {
    return {
      parserVersion: this.parserVersion,
      processedAt: new Date(),
      processingTime,
      warnings: this.formatWarnings(warnings),
      errors: this.formatErrors(errors),
      aiAssisted
    };
  }

  protected formatWarnings(warnings: any[]): any[] {
    return warnings.map(warning => ({
      code: warning.code || 'UNKNOWN_WARNING',
      message: warning.message || 'Unknown warning occurred',
      severity: warning.severity || 'medium',
      source: this.constructor.name,
      suggestion: warning.suggestion
    }));
  }

  protected formatErrors(errors: any[]): any[] {
    return errors.map(error => ({
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message || 'Unknown error occurred',
      severity: error.severity || 'error',
      source: this.constructor.name,
      recoverySuggestion: error.recoverySuggestion
    }));
  }

  protected sanitizeValue(value: any): number | string | boolean {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    // Handle different number formats
    if (typeof value === 'string') {
      // Remove common formatting characters
      const cleanValue = value.replace(/[$,()%\s]/g, '');

      // Handle parentheses for negative numbers
      if (cleanValue.startsWith('(') && cleanValue.endsWith(')')) {
        const numericValue = parseFloat(cleanValue.slice(1, -1));
        return isNaN(numericValue) ? value : -numericValue;
      }

      // Try to parse as number
      const numericValue = parseFloat(cleanValue);
      if (!isNaN(numericValue)) {
        return numericValue;
      }

      // Handle boolean values
      if (cleanValue.toLowerCase() === 'true') return true;
      if (cleanValue.toLowerCase() === 'false') return false;

      // Return cleaned string
      return cleanValue;
    }

    return value;
  }

  protected detectScale(value: number, fieldName?: string): number {
    // Heuristic to detect if values are in thousands or millions
    // This is a simplified approach - in production, you'd want more sophisticated detection
    if (Math.abs(value) > 1000000) {
      return 1000000; // Millions
    } else if (Math.abs(value) > 1000) {
      return 1000; // Thousands
    }
    return 1; // Units
  }

  protected detectPeriodEndDate(data: any): Date | undefined {
    // Try to extract period end date from data
    if (data.periodEndDate) {
      return new Date(data.periodEndDate);
    }

    if (data.date) {
      return new Date(data.date);
    }

    if (data.endDate) {
      return new Date(data.endDate);
    }

    // Look for common date fields
    const dateFields = ['reportDate', 'asOfDate', 'fiscalYearEnd'];
    for (const field of dateFields) {
      if (data[field]) {
        return new Date(data[field]);
      }
    }

    return undefined;
  }

  protected detectFiscalYear(data: any): number | undefined {
    if (data.fiscalYear) {
      return parseInt(data.fiscalYear.toString());
    }

    const periodEndDate = this.detectPeriodEndDate(data);
    if (periodEndDate) {
      // Fiscal year typically ends in the period end date's year
      // or might be the previous year if the period ends early in the year
      const year = periodEndDate.getFullYear();
      const month = periodEndDate.getMonth() + 1; // 1-12

      // If period ends in Jan-Mar, it's likely for previous fiscal year
      if (month <= 3) {
        return year - 1;
      }
      return year;
    }

    return undefined;
  }

  protected detectCurrency(data: any): string {
    if (data.currency) {
      return data.currency.toUpperCase();
    }

    // Simple currency detection based on common patterns
    const sampleValues = this.extractNumericValues(data);

    // Look for currency symbols in string values
    const stringValues = Object.values(data).filter(v => typeof v === 'string');
    for (const value of stringValues) {
      if (value.includes('$') || value.toLowerCase().includes('usd')) {
        return 'USD';
      }
      if (value.includes('€') || value.toLowerCase().includes('eur')) {
        return 'EUR';
      }
      if (value.includes('£') || value.toLowerCase().includes('gbp')) {
        return 'GBP';
      }
    }

    // Default to USD for financial reports if no currency found
    return 'USD';
  }

  private extractNumericValues(data: any): number[] {
    const values: number[] = [];

    function extract(obj: any) {
      for (const key in obj) {
        if (typeof obj[key] === 'number') {
          values.push(obj[key]);
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          extract(obj[key]);
        }
      }
    }

    extract(data);
    return values;
  }

  protected generateSourceReference(identifier: string, row?: number, column?: number): string {
    const parts = [identifier];
    if (row !== undefined) parts.push(`row:${row}`);
    if (column !== undefined) parts.push(`col:${column}`);
    return parts.join('_');
  }

  protected createValidationError(field: string, message: string, value?: any, constraint?: string) {
    return {
      field,
      message,
      value,
      constraint: constraint || 'unknown'
    };
  }

  protected createValidationWarning(field: string, message: string, value?: any, suggestion?: string) {
    return {
      field,
      message,
      value,
      suggestion
    };
  }
}