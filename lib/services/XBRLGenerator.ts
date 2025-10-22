import { create } from 'xmlbuilder2';
import { FinancialStatement, FinancialItem, XBRLContext, TaxonomyFramework } from '../parsers/types';

export interface XBRLGenerationOptions {
  taxonomyFramework: TaxonomyFramework;
  currency: string;
  documentLanguage?: string;
  documentDate: Date;
  companyName: string;
  identifier?: string;
  scheme?: string;
}

export interface GeneratedXBRL {
  xbrlDocument: string;
  metadata: {
    totalFacts: number;
    frameworks: string[];
    currencies: string[];
    contexts: string[];
    generatedAt: Date;
    validationIssues: string[];
  };
}

export class XBRLGenerator {
  private static readonly NAMESPACES = {
    'xbrli': 'http://www.xbrl.org/2003/instance',
    'link': 'http://www.xbrl.org/2003/linkbase',
    'xlink': 'http://www.w3.org/1999/xlink',
    'xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    'iso4217': 'http://www.xbrl.org/2003/iso4217',
    'us-gaap': 'http://xbrl.us/us-gaap/2009-01-31',
    'ifrs': 'http://xbrl.ifrs.org/taxonomy/2023-03-31/ifrs-full',
    'dei': 'http://xbrl.sec.gov/dei/2023-01-31'
  };

  async generateXBRL(
    statements: FinancialStatement[],
    options: XBRLGenerationOptions
  ): Promise<GeneratedXBRL> {

    const startTime = Date.now();
    const validationIssues: string[] = [];
    const contexts = new Set<string>();
    const frameworks = new Set<string>();

    try {
      // Create root element
      const root = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('xbrli:xbrl', XBRLGenerator.NAMESPACES);

      // Add schema references
      this.addSchemaReferences(root, options.taxonomyFramework);

      // Add context elements
      const contextMap = new Map<string, any>();
      for (const statement of statements) {
        const context = await this.createContextForStatement(statement, options);
        const contextId = this.generateContextId(statement);
        contextMap.set(contextId, context);
        contexts.add(contextId);
        root.importNode(context);
      }

      // Add unit definitions
      this.addUnitDefinitions(root, options.currency);

      // Add entity information
      this.addEntityInformation(root, options);

      // Add financial facts
      let totalFacts = 0;
      for (const statement of statements) {
        const contextId = this.generateContextId(statement);
        const facts = await this.createFinancialFacts(statement.items, contextId, options.currency);

        for (const fact of facts) {
          root.importNode(fact);
          totalFacts++;
        }

        frameworks.add(options.taxonomyFramework);
      }

      // Generate final XML
      const xbrlDocument = root.end({ prettyPrint: true });

      const metadata = {
        totalFacts,
        frameworks: Array.from(frameworks),
        currencies: [options.currency],
        contexts: Array.from(contexts),
        generatedAt: new Date(),
        validationIssues
      };

      console.log(`XBRL generation completed in ${Date.now() - startTime}ms`);

      return { xbrlDocument, metadata };

    } catch (error) {
      validationIssues.push(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return {
        xbrlDocument: '',
        metadata: {
          totalFacts: 0,
          frameworks: [],
          currencies: [],
          contexts: [],
          generatedAt: new Date(),
          validationIssues
        }
      };
    }
  }

  private addSchemaReferences(root: any, framework: TaxonomyFramework): void {
    const schemaMap = {
      'US-GAAP': [
        'http://xbrl.us/us-gaap/2009-01-31/us-gaap-2009-01-31.xsd',
        'http://xbrl.sec.gov/dei/2023-01-31/dei-2023-01-31.xsd'
      ],
      'IFRS': [
        'http://xbrl.ifrs.org/taxonomy/2023-03-31/ifrs-full-2023-03-31.xsd'
      ],
      'Other': [
        'http://www.xbrl.org/2003/xbrl-instance-2003-12-31.xsd'
      ]
    };

    const schemas = schemaMap[framework] || schemaMap['Other'];

    for (const schema of schemas) {
      root.ele('link:schemaRef', {
        'xlink:type': 'simple',
        'xlink:href': schema
      }).up();
    }
  }

  private async createContextForStatement(
    statement: FinancialStatement,
    options: XBRLGenerationOptions
  ): Promise<any> {

    const contextId = this.generateContextId(statement);
    const context = create('xbrli:context', { id: contextId });

    // Add entity
    const entity = context.ele('xbrli:entity');
    entity.ele('xbrli:identifier', {
      scheme: options.scheme || 'http://www.sec.gov/CIK'
    }).txt(options.identifier || 'UNKNOWN').up();
    entity.up();

    // Add period
    const period = context.ele('xbrli:period');

    if (statement.type === 'balance_sheet') {
      // Balance sheet uses instant period
      period.ele('xbrli:instant')
        .txt(this.formatDate(statement.periodEndDate))
        .up();
    } else {
      // Other statements use duration
      period.ele('xbrli:startDate')
        .txt(this.formatDate(this.getPeriodStartDate(statement)))
        .up();
      period.ele('xbrli:endDate')
        .txt(this.formatDate(statement.periodEndDate))
        .up();
    }
    period.up();

    return context;
  }

  private generateContextId(statement: FinancialStatement): string {
    const dateStr = statement.periodEndDate.toISOString().split('T')[0].replace(/-/g, '');
    const fiscalYear = statement.fiscalYear;
    const fiscalQuarter = statement.fiscalQuarter || '';

    return `AsOf_${dateStr}_${statement.type}_${fiscalYear}Q${fiscalQuarter}`;
  }

  private addUnitDefinitions(root: any, currency: string): void {
    // Add monetary unit
    const monetaryUnit = root.ele('xbrli:unit', { id: 'USD' });
    monetaryUnit.ele('xbrli:measure')
      .txt(`iso4217:${currency}`)
      .up();
    monetaryUnit.up();

    // Add pure unit (for non-monetary values)
    const pureUnit = root.ele('xbrli:unit', { id: 'pure' });
    pureUnit.ele('xbrli:measure')
      .txt('xbrli:pure')
      .up();
    pureUnit.up();
  }

  private addEntityInformation(root: any, options: XBRLGeneratorOptions): void {
    // Add document information
    if (options.companyName) {
      root.ele('dei:EntityRegistrantName', {
        'contextRef': this.generateDocumentContext(options)
      }).txt(options.companyName).up();
    }

    // Add document period
    root.ele('dei:DocumentPeriodEndDate', {
      'contextRef': this.generateDocumentContext(options)
    }).txt(this.formatDate(options.documentDate)).up();

    // Add currency information
    root.ele('dei:DocumentFiscalYearFocus', {
      'contextRef': this.generateDocumentContext(options)
    }).txt(options.documentDate.getFullYear().toString()).up();
  }

  private generateDocumentContext(options: XBRLGeneratorOptions): string {
    const dateStr = options.documentDate.toISOString().split('T')[0].replace(/-/g, '');
    return `Document_${dateStr}`;
  }

  private async createFinancialFacts(
    items: FinancialItem[],
    contextId: string,
    currency: string
  ): Promise<any[]> {

    const facts: any[] = [];

    for (const item of items) {
      try {
        const fact = this.createFinancialFact(item, contextId, currency);
        if (fact) {
          facts.push(fact);
        }
      } catch (error) {
        console.warn(`Failed to create fact for item ${item.concept}:`, error);
      }
    }

    return facts;
  }

  private createFinancialFact(item: FinancialItem, contextId: string, currency: string): any {
    if (item.isNil || item.value === null || item.value === undefined) {
      // Create nil fact
      const tagName = this.getXBRLTagName(item);
      if (!tagName) return null;

      return create(tagName, {
        'contextRef': contextId,
        'unitRef': 'USD',
        'xsi:nil': 'true'
      });
    }

    const tagName = this.getXBRLTagName(item);
    if (!tagName) return null;

    let unitRef = 'USD';
    let value = item.value;

    // Handle different data types
    if (typeof value === 'number') {
      value = this.formatNumberValue(value, item.decimals);
      unitRef = currency;
    } else if (typeof value === 'boolean') {
      value = value.toString();
      unitRef = 'pure';
    } else {
      // String value
      value = value.toString();
      unitRef = 'pure';
    }

    const fact = create(tagName, {
      'contextRef': contextId,
      'unitRef': unitRef
    });

    // Add precision/decimals if specified
    if (item.decimals !== undefined) {
      fact.att('decimals', item.decimals.toString());
    }

    fact.txt(value);
    return fact;
  }

  private getXBRLTagName(item: FinancialItem): string | null {
    // Use mapped XBRL tag if available
    if (item.taxonomyMatch && item.taxonomyMatch.xbrlTag) {
      return item.taxonomyMatch.xbrlTag;
    }

    // Try to construct tag from concept
    if (item.concept) {
      // Simple mapping - in production, this would be more sophisticated
      const cleanConcept = item.concept.replace(/[^a-zA-Z0-9]/g, '');
      return `us-gaap:${cleanConcept}`;
    }

    return null;
  }

  private formatNumberValue(value: number, decimals?: number): string {
    let numStr: string;

    if (decimals !== undefined) {
      if (decimals >= 0) {
        numStr = value.toFixed(decimals);
      } else {
        // Negative decimals indicate precision
        const divisor = Math.pow(10, Math.abs(decimals));
        numStr = (Math.round(value / divisor) * divisor).toString();
      }
    } else {
      // Default to 2 decimal places
      numStr = value.toFixed(2);
    }

    // Remove trailing zeros after decimal point
    if (numStr.includes('.')) {
      numStr = numStr.replace(/\.?0+$/, '');
    }

    return numStr;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private getPeriodStartDate(statement: FinancialStatement): Date {
    // Estimate start date based on fiscal year and quarter
    if (statement.fiscalQuarter) {
      const quarterMonths = [0, 3, 6, 9]; // Q1 starts in Jan, Q2 in Apr, etc.
      const startMonth = quarterMonths[statement.fiscalQuarter - 1] || 0;
      return new Date(statement.fiscalYear, startMonth, 1);
    }

    // Default to 12 months before end date
    const startDate = new Date(statement.periodEndDate);
    startDate.setFullYear(startDate.getFullYear() - 1);
    startDate.setDate(startDate.getDate() + 1);
    return startDate;
  }

  async validateXBRL(xbrlDocument: string): Promise<string[]> {
    const validationIssues: string[] = [];

    try {
      // Basic XML validation
      if (!xbrlDocument.startsWith('<?xml')) {
        validationIssues.push('Document does not appear to be valid XML');
      }

      if (!xbrlDocument.includes('xbrl')) {
        validationIssues.push('Document does not contain XBRL namespace');
      }

      // Check for required elements
      const requiredElements = ['xbrli:xbrl', 'xbrli:context', 'xbrli:unit'];
      for (const element of requiredElements) {
        if (!xbrlDocument.includes(element)) {
          validationIssues.push(`Missing required element: ${element}`);
        }
      }

      // Check for facts
      const factPatterns = [
        /us-gaap:[A-Za-z]+[^>]*/g,
        /ifrs:[A-Za-z]+[^>]*/g
      ];

      let hasFacts = false;
      for (const pattern of factPatterns) {
        if (pattern.test(xbrlDocument)) {
          hasFacts = true;
          break;
        }
      }

      if (!hasFacts) {
        validationIssues.push('No financial facts found in document');
      }

      // More sophisticated validation would use an XBRL validator
      // For now, these are basic checks

    } catch (error) {
      validationIssues.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return validationIssues;
  }

  async convertToInstanceDocument(
    xbrlDocument: string,
    fileName: string
  ): Promise<{ document: string; metadata: any }> {

    try {
      // Create a well-formed XBRL instance document
      const document = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated XBRL Instance Document -->
<!-- File: ${fileName} -->
<!-- Generated: ${new Date().toISOString()} -->
${xbrlDocument}`;

      const metadata = {
        fileName,
        generatedAt: new Date(),
        format: 'xbrl',
        version: '1.0'
      };

      return { document, metadata };

    } catch (error) {
      throw new Error(`Failed to create instance document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Create singleton instance
export const xbrlGenerator = new XBRLGenerator();