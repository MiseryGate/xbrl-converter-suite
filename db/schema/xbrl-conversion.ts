import { pgTable, text, timestamp, integer, boolean, jsonb, varchar, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

// Document storage table for uploaded files
export const documents = pgTable("documents", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    originalName: text("original_name").notNull(),
    fileType: text("file_type").notNull(), // csv, excel, pdf, json, xbrl, etc.
    fileSize: integer("file_size").notNull(), // in bytes
    storageUrl: text("storage_url").notNull(), // cloud storage URL
    mimeType: text("mime_type").notNull(),
    status: text("status").notNull().default("uploaded"), // uploaded, processing, completed, failed
    metadata: jsonb("metadata"), // additional file metadata
    createdAt: timestamp("created_at")
        .defaultNow()
        .notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .notNull(),
});

// Conversion jobs tracking table
export const conversionJobs = pgTable("conversion_jobs", {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
        .notNull()
        .references(() => documents.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // pending, processing, completed, failed
    progress: integer("progress").default(0), // 0-100 percentage
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    errorMessage: text("error_message"),
    outputUrl: text("output_url"), // URL to generated XBRL file
    outputMetadata: jsonb("output_metadata"), // XBRL metadata and statistics
    processingLog: jsonb("processing_log"), // Detailed processing logs
    retryCount: integer("retry_count").default(0),
    createdAt: timestamp("created_at")
        .defaultNow()
        .notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .notNull(),
});

// XBRL taxonomy concepts table
export const taxonomies = pgTable("taxonomies", {
    id: uuid("id").primaryKey().defaultRandom(),
    concept: text("concept").notNull(), // Standard concept name (e.g., "Assets", "Revenue")
    xbrlTag: text("xbrl_tag").notNull(), // XBRL standard tag
    sector: text("sector").notNull(), // industry sector (banking, manufacturing, etc.)
    reportType: text("report_type").notNull(), // balance_sheet, income_statement, cash_flow
    taxonomyFramework: text("taxonomy_framework").notNull(), // US-GAAP, IFRS, etc.
    description: text("description"),
    dataType: text("data_type").notNull().default("monetary"), // monetary, string, boolean, etc.
    isRequired: boolean("is_required").default(false),
    parentConceptId: uuid("parent_concept_id")
        .references(() => taxonomies.id, { onDelete: "set null" }),
    hierarchyLevel: integer("hierarchy_level").default(1),
    synonyms: jsonb("synonyms"), // Alternative names and variations
    validationRules: jsonb("validation_rules"), // Validation constraints
    createdAt: timestamp("created_at")
        .defaultNow()
        .notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .notNull(),
});

// Taxonomy mappings for linking input fields to XBRL concepts
export const taxonomyMappings = pgTable("taxonomy_mappings", {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceField: text("source_field").notNull(), // Original field name from input
    sourceFieldType: text("source_field_type").notNull(), // column_header, json_key, etc.
    taxonomyId: uuid("taxonomy_id")
        .notNull()
        .references(() => taxonomies.id, { onDelete: "cascade" }),
    confidence: integer("confidence").default(0), // 0-100 mapping confidence score
    mappingMethod: text("mapping_method").notNull(), // exact_match, fuzzy, ai_assisted, manual
    sectorContext: text("sector_context"), // Industry-specific context
    reportTypeContext: text("report_type_context"), // Balance sheet, income statement, etc.
    isActive: boolean("is_active").default(true),
    mappingMetadata: jsonb("mapping_metadata"), // Additional mapping information
    createdAt: timestamp("created_at")
        .defaultNow()
        .notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .notNull(),
});

// Parsed financial data storage
export const financialData = pgTable("financial_data", {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
        .notNull()
        .references(() => conversionJobs.id, { onDelete: "cascade" }),
    taxonomyId: uuid("taxonomy_id")
        .notNull()
        .references(() => taxonomies.id, { onDelete: "cascade" }),
    periodEndDate: timestamp("period_end_date").notNull(),
    value: text("value").notNull(), // Store as text to handle various formats
    unit: text("unit").notNull().default("USD"), // Currency unit
    scale: integer("scale").default(0), // Scale factor (thousands, millions, etc.)
    decimals: integer("decimals"), // Number of decimal places
    isNil: boolean("is_nil").default(false),
    context: jsonb("context"), // XBRL context information
    dimensions: jsonb("dimensions"), // XBRL dimensional information
    confidence: integer("confidence").default(100), // Data confidence score
    sourceReference: text("source_reference"), // Reference to source data location
    createdAt: timestamp("created_at")
        .defaultNow()
        .notNull(),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .notNull(),
});

// Analytics and insights storage
export const analytics = pgTable("analytics", {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
        .notNull()
        .references(() => conversionJobs.id, { onDelete: "cascade" }),
    analysisType: text("analysis_type").notNull(), // ratio_analysis, trend_analysis, etc.
    insights: jsonb("insights").notNull(), // Analysis results and insights
    metrics: jsonb("metrics"), // Calculated metrics and ratios
    comparisons: jsonb("comparisons"), // Comparative analysis results
    generatedAt: timestamp("generated_at")
        .defaultNow()
        .notNull(),
    createdAt: timestamp("created_at")
        .defaultNow()
        .notNull(),
});

// AI agent processing logs
export const aiProcessingLogs = pgTable("ai_processing_logs", {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
        .notNull()
        .references(() => conversionJobs.id, { onDelete: "cascade" }),
    processingStep: text("processing_step").notNull(), // parsing, mapping, validation, etc.
    prompt: text("prompt"), // AI prompt used
    response: text("response"), // AI response
    confidence: integer("confidence"), // AI confidence in result
    tokensUsed: integer("tokens_used"),
    processingTime: integer("processing_time"), // milliseconds
    modelUsed: text("model_used"), // AI model name
    metadata: jsonb("metadata"), // Additional AI processing metadata
    createdAt: timestamp("created_at")
        .defaultNow()
        .notNull(),
});

// Create indexes for better performance
export const documentsIndexes = [
    "CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)",
    "CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at)",
];

export const conversionJobsIndexes = [
    "CREATE INDEX IF NOT EXISTS idx_conversion_jobs_document_id ON conversion_jobs(document_id)",
    "CREATE INDEX IF NOT EXISTS idx_conversion_jobs_status ON conversion_jobs(status)",
    "CREATE INDEX IF NOT EXISTS idx_conversion_jobs_created_at ON conversion_jobs(created_at)",
];

export const taxonomiesIndexes = [
    "CREATE INDEX IF NOT EXISTS idx_taxonomies_concept ON taxonomies(concept)",
    "CREATE INDEX IF NOT EXISTS idx_taxonomies_sector ON taxonomies(sector)",
    "CREATE INDEX IF NOT EXISTS idx_taxonomies_report_type ON taxonomies(report_type)",
    "CREATE INDEX IF NOT EXISTS idx_taxonomies_taxonomy_framework ON taxonomies(taxonomy_framework)",
    "CREATE INDEX IF NOT EXISTS idx_taxonomies_xbrl_tag ON taxonomies(xbrl_tag)",
];

export const financialDataIndexes = [
    "CREATE INDEX IF NOT EXISTS idx_financial_data_job_id ON financial_data(job_id)",
    "CREATE INDEX IF NOT EXISTS idx_financial_data_taxonomy_id ON financial_data(taxonomy_id)",
    "CREATE INDEX IF NOT EXISTS idx_financial_data_period_end_date ON financial_data(period_end_date)",
];