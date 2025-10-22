import { BaseParser } from './BaseParser';
import { FinancialData, FinancialStatement, FinancialItem, ValidationResult, FILE_TYPES, REPORT_TYPES } from './types';

export class XbrlParser extends BaseParser {
  constructor() {
    super('1.0.0', [FILE_TYPES.XBRL, FILE_TYPES.XML]);
  }

  async parse(buffer: Buffer, fileName: string): Promise<FinancialData> {
    const startTime = Date.now();
    const warnings: any[] = [];
    const errors: any[] = [];

    try {
      const xbrlText = buffer.toString('utf-8');
      const financialData = await this.parseXBRLDocument(xbrlText, fileName, warnings);

      const processingTime = Date.now() - startTime;

      return {
        documentInfo: {
          fileName,
          fileType: FILE_TYPES.XBRL,
          originalName: fileName,
          fileSize: buffer.length,
          currency: financialData.currency || 'USD',
          reportType: financialData.reportType || REPORT_TYPES.UNKNOWN,
          companyName: financialData.companyName
        },
        financialStatements: financialData.statements,
        metadata: this.createProcessingMetadata(processingTime, warnings, errors)
      };

    } catch (error) {
      errors.push({
        code: 'XBRL_PARSE_ERROR',
        message: `Failed to parse XBRL file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'critical' as const
      });

      const processingTime = Date.now() - startTime;

      return {
        documentInfo: {
          fileName,
          fileType: FILE_TYPES.XBRL,
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

    if (!data || typeof data !== 'string') {
      errors.push(this.createValidationError('data', 'XBRL data must be a string'));
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

    // Basic XML validation
    if (!data.trim().startsWith('<') || !data.trim().endsWith('>')) {
      errors.push(this.createValidationError('data', 'Data does not appear to be valid XML'));
    }

    // Check for XBRL-specific elements
    if (!data.includes('xbrl') && !data.includes('XBRL')) {
      warnings.push(this.createValidationWarning('data', 'Document does not contain XBRL elements'));
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        totalRecords: 1,
        validRecords: errors.length === 0 ? 1 : 0,
        invalidRecords: errors.length > 0 ? 1 : 0,
        processingTime: 0
      }
    };
  }

  private async parseXBRLDocument(
    xbrlText: string,
    fileName: string,
    warnings: any[]
  ): Promise<{ statements: FinancialStatement[]; currency: string; reportType: string; companyName?: string }> {

    // This is a simplified XBRL parser - in production, you'd want to use a proper XBRL library
    const companyName = this.extractCompanyNameFromXBRL(xbrlText);
    const currency = this.extractCurrencyFromXBRL(xbrlText) || 'USD';

    // Extract financial items from XBRL
    const financialItems = await this.extractFinancialItemsFromXBRL(xbrlText, warnings);

    // Group items by context (period) and statement type
    const statementGroups = this.groupItemsByContextAndType(financialItems);

    // Convert to FinancialStatement objects
    const statements = await this.convertGroupsToStatements(statementGroups, warnings);

    // Determine overall report type
    const reportType = this.determineReportTypeFromStatements(statements);

    return {
      statements,
      currency,
      reportType,
      companyName
    };
  }

  private extractCompanyNameFromXBRL(xbrlText: string): string | undefined {
    // Look for company name in various XBRL contexts
    const patterns = [
      /<identifier[^>]*>([^<]+)<\/identifier>/i,
      /<entity[^>]*>[\s\S]*?<identifier[^>]*>([^<]+)<\/identifier>[\s\S]*?<\/entity>/i,
      /<dei:EntityRegistrantName[^>]*>([^<]+)<\/dei:EntityRegistrantName>/i,
      /<us-gaap:RegistrantName[^>]*>([^<]+)<\/us-gaap:RegistrantName>/i
    ];

    for (const pattern of patterns) {
      const match = xbrlText.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (name.length > 2 && name.length < 200) {
          return name;
        }
      }
    }

    return undefined;
  }

  private extractCurrencyFromXBRL(xbrlText: string): string | undefined {
    // Look for currency in XBRL contexts
    const patterns = [
      /<unit[^>]*>[\s\S]*?<measure>iso4217:([A-Z]{3})<\/measure>[\s\S]*?<\/unit>/i,
      /<xbrli:unit[^>]*>[\s\S]*?<xbrli:measure>iso4217:([A-Z]{3})<\/xbrli:measure>[\s\S]*?<\/xbrli:unit>/i
    ];

    for (const pattern of patterns) {
      const match = xbrlText.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return undefined;
  }

  private async extractFinancialItemsFromXBRL(
    xbrlText: string,
    warnings: any[]
  ): Promise<Array<{
    concept: string;
    value: string | number;
    context: string;
    unit?: string;
    decimals?: number;
    isNil?: boolean;
  }>> {

    const items: Array<{
      concept: string;
      value: string | number;
      context: string;
      unit?: string;
      decimals?: string;
      isNil?: boolean;
    }> = [];

    // Extract XBRL facts (elements with values)
    const factPattern = /<([a-zA-Z][a-zA-Z0-9:_-]*)[^>]*contextRef="([^"]*)"[^>]*>(?:<span>)?([^<]*)(?:<\/span>)?<\/\1>/g;

    let match;
    while ((match = factPattern.exec(xbrlText)) !== null) {
      const [, elementName, contextRef, rawValue] = match;

      // Skip metadata and non-financial elements
      if (this.isNonFinancialElement(elementName)) {
        continue;
      }

      const cleanValue = this.cleanXBRLValue(rawValue);
      const isNil = rawValue.toLowerCase().includes('nil') || cleanValue === null;
      const decimals = this.extractDecimalsAttribute(xbrlText, elementName, contextRef);

      items.push({
        concept: elementName,
        value: cleanValue,
        context: contextRef,
        decimals: decimals,
        isNil
      });
    }

    // Extract elements with unitRef
    const unitRefPattern = /<([a-zA-Z][a-zA-Z0-9:_-]*)[^>]*contextRef="([^"]*)"[^>]*unitRef="([^"]*)"[^>]*>(?:<span>)?([^<]*)(?:<\/span>)?<\/\1>/g;

    while ((match = unitRefPattern.exec(xbrlText)) !== null) {
      const [, elementName, contextRef, unitRef, rawValue] = match;

      if (this.isNonFinancialElement(elementName)) {
        continue;
      }

      const cleanValue = this.cleanXBRLValue(rawValue);
      const isNil = rawValue.toLowerCase().includes('nil') || cleanValue === null;
      const decimals = this.extractDecimalsAttribute(xbrlText, elementName, contextRef);
      const unit = this.resolveUnitFromRef(xbrlText, unitRef);

      // Update existing item or add new one
      const existingIndex = items.findIndex(item =>
        item.concept === elementName && item.context === contextRef
      );

      if (existingIndex >= 0) {
        items[existingIndex].unit = unit;
      } else {
        items.push({
          concept: elementName,
          value: cleanValue,
          context: contextRef,
          unit,
          decimals,
          isNil
        });
      }
    }

    return items;
  }

  private isNonFinancialElement(elementName: string): boolean {
    const nonFinancialPrefixes = [
      'xbrli:', 'xbrldi:', 'link:', 'xlink:', 'dei:', 'custom:',
      'calc:', 'def:', 'label:', 'pres:', 'ref:', 'gen:'
    ];

    return nonFinancialPrefixes.some(prefix => elementName.startsWith(prefix));
  }

  private cleanXBRLValue(rawValue: string): number | string | null {
    if (!rawValue || rawValue.trim() === '') {
      return null;
    }

    const cleaned = rawValue.trim().replace(/,/g, '');

    // Handle nil values
    if (cleaned.toLowerCase().includes('nil') || cleaned === 'xbrl:nil') {
      return null;
    }

    // Handle boolean values
    if (cleaned.toLowerCase() === 'true') return true;
    if (cleaned.toLowerCase() === 'false') return false;

    // Try to parse as number
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed)) {
      return parsed;
    }

    return cleaned;
  }

  private extractDecimalsAttribute(xbrlText: string, elementName: string, contextRef: string): string | undefined {
    // Look for decimals attribute in the original element
    const pattern = new RegExp(`<${elementName}[^>]*contextRef="${contextRef}"[^>]*decimals="([^"]*)"[^>]*>`, 'i');
    const match = xbrlText.match(pattern);
    return match ? match[1] : undefined;
  }

  private resolveUnitFromRef(xbrlText: string, unitRef: string): string | undefined {
    // Resolve unit reference to actual unit
    const pattern = new RegExp(`<xbrli:unit[^>]*id="${unitRef}"[^>]*>[\\s\\S]*?<xbrli:measure>([^<]+)</xbrli:measure>[\\s\\S]*?</xbrli:unit>`, 'i');
    const match = xbrlText.match(pattern);

    if (match && match[1]) {
      const measure = match[1];
      // Extract ISO 4217 currency code
      const currencyMatch = measure.match(/iso4217:([A-Z]{3})/i);
      return currencyMatch ? currencyMatch[1] : measure;
    }

    return undefined;
  }

  private groupItemsByContextAndType(items: Array<{
    concept: string;
    value: string | number;
    context: string;
    unit?: string;
    decimals?: string;
    isNil?: boolean;
  }>): Map<string, Array<{
    concept: string;
    value: string | number;
    unit?: string;
    decimals?: string;
    isNil?: boolean;
  }>> {

    const grouped = new Map<string, Array<any>>();

    for (const item of items) {
      if (!grouped.has(item.context)) {
        grouped.set(item.context, []);
      }
      grouped.get(item.context)!.push({
        concept: item.concept,
        value: item.value,
        unit: item.unit,
        decimals: item.decimals,
        isNil: item.isNil
      });
    }

    return grouped;
  }

  private async convertGroupsToStatements(
    statementGroups: Map<string, Array<any>>,
    warnings: any[]
  ): Promise<FinancialStatement[]> {
    const statements: FinancialStatement[] = [];

    for (const [context, items] of statementGroups) {
      try {
        const periodInfo = this.extractPeriodFromContext(context);
        const statementType = this.determineStatementTypeFromItems(items);

        const financialItems: FinancialItem[] = items.map((item, index) => ({
          concept: item.concept,
          value: item.value,
          unit: item.unit || 'USD',
          decimals: item.decimals ? parseInt(item.decimals) : undefined,
          isNil: item.isNil || false,
          sourceReference: `${context}_${index}`,
          confidence: 98, // XBRL parsing has very high confidence
          taxonomyMatch: {
            xbrlTag: item.concept,
            taxonomyFramework: this.detectTaxonomyFramework(item.concept),
            confidence: 100,
            mappingMethod: 'exact_match' as const,
            synonyms: []
          }
        }));

        statements.push({
          type: statementType,
          periodEndDate: periodInfo.endDate,
          fiscalYear: periodInfo.fiscalYear,
          items: financialItems,
          metadata: {
            framework: this.detectTaxonomyFramework(items[0]?.concept),
            auditStatus: 'audited' // XBRL files are typically audited
          }
        });
      } catch (error) {
        warnings.push({
          code: 'STATEMENT_PARSE_ERROR',
          message: `Failed to parse statement for context ${context}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'medium'
        });
      }
    }

    return statements;
  }

  private extractPeriodFromContext(context: string): { endDate: Date; fiscalYear: number } {
    // Default to current date if context can't be parsed
    const now = new Date();

    try {
      // Look for date patterns in context
      const datePattern = /(\d{4})-(\d{2})-(\d{2})/;
      const match = context.match(datePattern);

      if (match) {
        const [, year, month, day] = match;
        const endDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        return {
          endDate,
          fiscalYear: endDate.getFullYear()
        };
      }
    } catch (error) {
      // If parsing fails, use current date
    }

    return {
      endDate: now,
      fiscalYear: now.getFullYear()
    };
  }

  private determineStatementTypeFromItems(items: Array<any>): string {
    if (items.length === 0) return REPORT_TYPES.UNKNOWN;

    const concepts = items.map(item => item.concept.toLowerCase());
    const allConcepts = concepts.join(' ');

    const balanceSheetKeywords = ['asset', 'liability', 'equity', 'cash', 'receivable', 'payable'];
    const incomeKeywords = ['revenue', 'income', 'sales', 'expense', 'profit', 'cost', 'earnings'];
    const cashFlowKeywords = ['cashflow', 'cash flow', 'operating', 'investing', 'financing'];

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

  private detectTaxonomyFramework(concept?: string): 'US-GAAP' | 'IFRS' | 'Other' {
    if (!concept) return 'US-GAAP';

    if (concept.includes('us-gaap:') || concept.includes('USGAAP_')) {
      return 'US-GAAP';
    } else if (concept.includes('ifrs:') || concept.includes('IFRS_')) {
      return 'IFRS';
    } else if (concept.includes('dei:')) {
      return 'US-GAAP'; // DEI is typically US-GAAP
    }

    return 'US-GAAP'; // Default assumption
  }

  private determineReportTypeFromStatements(statements: FinancialStatement[]): string {
    if (statements.length === 1) {
      return statements[0].type;
    }

    const types = statements.map(s => s.type);
    if (types.includes(REPORT_TYPES.BALANCE_SHEET)) return REPORT_TYPES.BALANCE_SHEET;
    if (types.includes(REPORT_TYPES.INCOME_STATEMENT)) return REPORT_TYPES.INCOME_STATEMENT;
    if (types.includes(REPORT_TYPES.CASH_FLOW)) return REPORT_TYPES.CASH_FLOW;

    return REPORT_TYPES.UNKNOWN;
  }
}