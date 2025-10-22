import { db } from "../index";
import { taxonomies } from "../schema/xbrl-conversion";

interface TaxonomySeed {
    concept: string;
    xbrlTag: string;
    sector: string;
    reportType: string;
    taxonomyFramework: string;
    description: string;
    dataType: string;
    isRequired: boolean;
    parentConcept?: string;
    hierarchyLevel: number;
    synonyms: string[];
}

const taxonomySeedData: TaxonomySeed[] = [
    // Balance Sheet - Assets
    {
        concept: "Cash and Cash Equivalents",
        xbrlTag: "us-gaap:CashAndCashEquivalentsCarryingAmount",
        sector: "all",
        reportType: "balance_sheet",
        taxonomyFramework: "US-GAAP",
        description: "Cash and cash equivalents including checking accounts, savings accounts, and short-term investments",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["Cash", "Cash Equivalents", "Cash and Short-term Investments", "Liquid Assets"]
    },
    {
        concept: "Accounts Receivable",
        xbrlTag: "us-gaap:AccountsReceivableNetCurrent",
        sector: "all",
        reportType: "balance_sheet",
        taxonomyFramework: "US-GAAP",
        description: "Net amounts due from customers for goods and services rendered",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["Trade Receivables", "AR", "Customer Receivables"]
    },
    {
        concept: "Inventory",
        xbrlTag: "us-gaap:InventoryNet",
        sector: "manufacturing",
        reportType: "balance_sheet",
        taxonomyFramework: "US-GAAP",
        description: "Raw materials, work in process, and finished goods",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["Stock", "Goods in Inventory", "Merchandise Inventory"]
    },
    {
        concept: "Property, Plant and Equipment",
        xbrlTag: "us-gaap:PropertyPlantAndEquipmentNet",
        sector: "all",
        reportType: "balance_sheet",
        taxonomyFramework: "US-GAAP",
        description: "Long-term tangible assets used in operations",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["PPE", "Fixed Assets", "Capital Assets", "Plant and Equipment"]
    },
    {
        concept: "Total Assets",
        xbrlTag: "us-gaap:Assets",
        sector: "all",
        reportType: "balance_sheet",
        taxonomyFramework: "US-GAAP",
        description: "Total value of all assets owned by the company",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 1,
        synonyms: ["Total Assets", "All Assets"]
    },

    // Balance Sheet - Liabilities
    {
        concept: "Accounts Payable",
        xbrlTag: "us-gaap:AccountsPayableCurrent",
        sector: "all",
        reportType: "balance_sheet",
        taxonomyFramework: "US-GAAP",
        description: "Amounts owed to suppliers for goods and services",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["Trade Payables", "AP", "Supplier Payables"]
    },
    {
        concept: "Short-term Debt",
        xbrlTag: "us-gaap:ShortTermDebt",
        sector: "all",
        reportType: "balance_sheet",
        taxonomyFramework: "US-GAAP",
        description: "Debt due within one year",
        dataType: "monetary",
        isRequired: false,
        hierarchyLevel: 2,
        synonyms: ["Current Debt", "Short-term Borrowings", "Current Portion of Debt"]
    },
    {
        concept: "Long-term Debt",
        xbrlTag: "us-gaap:LongTermDebt",
        sector: "all",
        reportType: "balance_sheet",
        taxonomyFramework: "US-GAAP",
        description: "Debt due after one year",
        dataType: "monetary",
        isRequired: false,
        hierarchyLevel: 2,
        synonyms: ["Long-term Borrowings", "Long-term Liabilities", "Non-current Debt"]
    },
    {
        concept: "Total Liabilities",
        xbrlTag: "us-gaap:Liabilities",
        sector: "all",
        reportType: "balance_sheet",
        taxonomyFramework: "US-GAAP",
        description: "Total value of all liabilities",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 1,
        synonyms: ["Total Liabilities", "All Liabilities"]
    },

    // Balance Sheet - Equity
    {
        concept: "Share Capital",
        xbrlTag: "us-gaap:CommonStockValue",
        sector: "all",
        reportType: "balance_sheet",
        taxonomyFramework: "US-GAAP",
        description: "Par value of issued common stock",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["Common Stock", "Share Capital", "Issued Capital"]
    },
    {
        concept: "Retained Earnings",
        xbrlTag: "us-gaap:RetainedEarningsAccumulatedDeficit",
        sector: "all",
        reportType: "balance_sheet",
        taxonomyFramework: "US-GAAP",
        description: "Accumulated earnings retained in the business",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["Retained Earnings", "Accumulated Earnings", "RE"]
    },
    {
        concept: "Total Equity",
        xbrlTag: "us-gaap:StockholdersEquity",
        sector: "all",
        reportType: "balance_sheet",
        taxonomyFramework: "US-GAAP",
        description: "Total shareholders' equity",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 1,
        synonyms: ["Shareholders Equity", "Owner's Equity", "Net Worth"]
    },

    // Income Statement - Revenue
    {
        concept: "Revenue",
        xbrlTag: "us-gaap:Revenues",
        sector: "all",
        reportType: "income_statement",
        taxonomyFramework: "US-GAAP",
        description: "Total revenue from primary business operations",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 1,
        synonyms: ["Sales", "Turnover", "Total Revenue", "Gross Sales"]
    },
    {
        concept: "Cost of Goods Sold",
        xbrlTag: "us-gaap:CostOfGoodsSold",
        sector: "manufacturing",
        reportType: "income_statement",
        taxonomyFramework: "US-GAAP",
        description: "Direct costs of producing goods sold",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["COGS", "Cost of Sales", "Cost of Revenue"]
    },
    {
        concept: "Gross Profit",
        xbrlTag: "us-gaap:GrossProfit",
        sector: "all",
        reportType: "income_statement",
        taxonomyFramework: "US-GAAP",
        description: "Revenue minus cost of goods sold",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["Gross Margin", "Gross Income"]
    },

    // Income Statement - Expenses
    {
        concept: "Operating Expenses",
        xbrlTag: "us-gaap:OperatingExpenses",
        sector: "all",
        reportType: "income_statement",
        taxonomyFramework: "US-GAAP",
        description: "Total operating expenses",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["Operating Costs", "SG&A", "Selling, General and Administrative"]
    },
    {
        concept: "Operating Income",
        xbrlTag: "us-gaap:OperatingIncomeLoss",
        sector: "all",
        reportType: "income_statement",
        taxonomyFramework: "US-GAAP",
        description: "Gross profit minus operating expenses",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["EBIT", "Operating Profit", "Operating Earnings"]
    },
    {
        concept: "Net Income",
        xbrlTag: "us-gaap:NetIncomeLoss",
        sector: "all",
        reportType: "income_statement",
        taxonomyFramework: "US-GAAP",
        description: "Net profit after all expenses and taxes",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 1,
        synonyms: ["Net Profit", "Net Earnings", "Bottom Line", "Profit after Tax"]
    },

    // Cash Flow Statement
    {
        concept: "Operating Cash Flow",
        xbrlTag: "us-gaap:NetCashProvidedByUsedInOperatingActivities",
        sector: "all",
        reportType: "cash_flow",
        taxonomyFramework: "US-GAAP",
        description: "Cash generated from operating activities",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["Cash from Operations", "Operating Cash Flow", "OCF"]
    },
    {
        concept: "Investing Cash Flow",
        xbrlTag: "us-gaap:NetCashProvidedByUsedInInvestingActivities",
        sector: "all",
        reportType: "cash_flow",
        taxonomyFramework: "US-GAAP",
        description: "Cash used for investing activities",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["Cash from Investing", "Investing Activities Cash Flow"]
    },
    {
        concept: "Financing Cash Flow",
        xbrlTag: "us-gaap:NetCashProvidedByUsedInFinancingActivities",
        sector: "all",
        reportType: "cash_flow",
        taxonomyFramework: "US-GAAP",
        description: "Cash used for financing activities",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["Cash from Financing", "Financing Activities Cash Flow"]
    },
    {
        concept: "Free Cash Flow",
        xbrlTag: "us-gaap:CashFlowFromContinuingOperations",
        sector: "all",
        reportType: "cash_flow",
        taxonomyFramework: "US-GAAP",
        description: "Operating cash flow minus capital expenditures",
        dataType: "monetary",
        isRequired: false,
        hierarchyLevel: 2,
        synonyms: ["FCF", "Free Cash", "Available Cash Flow"]
    },

    // IFRS Equivalent Concepts
    {
        concept: "Trade Receivables",
        xbrlTag: "ifrs-full:TradeAndOtherCurrentReceivables",
        sector: "all",
        reportType: "balance_sheet",
        taxonomyFramework: "IFRS",
        description: "Receivables from trade operations under IFRS",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["Accounts Receivable", "Trade Receivables"]
    },
    {
        concept: "Trade Payables",
        xbrlTag: "ifrs-full:TradeAndOtherCurrentPayables",
        sector: "all",
        reportType: "balance_sheet",
        taxonomyFramework: "IFRS",
        description: "Payables to suppliers under IFRS",
        dataType: "monetary",
        isRequired: true,
        hierarchyLevel: 2,
        synonyms: ["Accounts Payable", "Trade Creditors"]
    }
];

export async function seedTaxonomies() {
    console.log("🌱 Seeding XBRL taxonomies...");

    try {
        // Insert seed data
        await db.insert(taxonomies).values(
            taxonomySeedData.map((item) => ({
                concept: item.concept,
                xbrlTag: item.xbrlTag,
                sector: item.sector,
                reportType: item.reportType,
                taxonomyFramework: item.taxonomyFramework,
                description: item.description,
                dataType: item.dataType,
                isRequired: item.isRequired,
                hierarchyLevel: item.hierarchyLevel,
                synonyms: item.synonyms,
                validationRules: {
                    required: item.isRequired,
                    dataType: item.dataType,
                    minLength: 0,
                    maxLength: 1000
                }
            }))
        );

        console.log(`✅ Successfully seeded ${taxonomySeedData.length} taxonomy concepts`);

        // Log some statistics
        const usGaapCount = taxonomySeedData.filter(t => t.taxonomyFramework === "US-GAAP").length;
        const ifrsCount = taxonomySeedData.filter(t => t.taxonomyFramework === "IFRS").length;
        const balanceSheetCount = taxonomySeedData.filter(t => t.reportType === "balance_sheet").length;
        const incomeStatementCount = taxonomySeedData.filter(t => t.reportType === "income_statement").length;
        const cashFlowCount = taxonomySeedData.filter(t => t.reportType === "cash_flow").length;

        console.log(`📊 Seeding Statistics:`);
        console.log(`   - US-GAAP concepts: ${usGaapCount}`);
        console.log(`   - IFRS concepts: ${ifrsCount}`);
        console.log(`   - Balance Sheet concepts: ${balanceSheetCount}`);
        console.log(`   - Income Statement concepts: ${incomeStatementCount}`);
        console.log(`   - Cash Flow concepts: ${cashFlowCount}`);

    } catch (error) {
        console.error("❌ Error seeding taxonomies:", error);
        throw error;
    }
}

// Run seeder if this file is executed directly
if (require.main === module) {
    seedTaxonomies()
        .then(() => {
            console.log("🎉 Taxonomy seeding completed successfully!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("💥 Taxonomy seeding failed:", error);
            process.exit(1);
        });
}