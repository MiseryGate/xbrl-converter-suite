import * as pdfjsLib from 'pdfjs-dist';
import { BaseParser } from './BaseParser';
import { FinancialData, FinancialStatement, FinancialItem, ValidationResult, FILE_TYPES, REPORT_TYPES } from './types';

// Set up PDF.js worker
if (typeof window === 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/build/pdf.worker.cjs');
}

export class PdfParser extends BaseParser {
  constructor() {
    super('1.0.0', [FILE_TYPES.PDF]);
  }

  async parse(buffer: Buffer, fileName: string): Promise<FinancialData> {
    const startTime = Date.now();
    const warnings: any[] = [];
    const errors: any[] = [];

    try {
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        standardFontDataUrl: 'standard_fonts/'
      });

      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      if (numPages === 0) {
        throw new Error('PDF file contains no pages');
      }

      // Extract text from all pages
      let fullText = '';
      const pageTexts: string[] = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = this.extractTextFromPage(textContent);

          pageTexts.push(pageText);
          fullText += pageText + '\n';
        } catch (pageError) {
          warnings.push({
            code: 'PAGE_PARSE_ERROR',
            message: `Failed to parse page ${pageNum}: ${pageError instanceof Error ? pageError.message : 'Unknown error'}`,
            severity: 'warning' as const,
            page: pageNum
          });
        }
      }

      // Parse the extracted text for financial data
      const financialData = await this.parseFinancialText(fullText, pageTexts, fileName, warnings);

      const processingTime = Date.now() - startTime;

      return {
        documentInfo: {
          fileName,
          fileType: FILE_TYPES.PDF,
          originalName: fileName,
          fileSize: buffer.length,
          currency: financialData.currency || 'USD',
          reportType: financialData.reportType || REPORT_TYPES.UNKNOWN,
          companyName: financialData.companyName
        },
        financialStatements: financialData.statements,
        metadata: this.createProcessingMetadata(processingTime, warnings, errors, true)
      };

    } catch (error) {
      errors.push({
        code: 'PARSE_FAILED',
        message: `Failed to parse PDF file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'critical' as const
      });

      const processingTime = Date.now() - startTime;

      return {
        documentInfo: {
          fileName,
          fileType: FILE_TYPES.PDF,
          originalName: fileName,
          fileSize: buffer.length,
          currency: 'USD',
          reportType: REPORT_TYPES.UNKNOWN
        },
        financialStatements: [],
        metadata: this.createProcessingMetadata(processingTime, warnings, errors, true)
      };
    }
  }

  validate(data: any): ValidationResult {
    const errors = [];
    const warnings = [];

    if (!data || typeof data !== 'string') {
      errors.push(this.createValidationError('data', 'Extracted PDF text must be a string'));
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
      warnings.push(this.createValidationWarning('data', 'PDF contains no extractable text'));
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        totalRecords: 1,
        validRecords: data.length > 0 ? 1 : 0,
        invalidRecords: data.length === 0 ? 1 : 0,
        processingTime: 0
      }
    };
  }

  private extractTextFromPage(textContent: any): string {
    return textContent.items
      .filter((item: any) => item.str)
      .map((item: any) => item.str)
      .join(' ');
  }

  private async parseFinancialText(
    fullText: string,
    pageTexts: string[],
    fileName: string,
    warnings: any[]
  ): Promise<{ statements: FinancialStatement[]; currency: string; reportType: string; companyName?: string }> {

    // Detect document structure and type
    const reportType = this.detectReportTypeFromText(fullText);
    const currency = this.detectCurrencyFromText(fullText);
    const companyName = this.extractCompanyNameFromText(fullText);
    const periodInfo = this.extractPeriodInfoFromText(fullText);

    const statements: FinancialStatement[] = [];

    // Try to parse as different statement types
    switch (reportType) {
      case REPORT_TYPES.BALANCE_SHEET:
        statements.push(await this.parseBalanceSheetFromText(fullText, periodInfo, warnings));
        break;

      case REPORT_TYPES.INCOME_STATEMENT:
        statements.push(await this.parseIncomeStatementFromText(fullText, periodInfo, warnings));
        break;

      case REPORT_TYPES.CASH_FLOW:
        statements.push(await this.parseCashFlowFromText(fullText, periodInfo, warnings));
        break;

      default:
        // Try to extract any financial data
        const genericStatement = await this.parseGenericFinancialText(fullText, periodInfo, warnings);
        if (genericStatement.items.length > 0) {
          statements.push(genericStatement);
        }
    }

    return {
      statements,
      currency,
      reportType,
      companyName
    };
  }

  private detectReportTypeFromText(text: string): string {
    const textLower = text.toLowerCase();

    // Balance sheet indicators
    const balanceSheetKeywords = [
      'balance sheet', 'statement of financial position', 'assets', 'liabilities',
      'shareholders\' equity', 'cash and cash equivalents', 'accounts receivable',
      'inventory', 'property, plant', 'total assets', 'total liabilities'
    ];

    // Income statement keywords
    const incomeKeywords = [
      'income statement', 'statement of operations', 'profit and loss', 'revenue',
      'sales', 'gross profit', 'operating income', 'net income', 'earnings',
      'cost of goods sold', 'operating expenses'
    ];

    // Cash flow keywords
    const cashFlowKeywords = [
      'cash flow statement', 'statement of cash flows', 'operating activities',
      'investing activities', 'financing activities', 'cash provided by',
      'cash used in', 'net cash flow'
    ];

    const balanceSheetScore = balanceSheetKeywords.filter(kw => textLower.includes(kw)).length;
    const incomeScore = incomeKeywords.filter(kw => textLower.includes(kw)).length;
    const cashFlowScore = cashFlowKeywords.filter(kw => textLower.includes(kw)).length;

    if (balanceSheetScore >= incomeScore && balanceSheetScore >= cashFlowScore && balanceSheetScore >= 2) {
      return REPORT_TYPES.BALANCE_SHEET;
    } else if (incomeScore >= cashFlowScore && incomeScore >= 2) {
      return REPORT_TYPES.INCOME_STATEMENT;
    } else if (cashFlowScore >= 2) {
      return REPORT_TYPES.CASH_FLOW;
    }

    return REPORT_TYPES.UNKNOWN;
  }

  private detectCurrencyFromText(text: string): string {
    const textLower = text.toLowerCase();

    if (textLower.includes('$') || textLower.includes('usd') || textLower.includes('dollars')) {
      return 'USD';
    }
    if (textLower.includes('€') || textLower.includes('eur') || textLower.includes('euros')) {
      return 'EUR';
    }
    if (textLower.includes('£') || textLower.includes('gbp') || textLower.includes('pounds')) {
      return 'GBP';
    }
    if (textLower.includes('¥') || textLower.includes('jpy') || textLower.includes('yen')) {
      return 'JPY';
    }

    return 'USD'; // Default
  }

  private extractCompanyNameFromText(text: string): string | undefined {
    // Try to extract company name from the beginning of the document
    const lines = text.split('\n').filter(line => line.trim().length > 0);

    if (lines.length === 0) return undefined;

    // Look for company name patterns in first few lines
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();

      // Skip common headers
      const skipPatterns = [
        /^(financial|consolidated|annual|quarterly|statement)/i,
        /^(balance|income|cash)/i,
        /^(for the|as of|year ended)/i,
        /^\d{4}/,
        /^(page)/i
      ];

      if (skipPatterns.some(pattern => pattern.test(line))) {
        continue;
      }

      // Potential company name criteria
      if (line.length > 3 && line.length < 100 &&
          !line.toLowerCase().includes('financial') &&
          !line.toLowerCase().includes('statement') &&
          !line.toLowerCase().includes('report') &&
          !line.includes('$') && !line.includes(',') &&
          !/^\d+$/.test(line)) {

        // Clean up the line
        const cleaned = line.replace(/[^a-zA-Z0-9\s&\-\.\,]/g, '').trim();
        if (cleaned.length > 5) {
          return cleaned;
        }
      }
    }

    return undefined;
  }

  private extractPeriodInfoFromText(text: string): { periodEndDate?: Date; fiscalYear?: number } {
    const result: { periodEndDate?: Date; fiscalYear?: number } = {};

    // Date patterns to look for
    const datePatterns = [
      /(?:year|fiscal year|fy)\s*(?:ended|ending)?\s*(\d{4})/i,
      /(?:as\s*of|for\s*the\s*period\s*ending)\s*([a-zA-Z]+\s*\d{1,2},?\s*\d{4})/i,
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
      /([a-zA-Z]+\s+\d{1,2},?\s+\d{4})/
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        const dateStr = match[1] || match[0];
        const date = new Date(dateStr);

        if (!isNaN(date.getTime())) {
          result.periodEndDate = date;
          result.fiscalYear = date.getFullYear();
          return result;
        }

        // If it's just a year
        const yearMatch = dateStr.match(/\d{4}/);
        if (yearMatch) {
          result.fiscalYear = parseInt(yearMatch[0]);
        }
      }
    }

    return result;
  }

  private async parseBalanceSheetFromText(
    text: string,
    periodInfo: { periodEndDate?: Date; fiscalYear?: number },
    warnings: any[]
  ): Promise<FinancialStatement> {
    const items = await this.extractFinancialItemsFromText(text, warnings);
    const periodEndDate = periodInfo.periodEndDate || new Date();
    const fiscalYear = periodInfo.fiscalYear || periodEndDate.getFullYear();

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

  private async parseIncomeStatementFromText(
    text: string,
    periodInfo: { periodEndDate?: Date; fiscalYear?: number },
    warnings: any[]
  ): Promise<FinancialStatement> {
    const items = await this.extractFinancialItemsFromText(text, warnings);
    const periodEndDate = periodInfo.periodEndDate || new Date();
    const fiscalYear = periodInfo.fiscalYear || periodEndDate.getFullYear();

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

  private async parseCashFlowFromText(
    text: string,
    periodInfo: { periodEndDate?: Date; fiscalYear?: number },
    warnings: any[]
  ): Promise<FinancialStatement> {
    const items = await this.extractFinancialItemsFromText(text, warnings);
    const periodEndDate = periodInfo.periodEndDate || new Date();
    const fiscalYear = periodInfo.fiscalYear || periodEndDate.getFullYear();

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

  private async parseGenericFinancialText(
    text: string,
    periodInfo: { periodEndDate?: Date; fiscalYear?: number },
    warnings: any[]
  ): Promise<FinancialStatement> {
    const items = await this.extractFinancialItemsFromText(text, warnings);
    const periodEndDate = periodInfo.periodEndDate || new Date();
    const fiscalYear = periodInfo.fiscalYear || periodEndDate.getFullYear();

    return {
      type: REPORT_TYPES.UNKNOWN,
      periodEndDate,
      fiscalYear,
      items
    };
  }

  private async extractFinancialItemsFromText(text: string, warnings: any[]): Promise<FinancialItem[]> {
    const items: FinancialItem[] = [];
    const lines = text.split('\n');

    // Financial item patterns
    const financialPatterns = [
      // Pattern: Line item followed by number on same line
      /^(.+?)\s*[\$]?\s*\(?\s*([\d,]+\.\d{2}|\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+)\s*\)?\s*$/i,
      // Pattern: Line item with amount after multiple spaces
      /^(.+?)\s{3,}[\$]?\s*\(?\s*([\d,]+\.\d{2}|\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+)\s*\)?\s*$/i,
      // Pattern: Amount followed by line item
      /^[\$]?\s*\(?\s*([\d,]+\.\d{2}|\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+)\s*\)?\s+(.+?)\s*$/i
    ];

    // Common financial line items
    const commonLineItems = [
      'cash and cash equivalents', 'accounts receivable', 'inventory', 'total assets',
      'accounts payable', 'short-term debt', 'long-term debt', 'total liabilities',
      'shareholders\' equity', 'retained earnings', 'common stock',
      'revenue', 'sales', 'gross profit', 'operating income', 'net income',
      'cost of goods sold', 'operating expenses',
      'operating cash flow', 'investing cash flow', 'financing cash flow',
      'total current assets', 'total current liabilities', 'total non-current assets',
      'total non-current liabilities', 'property, plant and equipment', 'goodwill',
      'intangible assets', 'accumulated depreciation'
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and headers
      if (line.length === 0 ||
          line.toLowerCase().includes('financial') ||
          line.toLowerCase().includes('statement') ||
          line.toLowerCase().includes('page') ||
          /^\d+$/.test(line)) {
        continue;
      }

      // Try to extract financial items using patterns
      for (const pattern of financialPatterns) {
        const match = line.match(pattern);
        if (match) {
          let concept: string;
          let valueStr: string;

          if (match[1] && parseFloat(match[1].replace(/,/g, ''))) {
            // Amount first pattern
            valueStr = match[1];
            concept = match[2].trim();
          } else {
            // Concept first pattern
            concept = match[1].trim();
            valueStr = match[2];
          }

          // Clean up the concept
          concept = concept.replace(/[^a-zA-Z0-9\s&\-\.\']/g, ' ').replace(/\s+/g, ' ').trim();

          // Skip if concept doesn't look like a financial line item
          if (concept.length < 3 || concept.length > 100) continue;

          // Check if it's a common line item or has financial characteristics
          const isCommonItem = commonLineItems.some(item => concept.toLowerCase().includes(item.toLowerCase()));
          const looksFinancial = concept.toLowerCase().includes('total') ||
                               concept.toLowerCase().includes('cash') ||
                               concept.toLowerCase().includes('assets') ||
                               concept.toLowerCase().includes('liabilities') ||
                               concept.toLowerCase().includes('equity') ||
                               concept.toLowerCase().includes('income') ||
                               concept.toLowerCase().includes('expense') ||
                               concept.toLowerCase().includes('revenue') ||
                               concept.toLowerCase().includes('cost');

          if (isCommonItem || looksFinancial || concept.length > 10) {
            try {
              const value = this.parseFinancialValue(valueStr);
              if (value !== null) {
                items.push({
                  concept,
                  value,
                  unit: 'USD',
                  sourceReference: this.generateSourceReference(concept, i, undefined),
                  confidence: 70 // PDF parsing has lower confidence
                });
              }
            } catch (error) {
              warnings.push({
                code: 'VALUE_PARSE_ERROR',
                message: `Failed to parse value "${valueStr}" for concept "${concept}"`,
                line: i + 1,
                severity: 'low'
              });
            }
          }
        }
      }
    }

    return items;
  }

  private parseFinancialValue(valueStr: string): number | null {
    // Remove common formatting characters
    let cleanValue = valueStr.replace(/[$,]/g, '').trim();

    // Handle parentheses for negative numbers
    if (cleanValue.startsWith('(') && cleanValue.endsWith(')')) {
      cleanValue = '-' + cleanValue.slice(1, -1);
    } else if (cleanValue.endsWith(')')) {
      cleanValue = '-' + cleanValue.replace('(', '');
    }

    // Remove leading/trailing spaces
    cleanValue = cleanValue.trim();

    // Try to parse as number
    const parsed = parseFloat(cleanValue);
    if (!isNaN(parsed)) {
      return parsed;
    }

    return null;
  }
}