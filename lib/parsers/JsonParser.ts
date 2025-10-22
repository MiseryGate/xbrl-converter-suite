import { BaseParser } from './BaseParser';
import { FinancialData, FinancialStatement, FinancialItem, ValidationResult, FILE_TYPES, REPORT_TYPES } from './types';

export class JsonParser extends BaseParser {
  constructor() {
    super('1.0.0', [FILE_TYPES.JSON]);
  }

  async parse(buffer: Buffer, fileName: string): Promise<FinancialData> {
    const startTime = Date.now();
    const warnings: any[] = [];
    const errors: any[] = [];

    try {
      const jsonText = buffer.toString('utf-8');
      const jsonData = JSON.parse(jsonText);

      const financialData = await this.convertToFinancialData(jsonData, fileName, warnings);

      const processingTime = Date.now() - startTime;

      return {
        documentInfo: {
          fileName,
          fileType: FILE_TYPES.JSON,
          originalName: fileName,
          fileSize: buffer.length,
          currency: financialData.currency || 'USD',
          reportType: financialData.reportType || REPORT_TYPES.UNKNOWN,
          companyName: jsonData.companyName || jsonData.company
        },
        financialStatements: financialData.statements,
        metadata: this.createProcessingMetadata(processingTime, warnings, errors)
      };

    } catch (error) {
      errors.push({
        code: 'JSON_PARSE_ERROR',
        message: `Failed to parse JSON file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'critical' as const
      });

      const processingTime = Date.now() - startTime;

      return {
        documentInfo: {
          fileName,
          fileType: FILE_TYPES.JSON,
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

    if (!data || typeof data !== 'object') {
      errors.push(this.createValidationError('data', 'JSON data must be a valid object'));
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

    if (Array.isArray(data)) {
      warnings.push(this.createValidationWarning('data', 'JSON data is an array, expected object'));
    }

    // Validate that it has some financial-like structure
    const keys = Object.keys(data);
    if (keys.length === 0) {
      warnings.push(this.createValidationWarning('data', 'JSON object is empty'));
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        totalRecords: 1,
        validRecords: keys.length > 0 ? 1 : 0,
        invalidRecords: keys.length === 0 ? 1 : 0,
        processingTime: 0
      }
    };
  }

  private async convertToFinancialData(
    jsonData: any,
    fileName: string,
    warnings: any[]
  ): Promise<{ statements: FinancialStatement[]; currency: string; reportType: string }> {

    // Detect JSON structure type and parse accordingly
    if (this.isStandardFinancialJson(jsonData)) {
      return this.parseStandardFinancialJson(jsonData, warnings);
    } else if (this.isStatementArrayJson(jsonData)) {
      return this.parseStatementArrayJson(jsonData, warnings);
    } else if (this.isFlatFinancialJson(jsonData)) {
      return this.parseFlatFinancialJson(jsonData, warnings);
    } else {
      // Try to parse as generic JSON
      return this.parseGenericJson(jsonData, warnings);
    }
  }

  private isStandardFinancialJson(data: any): boolean {
    // Check for standard financial JSON structure
    return data &&
           (data.financialStatements || data.statements || data.balanceSheet ||
            data.incomeStatement || data.cashFlowStatement);
  }

  private isStatementArrayJson(data: any): boolean {
    // Check if it's an array of statements
    return Array.isArray(data) &&
           data.length > 0 &&
           data[0] &&
           (data[0].type || data[0].statementType || data[0].items);
  }

  private isFlatFinancialJson(data: any): boolean {
    // Check if it's a flat structure with financial data
    if (!data || typeof data !== 'object') return false;

    const keys = Object.keys(data).map(k => k.toLowerCase());
    const financialKeywords = [
      'assets', 'liabilities', 'equity', 'revenue', 'income', 'cash',
      'expenses', 'cost', 'profit', 'sales'
    ];

    return financialKeywords.some(keyword => keys.some(key => key.includes(keyword)));
  }

  private async parseStandardFinancialJson(
    data: any,
    warnings: any[]
  ): Promise<{ statements: FinancialStatement[]; currency: string; reportType: string }> {
    const statements: FinancialStatement[] = [];
    const currency = data.currency || data.unit || 'USD';

    // Parse individual statement types
    if (data.balanceSheet || data.statements?.balanceSheet) {
      const balanceSheetData = data.balanceSheet || data.statements.balanceSheet;
      statements.push(await this.parseStatementFromJson(balanceSheetData, REPORT_TYPES.BALANCE_SHEET, warnings));
    }

    if (data.incomeStatement || data.statements?.incomeStatement) {
      const incomeData = data.incomeStatement || data.statements.incomeStatement;
      statements.push(await this.parseStatementFromJson(incomeData, REPORT_TYPES.INCOME_STATEMENT, warnings));
    }

    if (data.cashFlowStatement || data.statements?.cashFlowStatement) {
      const cashFlowData = data.cashFlowStatement || data.statements.cashFlowStatement;
      statements.push(await this.parseStatementFromJson(cashFlowData, REPORT_TYPES.CASH_FLOW, warnings));
    }

    // Generic statements array
    if (data.financialStatements || data.statements) {
      const statementsArray = data.financialStatements || data.statements;
      if (Array.isArray(statementsArray)) {
        for (const statement of statementsArray) {
          if (statement.type && statement.items) {
            statements.push(await this.parseStatementFromJson(statement, statement.type, warnings));
          }
        }
      }
    }

    // Determine overall report type
    const reportType = this.determineReportType(statements);

    return { statements, currency, reportType };
  }

  private async parseStatementArrayJson(
    data: any[],
    warnings: any[]
  ): Promise<{ statements: FinancialStatement[]; currency: string; reportType: string }> {
    const statements: FinancialStatement[] = [];
    let currency = 'USD';

    for (const statementData of data) {
      const statementType = statementData.type || statementData.statementType || REPORT_TYPES.UNKNOWN;
      statements.push(await this.parseStatementFromJson(statementData, statementType, warnings));

      if (statementData.currency) {
        currency = statementData.currency;
      }
    }

    const reportType = this.determineReportType(statements);

    return { statements, currency, reportType };
  }

  private async parseFlatFinancialJson(
    data: any,
    warnings: any[]
  ): Promise<{ statements: FinancialStatement[]; currency: string; reportType: string }> {
    const items: FinancialItem[] = [];
    const currency = data.currency || this.detectCurrencyFromFlatData(data) || 'USD';
    const periodEndDate = this.extractDateFromData(data) || new Date();
    const fiscalYear = periodEndDate.getFullYear();

    // Convert flat JSON to financial items
    for (const [key, value] of Object.entries(data)) {
      if (key !== 'currency' && key !== 'date' && key !== 'period' && key !== 'companyName') {
        const item = await this.createFinancialItemFromJsonValue(key, value, 0, warnings);
        if (item) {
          items.push(item);
        }
      }
    }

    // Determine statement type from items
    const reportType = this.determineReportTypeFromItems(items);

    const statement: FinancialStatement = {
      type: reportType,
      periodEndDate,
      fiscalYear,
      items,
      metadata: {
        framework: 'US-GAAP'
      }
    };

    return { statements: [statement], currency, reportType };
  }

  private async parseGenericJson(
    data: any,
    warnings: any[]
  ): Promise<{ statements: FinancialStatement[]; currency: string; reportType: string }> {
    const statements: FinancialStatement[] = [];
    const currency = 'USD';
    const periodEndDate = new Date();
    const fiscalYear = periodEndDate.getFullYear();

    // Try to extract any financial-like data
    const items = await this.extractFinancialItemsFromGenericJson(data, warnings);

    if (items.length > 0) {
      const reportType = this.determineReportTypeFromItems(items);

      statements.push({
        type: reportType,
        periodEndDate,
        fiscalYear,
        items,
        metadata: {
          framework: 'US-GAAP'
        }
      });
    }

    return { statements, currency, reportType: REPORT_TYPES.UNKNOWN };
  }

  private async parseStatementFromJson(
    statementData: any,
    statementType: string,
    warnings: any[]
  ): Promise<FinancialStatement> {
    const items: FinancialItem[] = [];
    const periodEndDate = this.extractDateFromStatement(statementData) || new Date();
    const fiscalYear = periodEndDate.getFullYear();

    // Extract items from various JSON structures
    if (statementData.items && Array.isArray(statementData.items)) {
      for (let i = 0; i < statementData.items.length; i++) {
        const itemData = statementData.items[i];
        const item = await this.parseFinancialItemFromJsonItem(itemData, i, warnings);
        if (item) {
          items.push(item);
        }
      }
    } else if (statementData.lineItems && Array.isArray(statementData.lineItems)) {
      for (let i = 0; i < statementData.lineItems.length; i++) {
        const itemData = statementData.lineItems[i];
        const item = await this.parseFinancialItemFromJsonItem(itemData, i, warnings);
        if (item) {
          items.push(item);
        }
      }
    } else {
      // Flat structure within statement
      for (const [key, value] of Object.entries(statementData)) {
        if (key !== 'type' && key !== 'currency' && key !== 'date' && key !== 'period' &&
            key !== 'fiscalYear' && key !== 'metadata' && key !== 'framework') {
          const item = await this.createFinancialItemFromJsonValue(key, value, 0, warnings);
          if (item) {
            items.push(item);
          }
        }
      }
    }

    return {
      type: statementType as any,
      periodEndDate,
      fiscalYear,
      items,
      metadata: {
        framework: statementData.framework || statementData.taxonomy || 'US-GAAP',
        auditStatus: statementData.auditStatus,
        consolidationLevel: statementData.consolidationLevel,
        presentationFormat: statementData.presentationFormat
      }
    };
  }

  private async parseFinancialItemFromJsonItem(
    itemData: any,
    index: number,
    warnings: any[]
  ): Promise<FinancialItem | null> {
    try {
      // Handle different item structures
      let concept: string;
      let value: any;
      let unit: string = 'USD';
      let decimals?: number;
      let isNil = false;

      if (typeof itemData === 'object' && itemData !== null) {
        concept = itemData.concept || itemData.name || itemData.label || itemData.description || '';
        value = itemData.value || itemData.amount || itemData.number;
        unit = itemData.unit || itemData.currency || 'USD';
        decimals = itemData.decimals;
        isNil = itemData.isNil || itemData.nil || false;
      } else {
        // Simple key-value pair
        return null; // These are handled by createFinancialItemFromJsonValue
      }

      if (!concept || value === null || value === undefined) {
        return null;
      }

      const sanitizedValue = this.sanitizeValue(value);

      return {
        concept: concept.trim(),
        value: sanitizedValue,
        unit,
        decimals,
        isNil,
        sourceReference: this.generateSourceReference(concept, index),
        confidence: 95 // JSON parsing typically has high confidence
      };
    } catch (error) {
      warnings.push({
        code: 'ITEM_PARSE_ERROR',
        message: `Failed to parse JSON item at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        index,
        severity: 'low'
      });
      return null;
    }
  }

  private async createFinancialItemFromJsonValue(
    concept: string,
    value: any,
    row: number,
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
        unit: 'USD',
        sourceReference: this.generateSourceReference(concept, row),
        confidence: 90
      };
    } catch (error) {
      warnings.push({
        code: 'ITEM_PARSE_ERROR',
        message: `Failed to parse item ${concept}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        row,
        severity: 'low'
      });
      return null;
    }
  }

  private async extractFinancialItemsFromGenericJson(
    data: any,
    warnings: any[]
  ): Promise<FinancialItem[]> {
    const items: FinancialItem[] = [];

    function extractFromObject(obj: any, prefix: string = ''): void {
      if (typeof obj !== 'object' || obj === null) return;

      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (typeof value === 'number' ||
            (typeof value === 'string' && !isNaN(parseFloat(value.replace(/[$,]/g, ''))))) {
          // This looks like a financial value
          items.push({
            concept: key.trim(),
            value: typeof value === 'string' ? parseFloat(value.replace(/[$,]/g, '')) : value,
            unit: 'USD',
            sourceReference: fullKey,
            confidence: 60
          });
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          // Recursively explore nested objects
          extractFromObject(value, fullKey);
        }
      }
    }

    extractFromObject(data);
    return items;
  }

  private extractDateFromStatement(statementData: any): Date | undefined {
    if (statementData.date) return new Date(statementData.date);
    if (statementData.periodEndDate) return new Date(statementData.periodEndDate);
    if (statementData.asOf) return new Date(statementData.asOf);
    if (statementData.periodEnd) return new Date(statementData.periodEnd);
    return undefined;
  }

  private extractDateFromData(data: any): Date | undefined {
    for (const key of ['date', 'periodEndDate', 'asOf', 'reportDate', 'fiscalYearEnd']) {
      if (data[key]) {
        const date = new Date(data[key]);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
    return undefined;
  }

  private detectCurrencyFromFlatData(data: any): string | undefined {
    // Try to detect currency from the data
    for (const [key, value] of Object.entries(data)) {
      if (key.toLowerCase().includes('currency') && typeof value === 'string') {
        return value.toUpperCase();
      }
    }
    return undefined;
  }

  private determineReportType(statements: FinancialStatement[]): string {
    if (statements.length === 1) {
      return statements[0].type;
    }

    // If multiple statements, determine primary type
    const types = statements.map(s => s.type);
    if (types.includes(REPORT_TYPES.BALANCE_SHEET)) return REPORT_TYPES.BALANCE_SHEET;
    if (types.includes(REPORT_TYPES.INCOME_STATEMENT)) return REPORT_TYPES.INCOME_STATEMENT;
    if (types.includes(REPORT_TYPES.CASH_FLOW)) return REPORT_TYPES.CASH_FLOW;

    return REPORT_TYPES.UNKNOWN;
  }

  private determineReportTypeFromItems(items: FinancialItem[]): string {
    const concepts = items.map(item => item.concept.toLowerCase());
    const allConcepts = concepts.join(' ');

    const balanceSheetKeywords = ['assets', 'liabilities', 'equity', 'cash', 'receivables', 'payables'];
    const incomeKeywords = ['revenue', 'income', 'sales', 'expense', 'profit', 'cost'];
    const cashFlowKeywords = ['cash flow', 'operating', 'investing', 'financing'];

    const balanceSheetScore = balanceSheetKeywords.filter(kw => allConcepts.includes(kw)).length;
    const incomeScore = incomeKeywords.filter(kw => allConcepts.includes(kw)).length;
    const cashFlowScore = cashFlowKeywords.filter(kw => allConcepts.includes(kw)).length;

    if (balanceSheetScore >= incomeScore && balanceSheetScore >= cashFlowScore && balanceSheetScore > 0) {
      return REPORT_TYPES.BALANCE_SHEET;
    } else if (incomeScore >= cashFlowScore && incomeScore > 0) {
      return REPORT_TYPES.INCOME_STATEMENT;
    } else if (cashFlowScore > 0) {
      return REPORT_TYPES.CASH_FLOW;
    }

    return REPORT_TYPES.UNKNOWN;
  }
}