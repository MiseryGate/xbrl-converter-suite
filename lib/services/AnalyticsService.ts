import { db } from '../db';
import { analytics, financialData, conversionJobs } from '../db/schema/xbrl-conversion';
import { FinancialStatement, FinancialItem } from '../parsers/types';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface FinancialRatio {
  name: string;
  value: number;
  formula: string;
  interpretation?: string;
  category: 'liquidity' | 'profitability' | 'efficiency' | 'solvency';
}

export interface TrendAnalysis {
  metric: string;
  periods: Array<{
    period: Date;
    value: number;
    changePercent?: number;
  }>;
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  significance: 'high' | 'medium' | 'low';
}

export interface ComparativeAnalysis {
  companyMetrics: Record<string, number>;
  industryAverages?: Record<string, number>;
  rankings: Array<{
    metric: string;
    value: number;
    percentile: number;
    category: 'above_average' | 'average' | 'below_average';
  }>;
}

export interface AnalyticsResult {
  ratios: FinancialRatio[];
  trends: TrendAnalysis[];
  comparisons?: ComparativeAnalysis;
  insights: string[];
  confidence: number;
  analysisDate: Date;
  dataQuality: 'high' | 'medium' | 'low';
}

export class AnalyticsService {
  async performComprehensiveAnalysis(jobId: string): Promise<AnalyticsResult> {
    try {
      // Get financial data for the job
      const financialItems = await this.getFinancialDataForJob(jobId);
      if (financialItems.length === 0) {
        throw new Error('No financial data available for analysis');
      }

      // Group items by statement type
      const statements = this.groupItemsByStatements(financialItems);

      // Calculate financial ratios
      const ratios = await this.calculateFinancialRatios(statements);

      // Analyze trends (if multiple periods available)
      const trends = await this.analyzeTrends(jobId);

      // Perform comparative analysis
      const comparisons = await this.performComparativeAnalysis(ratios);

      // Generate insights
      const insights = await this.generateInsights(ratios, trends, statements);

      // Assess data quality
      const dataQuality = this.assessDataQuality(financialItems);

      const result: AnalyticsResult = {
        ratios,
        trends,
        comparisons,
        insights,
        confidence: this.calculateOverallConfidence(ratios, trends, dataQuality),
        analysisDate: new Date(),
        dataQuality
      };

      // Save analytics result to database
      await this.saveAnalyticsResult(jobId, result);

      return result;

    } catch (error) {
      throw new Error(`Failed to perform analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async calculateLiquidityRatios(statements: any[]): Promise<FinancialRatio[]> {
    const balanceSheet = statements.find(s => s.type === 'balance_sheet');
    if (!balanceSheet) return [];

    const ratios: FinancialRatio[] = [];
    const items = balanceSheet.items;

    // Current Ratio
    const currentAssets = this.findItemValue(items, ['current assets', 'total current assets']);
    const currentLiabilities = this.findItemValue(items, ['current liabilities', 'total current liabilities']);

    if (currentAssets && currentLiabilities && currentLiabilities !== 0) {
      const currentRatio = currentAssets / currentLiabilities;
      ratios.push({
        name: 'Current Ratio',
        value: currentRatio,
        formula: 'Current Assets / Current Liabilities',
        interpretation: currentRatio >= 1.5 ? 'Strong liquidity position' :
                      currentRatio >= 1.0 ? 'Adequate liquidity' : 'Potential liquidity concerns',
        category: 'liquidity'
      });
    }

    // Quick Ratio (Acid Test)
    const inventory = this.findItemValue(items, ['inventory']);
    const quickAssets = currentAssets ? currentAssets - (inventory || 0) : 0;

    if (quickAssets && currentLiabilities && currentLiabilities !== 0) {
      const quickRatio = quickAssets / currentLiabilities;
      ratios.push({
        name: 'Quick Ratio',
        value: quickRatio,
        formula: '(Current Assets - Inventory) / Current Liabilities',
        interpretation: quickRatio >= 1.0 ? 'Excellent short-term liquidity' :
                      quickRatio >= 0.7 ? 'Good short-term liquidity' : 'Poor short-term liquidity',
        category: 'liquidity'
      });
    }

    return ratios;
  }

  async calculateProfitabilityRatios(statements: any[]): Promise<FinancialRatio[]> {
    const incomeStatement = statements.find(s => s.type === 'income_statement');
    const balanceSheet = statements.find(s => s.type === 'balance_sheet');

    if (!incomeStatement) return [];

    const ratios: FinancialRatio[] = [];
    const incomeItems = incomeStatement.items;
    const balanceSheetItems = balanceSheet?.items || [];

    // Gross Profit Margin
    const revenue = this.findItemValue(incomeItems, ['revenue', 'sales', 'total revenue']);
    const grossProfit = this.findItemValue(incomeItems, ['gross profit', 'gross margin']);

    if (revenue && grossProfit && revenue !== 0) {
      const grossMargin = (grossProfit / revenue) * 100;
      ratios.push({
        name: 'Gross Profit Margin',
        value: grossMargin,
        formula: '(Gross Profit / Revenue) * 100',
        interpretation: grossMargin >= 50 ? 'Excellent gross margins' :
                      grossMargin >= 30 ? 'Good gross margins' : 'Low gross margins',
        category: 'profitability'
      });
    }

    // Net Profit Margin
    const netIncome = this.findItemValue(incomeItems, ['net income', 'net profit', 'earnings']);

    if (revenue && netIncome && revenue !== 0) {
      const netMargin = (netIncome / revenue) * 100;
      ratios.push({
        name: 'Net Profit Margin',
        value: netMargin,
        formula: '(Net Income / Revenue) * 100',
        interpretation: netMargin >= 15 ? 'Excellent profitability' :
                      netMargin >= 5 ? 'Good profitability' : 'Poor profitability',
        category: 'profitability'
      });
    }

    // Return on Assets (ROA)
    const totalAssets = this.findItemValue(balanceSheetItems, ['total assets', 'assets']);

    if (netIncome && totalAssets && totalAssets !== 0) {
      const roa = (netIncome / totalAssets) * 100;
      ratios.push({
        name: 'Return on Assets (ROA)',
        value: roa,
        formula: '(Net Income / Total Assets) * 100',
        interpretation: roa >= 15 ? 'Excellent asset utilization' :
                      roa >= 5 ? 'Good asset utilization' : 'Poor asset utilization',
        category: 'profitability'
      });
    }

    return ratios;
  }

  async calculateSolvencyRatios(statements: any[]): Promise<FinancialRatio[]> {
    const balanceSheet = statements.find(s => s.type === 'balance_sheet');
    const incomeStatement = statements.find(s => s.type === 'income_statement');

    if (!balanceSheet) return [];

    const ratios: FinancialRatio[] = [];
    const balanceSheetItems = balanceSheet.items;
    const incomeItems = incomeStatement?.items || [];

    // Debt-to-Equity Ratio
    const totalLiabilities = this.findItemValue(balanceSheetItems, ['total liabilities', 'liabilities']);
    const totalEquity = this.findItemValue(balanceSheetItems, ['total equity', 'shareholders equity', 'stockholders equity']);

    if (totalLiabilities !== null && totalEquity && totalEquity !== 0) {
      const debtToEquity = totalLiabilities / totalEquity;
      ratios.push({
        name: 'Debt-to-Equity Ratio',
        value: debtToEquity,
        formula: 'Total Liabilities / Total Equity',
        interpretation: debtToEquity <= 0.5 ? 'Conservative financing' :
                      debtToEquity <= 1.0 ? 'Moderate debt levels' : 'High debt burden',
        category: 'solvency'
      });
    }

    // Interest Coverage Ratio
    const ebit = this.findItemValue(incomeItems, ['operating income', 'ebit', 'earnings before interest and taxes']);
    const interestExpense = Math.abs(this.findItemValue(incomeItems, ['interest expense', 'interest paid']) || 0);

    if (ebit && interestExpense && interestExpense !== 0) {
      const interestCoverage = ebit / interestExpense;
      ratios.push({
        name: 'Interest Coverage Ratio',
        value: interestCoverage,
        formula: 'EBIT / Interest Expense',
        interpretation: interestCoverage >= 3.0 ? 'Strong ability to meet interest obligations' :
                      interestCoverage >= 1.5 ? 'Adequate interest coverage' : 'Potential interest payment issues',
        category: 'solvency'
      });
    }

    return ratios;
  }

  private async analyzeTrends(jobId: string): Promise<TrendAnalysis[]> {
    try {
      // Get historical financial data for trend analysis
      const historicalData = await this.getHistoricalFinancialData(jobId);
      if (historicalData.length < 2) {
        return [];
      }

      const trends: TrendAnalysis[] = [];

      // Analyze revenue trend
      const revenueTrend = this.analyzeMetricTrend(historicalData, 'revenue');
      if (revenueTrend) {
        trends.push(revenueTrend);
      }

      // Analyze net income trend
      const incomeTrend = this.analyzeMetricTrend(historicalData, 'net income');
      if (incomeTrend) {
        trends.push(incomeTrend);
      }

      // Analyze total assets trend
      const assetsTrend = this.analyzeMetricTrend(historicalData, 'total assets');
      if (assetsTrend) {
        trends.push(assetsTrend);
      }

      return trends;
    } catch (error) {
      console.error('Error analyzing trends:', error);
      return [];
    }
  }

  private analyzeMetricTrend(historicalData: any[], metricName: string): TrendAnalysis | null {
    const periods = historicalData.map(data => ({
      period: data.periodEndDate,
      value: data.metrics[metricName] || 0
    })).sort((a, b) => a.period.getTime() - b.period.getTime());

    if (periods.length < 2) return null;

    // Calculate trend
    const values = periods.map(p => p.value);
    let trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';

    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const changePercent = ((lastValue - firstValue) / Math.abs(firstValue)) * 100;

    // Determine trend direction
    const isIncreasing = values.every((val, i) => i === 0 || val >= values[i - 1] * 0.95);
    const isDecreasing = values.every((val, i) => i === 0 || val <= values[i - 1] * 1.05);

    if (isIncreasing) {
      trend = 'increasing';
    } else if (isDecreasing) {
      trend = 'decreasing';
    } else if (Math.abs(changePercent) < 5) {
      trend = 'stable';
    } else {
      trend = 'volatile';
    }

    // Add change percentages
    periods.forEach((period, i) => {
      if (i > 0) {
        const prevValue = values[i - 1];
        period.changePercent = ((period.value - prevValue) / Math.abs(prevValue)) * 100;
      }
    });

    // Determine significance
    const significance = Math.abs(changePercent) >= 20 ? 'high' :
                        Math.abs(changePercent) >= 10 ? 'medium' : 'low';

    return {
      metric: metricName,
      periods,
      trend,
      significance
    };
  }

  private async generateInsights(
    ratios: FinancialRatio[],
    trends: TrendAnalysis[],
    statements: any[]
  ): Promise<string[]> {
    const insights: string[] = [];

    // Ratio-based insights
    ratios.forEach(ratio => {
      if (ratio.category === 'liquidity' && ratio.value < 1.0) {
        insights.push(`Liquidity concern: ${ratio.name} of ${ratio.value.toFixed(2)} indicates potential cash flow issues.`);
      }
      if (ratio.category === 'profitability' && ratio.value < 0) {
        insights.push(`Profitability alert: ${ratio.name} is negative at ${ratio.value.toFixed(2)}%.`);
      }
      if (ratio.category === 'solvency' && ratio.value > 2.0) {
        insights.push(`High leverage: ${ratio.name} of ${ratio.value.toFixed(2)} suggests significant debt burden.`);
      }
    });

    // Trend-based insights
    trends.forEach(trend => {
      if (trend.trend === 'increasing' && trend.significance === 'high') {
        insights.push(`Strong positive trend: ${trend.metric} shows significant growth over time.`);
      }
      if (trend.trend === 'decreasing' && trend.significance === 'high') {
        insights.push(`Concerning trend: ${trend.metric} shows significant decline over time.`);
      }
      if (trend.trend === 'volatile') {
        insights.push(`Volatility detected: ${trend.metric} shows inconsistent performance.`);
      }
    });

    // Statement completeness insights
    const statementTypes = statements.map(s => s.type);
    const requiredStatements = ['balance_sheet', 'income_statement'];
    const missingStatements = requiredStatements.filter(type => !statementTypes.includes(type));

    if (missingStatements.length > 0) {
      insights.push(`Incomplete financial data: Missing ${missingStatements.join(' and ')} statements for comprehensive analysis.`);
    }

    return insights;
  }

  private calculateFinancialRatios(statements: any[]): Promise<FinancialRatio[]> {
    const allRatios: FinancialRatio[] = [];

    // Calculate all ratio categories
    allRatios.push(...this.calculateLiquidityRatiosSync(statements));
    allRatios.push(...this.calculateProfitabilityRatiosSync(statements));
    allRatios.push(...this.calculateSolvencyRatiosSync(statements));

    return Promise.resolve(allRatios);
  }

  private calculateLiquidityRatiosSync(statements: any[]): FinancialRatio[] {
    // Simplified synchronous version for demonstration
    return [];
  }

  private calculateProfitabilityRatiosSync(statements: any[]): FinancialRatio[] {
    // Simplified synchronous version for demonstration
    return [];
  }

  private calculateSolvencyRatiosSync(statements: any[]): FinancialRatio[] {
    // Simplified synchronous version for demonstration
    return [];
  }

  private async getHistoricalFinancialData(jobId: string): Promise<any[]> {
    // Simplified - in production, this would query historical data
    return [];
  }

  private async getFinancialDataForJob(jobId: string): Promise<FinancialItem[]> {
    try {
      const result = await db.select()
        .from(financialData)
        .where(eq(financialData.jobId, jobId));

      return result.map(row => ({
        concept: row.concept || '',
        value: parseFloat(row.value),
        unit: row.unit,
        periodEndDate: row.periodEndDate,
        sourceReference: row.sourceReference
      }));
    } catch (error) {
      throw new Error(`Failed to get financial data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private groupItemsByStatements(items: FinancialItem[]): any[] {
    // Group items by statement type and period
    const statements: Record<string, any> = {};

    items.forEach(item => {
      const key = `${item.periodEndDate.toISOString().split('T')[0]}_${item.concept}`;

      // Simple classification based on concept names
      if (item.concept.includes('asset') || item.concept.includes('liability') || item.concept.includes('equity')) {
        if (!statements.balance_sheet) {
          statements.balance_sheet = { type: 'balance_sheet', items: [] };
        }
        statements.balance_sheet.items.push(item);
      } else if (item.concept.includes('revenue') || item.concept.includes('income') || item.concept.includes('expense')) {
        if (!statements.income_statement) {
          statements.income_statement = { type: 'income_statement', items: [] };
        }
        statements.income_statement.items.push(item);
      }
    });

    return Object.values(statements);
  }

  private findItemValue(items: any[], concepts: string[]): number | null {
    for (const item of items) {
      if (concepts.some(concept => item.concept.toLowerCase().includes(concept.toLowerCase()))) {
        return typeof item.value === 'number' ? item.value : parseFloat(item.value);
      }
    }
    return null;
  }

  private assessDataQuality(items: any[]): 'high' | 'medium' | 'low' {
    if (items.length === 0) return 'low';

    // Check data completeness and quality
    const completeItems = items.filter(item => item.value !== null && item.value !== undefined);
    const completeness = completeItems.length / items.length;

    if (completeness >= 0.9) return 'high';
    if (completeness >= 0.7) return 'medium';
    return 'low';
  }

  private calculateOverallConfidence(
    ratios: FinancialRatio[],
    trends: TrendAnalysis[],
    dataQuality: 'high' | 'medium' | 'low'
  ): number {
    let confidence = 70; // Base confidence

    // Adjust based on ratios calculated
    confidence += Math.min(20, ratios.length * 5);

    // Adjust based on trend analysis
    confidence += Math.min(10, trends.length * 3);

    // Adjust based on data quality
    switch (dataQuality) {
      case 'high': confidence += 10; break;
      case 'medium': confidence += 0; break;
      case 'low': confidence -= 20; break;
    }

    return Math.max(0, Math.min(100, confidence));
  }

  private async saveAnalyticsResult(jobId: string, result: AnalyticsResult): Promise<void> {
    try {
      await db.insert(analytics).values({
        jobId,
        analysisType: 'comprehensive',
        insights: result.insights,
        metrics: {
          ratios: result.ratios,
          trends: result.trends
        },
        comparisons: result.comparisons,
        generatedAt: new Date()
      });
    } catch (error) {
      console.error('Failed to save analytics result:', error);
    }
  }
}

// Singleton instance
export const analyticsService = new AnalyticsService();