import * as XLSX from 'xlsx';
import { BaseParser } from './BaseParser';
import { FinancialData, FinancialStatement, FinancialItem, ValidationResult, FILE_TYPES, REPORT_TYPES } from './types';

export class ExcelParser extends BaseParser {
  constructor() {
    super('1.0.0', [FILE_TYPES.EXCEL, 'xlsx', 'xls']);
  }

  async parse(buffer: Buffer, fileName: string): Promise<FinancialData> {
    const startTime = Date.now();
    const warnings: any[] = [];
    const errors: any[] = [];

    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetNames = workbook.SheetNames;

      if (sheetNames.length === 0) {
        throw new Error('Excel file contains no worksheets');
      }

      const statements: FinancialStatement[] = [];
      let detectedCurrency = 'USD';
      let overallReportType = REPORT_TYPES.UNKNOWN;

      // Parse each sheet
      for (const sheetName of sheetNames) {
        try {
          const worksheet = workbook.Sheets[sheetName];
          const sheetData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: null,
            raw: false
          }) as any[][];

          if (sheetData.length === 0) continue;

          const sheetResult = await this.parseWorksheet(sheetData, sheetName, warnings);
          if (sheetResult.statement) {
            statements.push(sheetResult.statement);
            if (sheetResult.currency) {
              detectedCurrency = sheetResult.currency;
            }
            if (sheetResult.reportType && overallReportType === REPORT_TYPES.UNKNOWN) {
              overallReportType = sheetResult.reportType;
            }
          }
        } catch (sheetError) {
          errors.push({
            code: 'SHEET_PARSE_ERROR',
            message: `Failed to parse sheet "${sheetName}": ${sheetError instanceof Error ? sheetError.message : 'Unknown error'}`,
            severity: 'warning' as const,
            sheet: sheetName
          });
        }
      }

      if (statements.length === 0) {
        throw new Error('No valid financial data found in any worksheet');
      }

      const processingTime = Date.now() - startTime;

      return {
        documentInfo: {
          fileName,
          fileType: FILE_TYPES.EXCEL,
          originalName: fileName,
          fileSize: buffer.length,
          currency: detectedCurrency,
          reportType: overallReportType,
          companyName: this.extractCompanyName(workbook)
        },
        financialStatements: statements,
        metadata: this.createProcessingMetadata(processingTime, warnings, errors)
      };

    } catch (error) {
      errors.push({
        code: 'PARSE_FAILED',
        message: `Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'critical' as const
      });

      const processingTime = Date.now() - startTime;

      return {
        documentInfo: {
          fileName,
          fileType: FILE_TYPES.EXCEL,
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
      errors.push(this.createValidationError('data', 'Data must be an array of rows'));
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
      warnings.push(this.createValidationWarning('data', 'Worksheet contains no data'));
    }

    let validRecords = 0;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && cell !== '')) {
        validRecords++;
      } else if (i > 0) { // Skip header row validation
        warnings.push(this.createValidationWarning(`row_${i}`, 'Row appears to be empty', row));
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

  private async parseWorksheet(
    sheetData: any[][],
    sheetName: string,
    warnings: any[]
  ): Promise<{ statement: FinancialStatement | null; currency: string; reportType: string }> {

    if (sheetData.length < 2) {
      warnings.push({
        code: 'INSUFFICIENT_DATA',
        message: `Sheet "${sheetName}" has insufficient data`,
        severity: 'low'
      });
      return { statement: null, currency: 'USD', reportType: REPORT_TYPES.UNKNOWN };
    }

    // Detect report type and structure
    const reportType = this.detectReportTypeFromSheet(sheetData, sheetName);
    const currency = this.detectCurrencyFromSheet(sheetData);
    const periodInfo = this.extractPeriodInfoFromSheet(sheetData);

    // Convert sheet data to structured format
    const structuredData = this.convertSheetToStructuredData(sheetData, warnings);

    let statement: FinancialStatement | null = null;

    switch (reportType) {
      case REPORT_TYPES.BALANCE_SHEET:
        statement = await this.parseBalanceSheetFromStructuredData(
          structuredData,
          periodInfo,
          sheetName,
          warnings
        );
        break;

      case REPORT_TYPES.INCOME_STATEMENT:
        statement = await this.parseIncomeStatementFromStructuredData(
          structuredData,
          periodInfo,
          sheetName,
          warnings
        );
        break;

      case REPORT_TYPES.CASH_FLOW:
        statement = await this.parseCashFlowFromStructuredData(
          structuredData,
          periodInfo,
          sheetName,
          warnings
        );
        break;

      default:
        statement = await this.parseGenericStatementFromStructuredData(
          structuredData,
          periodInfo,
          sheetName,
          warnings
        );
    }

    return {
      statement,
      currency,
      reportType
    };
  }

  private detectReportTypeFromSheet(sheetData: any[][], sheetName: string): string {
    const sheetNameLower = sheetName.toLowerCase();
    const firstRowText = sheetData[0]?.join(' ').toLowerCase() || '';

    // Check sheet name first
    if (sheetNameLower.includes('balance') || sheetNameLower.includes('assets') ||
        sheetNameLower.includes('liabilities') || sheetNameLower.includes('equity')) {
      return REPORT_TYPES.BALANCE_SHEET;
    }

    if (sheetNameLower.includes('income') || sheetNameLower.includes('p&l') ||
        sheetNameLower.includes('profit') || sheetNameLower.includes('loss')) {
      return REPORT_TYPES.INCOME_STATEMENT;
    }

    if (sheetNameLower.includes('cash') || sheetNameLower.includes('flow') ||
        sheetNameLower.includes('cf')) {
      return REPORT_TYPES.CASH_FLOW;
    }

    // Check content
    const allText = sheetData.flat().join(' ').toLowerCase();

    const balanceSheetKeywords = ['assets', 'liabilities', 'equity', 'cash equivalents', 'accounts receivable'];
    const incomeKeywords = ['revenue', 'sales', 'gross profit', 'operating income', 'net income'];
    const cashFlowKeywords = ['operating activities', 'investing activities', 'financing activities', 'cash flow'];

    const balanceSheetScore = balanceSheetKeywords.filter(kw => allText.includes(kw)).length;
    const incomeScore = incomeKeywords.filter(kw => allText.includes(kw)).length;
    const cashFlowScore = cashFlowKeywords.filter(kw => allText.includes(kw)).length;

    if (balanceSheetScore >= incomeScore && balanceSheetScore >= cashFlowScore && balanceSheetScore > 0) {
      return REPORT_TYPES.BALANCE_SHEET;
    } else if (incomeScore >= cashFlowScore && incomeScore > 0) {
      return REPORT_TYPES.INCOME_STATEMENT;
    } else if (cashFlowScore > 0) {
      return REPORT_TYPES.CASH_FLOW;
    }

    return REPORT_TYPES.UNKNOWN;
  }

  private detectCurrencyFromSheet(sheetData: any[][]): string {
    const allText = sheetData.flat().join(' ').toLowerCase();

    if (allText.includes('$') || allText.includes('usd')) return 'USD';
    if (allText.includes('€') || allText.includes('eur')) return 'EUR';
    if (allText.includes('£') || allText.includes('gbp')) return 'GBP';
    if (allText.includes('¥') || allText.includes('jpy')) return 'JPY';

    return 'USD'; // Default
  }

  private extractPeriodInfoFromSheet(sheetData: any[][]): { periodEndDate?: Date; fiscalYear?: number } {
    const result: { periodEndDate?: Date; fiscalYear?: number } = {};

    // Look for date patterns in the first few rows
    for (let i = 0; i < Math.min(5, sheetData.length); i++) {
      const row = sheetData[i];
      for (const cell of row) {
        if (cell && typeof cell === 'string') {
          // Try to extract date from cell content
          const dateMatch = cell.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\d{4})/);
          if (dateMatch) {
            const date = new Date(dateMatch[0]);
            if (!isNaN(date.getTime())) {
              result.periodEndDate = date;
              result.fiscalYear = date.getFullYear();
              return result;
            }
          }
        }
      }
    }

    return result;
  }

  private convertSheetToStructuredData(sheetData: any[][], warnings: any[]): Array<{concept: string; value: any}> {
    const structuredData: Array<{concept: string; value: any}> = [];

    try {
      // Try to find header row
      let headerRowIndex = 0;
      let hasHeaders = false;

      // Check if first row looks like headers (contains non-numeric values)
      const firstRow = sheetData[0] || [];
      if (firstRow.some(cell => cell && typeof cell === 'string' && isNaN(Number(cell)))) {
        hasHeaders = true;
      }

      // If no headers, assume first column is concept and subsequent columns are values
      if (!hasHeaders) {
        for (let i = 0; i < sheetData.length; i++) {
          const row = sheetData[i];
          if (row.length >= 2) {
            const concept = row[0];
            const value = row[1]; // Take first value column
            if (concept && value !== null && value !== undefined && value !== '') {
              structuredData.push({ concept: concept.toString().trim(), value });
            }
          }
        }
      } else {
        // With headers, try to map header-value pairs
        const headers = sheetData[0] || [];
        for (let i = 1; i < sheetData.length; i++) {
          const row = sheetData[i];
          for (let j = 0; j < headers.length && j < row.length; j++) {
            const concept = headers[j];
            const value = row[j];
            if (concept && value !== null && value !== undefined && value !== '') {
              structuredData.push({
                concept: concept.toString().trim(),
                value
              });
            }
          }
        }
      }

    } catch (error) {
      warnings.push({
        code: 'STRUCTURE_DETECTION_ERROR',
        message: `Failed to detect sheet structure: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'medium'
      });
    }

    return structuredData;
  }

  private async parseBalanceSheetFromStructuredData(
    data: Array<{concept: string; value: any}>,
    periodInfo: { periodEndDate?: Date; fiscalYear?: number },
    sheetName: string,
    warnings: any[]
  ): Promise<FinancialStatement> {
    const items: FinancialItem[] = [];
    const periodEndDate = periodInfo.periodEndDate || new Date();
    const fiscalYear = periodInfo.fiscalYear || periodEndDate.getFullYear();

    for (let i = 0; i < data.length; i++) {
      const item = await this.createFinancialItemFromStructuredData(
        data[i].concept,
        data[i].value,
        i,
        sheetName,
        warnings
      );
      if (item) {
        items.push(item);
      }
    }

    return {
      type: REPORT_TYPES.BALANCE_SHEET,
      periodEndDate,
      fiscalYear,
      items,
      metadata: {
        framework: 'US-GAAP',
        consolidationLevel: 'consolidated',
        presentationFormat: 'classified'
      }
    };
  }

  private async parseIncomeStatementFromStructuredData(
    data: Array<{concept: string; value: any}>,
    periodInfo: { periodEndDate?: Date; fiscalYear?: number },
    sheetName: string,
    warnings: any[]
  ): Promise<FinancialStatement> {
    const items: FinancialItem[] = [];
    const periodEndDate = periodInfo.periodEndDate || new Date();
    const fiscalYear = periodInfo.fiscalYear || periodEndDate.getFullYear();

    for (let i = 0; i < data.length; i++) {
      const item = await this.createFinancialItemFromStructuredData(
        data[i].concept,
        data[i].value,
        i,
        sheetName,
        warnings
      );
      if (item) {
        items.push(item);
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

  private async parseCashFlowFromStructuredData(
    data: Array<{concept: string; value: any}>,
    periodInfo: { periodEndDate?: Date; fiscalYear?: number },
    sheetName: string,
    warnings: any[]
  ): Promise<FinancialStatement> {
    const items: FinancialItem[] = [];
    const periodEndDate = periodInfo.periodEndDate || new Date();
    const fiscalYear = periodInfo.fiscalYear || periodEndDate.getFullYear();

    for (let i = 0; i < data.length; i++) {
      const item = await this.createFinancialItemFromStructuredData(
        data[i].concept,
        data[i].value,
        i,
        sheetName,
        warnings
      );
      if (item) {
        items.push(item);
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

  private async parseGenericStatementFromStructuredData(
    data: Array<{concept: string; value: any}>,
    periodInfo: { periodEndDate?: Date; fiscalYear?: number },
    sheetName: string,
    warnings: any[]
  ): Promise<FinancialStatement> {
    const items: FinancialItem[] = [];
    const periodEndDate = periodInfo.periodEndDate || new Date();
    const fiscalYear = periodInfo.fiscalYear || periodEndDate.getFullYear();

    for (let i = 0; i < data.length; i++) {
      const item = await this.createFinancialItemFromStructuredData(
        data[i].concept,
        data[i].value,
        i,
        sheetName,
        warnings
      );
      if (item) {
        items.push(item);
      }
    }

    return {
      type: REPORT_TYPES.UNKNOWN,
      periodEndDate,
      fiscalYear,
      items
    };
  }

  private async createFinancialItemFromStructuredData(
    concept: string,
    value: any,
    index: number,
    sheetName: string,
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
        sourceReference: this.generateSourceReference(concept, index, undefined),
        confidence: 85 // Excel parsing typically has good confidence
      };
    } catch (error) {
      warnings.push({
        code: 'ITEM_PARSE_ERROR',
        message: `Failed to parse item ${concept} from ${sheetName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sheet: sheetName,
        row: index,
        severity: 'low'
      });
      return null;
    }
  }

  private extractCompanyName(workbook: XLSX.WorkBook): string | undefined {
    // Try to extract company name from workbook properties or first sheet
    try {
      // Check workbook properties
      if (workbook.Props?.Subject) {
        return workbook.Props.Subject;
      }

      // Check first sheet for company name patterns
      const firstSheetName = workbook.SheetNames[0];
      if (firstSheetName) {
        const firstSheet = workbook.Sheets[firstSheetName];
        const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1:A1');

        // Check first few cells for company name patterns
        for (let row = 0; row <= Math.min(3, range.e.r); row++) {
          for (let col = 0; col <= Math.min(2, range.e.c); col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = firstSheet[cellAddress];

            if (cell && cell.v && typeof cell.v === 'string') {
              const value = cell.v.trim();
              // Simple heuristic for company names
              if (value.length > 3 &&
                  value.length < 50 &&
                  !value.toLowerCase().includes('total') &&
                  !value.toLowerCase().includes('summary') &&
                  /^[A-Z&\s\-\.]+$/.test(value)) {
                return value;
              }
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors in company name extraction
    }

    return undefined;
  }
}