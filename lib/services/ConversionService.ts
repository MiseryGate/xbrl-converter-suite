import { parserFactory } from '../parsers';
import { taxonomyMappingService } from './TaxonomyMappingService';
import { xbrlGenerator } from './XBRLGenerator';
import { jobQueueService } from './JobQueueService';
import { db } from '../db';
import { documents, conversionJobs, financialData, aiProcessingLogs } from '../db/schema/xbrl-conversion';
import { FinancialData, TaxonomyFramework, FILE_TYPES } from '../parsers/types';
import { eq } from 'drizzle-orm';

export interface ConversionOptions {
  targetFramework?: TaxonomyFramework;
  targetCurrency?: string;
  aiAssistedMapping?: boolean;
  validationLevel?: 'basic' | 'strict';
  outputFormat?: 'xbrl' | 'json' | 'both';
}

export interface ConversionResult {
  success: boolean;
  jobId: string;
  documentId: string;
  xbrlUrl?: string;
  metadata?: any;
  error?: string;
}

export interface ProcessingLog {
  step: string;
  timestamp: Date;
  status: 'started' | 'completed' | 'failed';
  details?: any;
  error?: string;
}

export class ConversionService {
  async initiateConversion(
    documentId: string,
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    try {
      // Get document from database
      const document = await db.select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (document.length === 0) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // Create conversion job
      const job = await jobQueueService.createJob({
        documentId
      });

      // Start processing asynchronously
      this.processDocumentAsync(job.id, documentId, options)
        .catch(error => {
          console.error('Async processing failed:', error);
        });

      return {
        success: true,
        jobId: job.id,
        documentId
      };

    } catch (error) {
      return {
        success: false,
        jobId: '',
        documentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getJobStatus(jobId: string): Promise<ConversionResult> {
    try {
      const job = await jobQueueService.getJob(jobId);

      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      return {
        success: job.status === 'completed',
        jobId: job.id,
        documentId: job.documentId,
        xbrlUrl: job.outputUrl,
        error: job.errorMessage
      };

    } catch (error) {
      return {
        success: false,
        jobId,
        documentId: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async processDocument(jobId: string, documentId: string, options: ConversionOptions = {}): Promise<ConversionResult> {
    const processingLogs: ProcessingLog[] = [];

    try {
      await jobQueueService.updateJob(jobId, {
        status: 'processing',
        progress: 0
      });

      // Step 1: Retrieve document
      processingLogs.push({
        step: 'retrieving_document',
        timestamp: new Date(),
        status: 'started'
      });

      const document = await this.retrieveDocument(documentId);
      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }

      processingLogs.push({
        step: 'retrieving_document',
        timestamp: new Date(),
        status: 'completed',
        details: { fileName: document.fileName, fileSize: document.fileSize }
      });

      await jobQueueService.updateJobProgress(jobId, 10);

      // Step 2: Parse financial data
      processingLogs.push({
        step: 'parsing_document',
        timestamp: new Date(),
        status: 'started'
      });

      const financialData = await this.parseFinancialData(document.storageUrl, document.fileName, document.fileType);
      if (!financialData || financialData.financialStatements.length === 0) {
        throw new Error('No financial data could be extracted from the document');
      }

      processingLogs.push({
        step: 'parsing_document',
        timestamp: new Date(),
        status: 'completed',
        details: {
          statementsCount: financialData.financialStatements.length,
          totalItems: financialData.financialStatements.reduce((sum, stmt) => sum + stmt.items.length, 0)
        }
      });

      await jobQueueService.updateJobProgress(jobId, 30);

      // Step 3: Map to taxonomy
      processingLogs.push({
        step: 'taxonomy_mapping',
        timestamp: new Date(),
        status: 'started'
      });

      const mappedData = await this.mapToTaxonomy(financialData, options);
      processingLogs.push({
        step: 'taxonomy_mapping',
        timestamp: new Date(),
        status: 'completed',
        details: {
          mappedItems: mappedData.financialStatements.reduce((sum, stmt) =>
            sum + stmt.items.filter(item => item.taxonomyMatch).length, 0)
        }
      });

      await jobQueueService.updateJobProgress(jobId, 60);

      // Step 4: Generate XBRL
      processingLogs.push({
        step: 'generating_xbrl',
        timestamp: new Date(),
        status: 'started'
      });

      const xbrlResult = await this.generateXBRL(mappedData, document, options);
      processingLogs.push({
        step: 'generating_xbrl',
        timestamp: new Date(),
        status: 'completed',
        details: {
          factsCount: xbrlResult.metadata.totalFacts,
          frameworks: xbrlResult.metadata.frameworks
        }
      });

      await jobQueueService.updateJobProgress(jobId, 80);

      // Step 5: Save results
      processingLogs.push({
        step: 'saving_results',
        timestamp: new Date(),
        status: 'started'
      });

      const outputUrl = await this.saveConversionResults(jobId, mappedData, xbrlResult, processingLogs);
      processingLogs.push({
        step: 'saving_results',
        timestamp: new Date(),
        status: 'completed',
        details: { outputUrl }
      });

      await jobQueueService.updateJobProgress(jobId, 100);

      // Complete job
      await jobQueueService.updateJob(jobId, {
        status: 'completed',
        outputUrl,
        outputMetadata: xbrlResult.metadata,
        processingLog: processingLogs
      });

      return {
        success: true,
        jobId,
        documentId,
        xbrlUrl: outputUrl,
        metadata: xbrlResult.metadata
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log AI processing if enabled
      if (options.aiAssistedMapping) {
        await this.logAIProcessing(jobId, 'conversion_error', '', errorMessage, 0, 0, 'system');
      }

      await jobQueueService.markJobAsFailed(jobId, errorMessage);

      return {
        success: false,
        jobId,
        documentId,
        error: errorMessage
      };
    }
  }

  private async processDocumentAsync(jobId: string, documentId: string, options: ConversionOptions): Promise<void> {
    // This method runs the actual processing in the background
    try {
      await this.processDocument(jobId, documentId, options);
    } catch (error) {
      console.error('Async document processing failed:', error);
    }
  }

  private async retrieveDocument(documentId: string): Promise<any> {
    try {
      const result = await db.select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      throw new Error(`Failed to retrieve document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async parseFinancialData(storageUrl: string, fileName: string, fileType: string): Promise<FinancialData | null> {
    try {
      // In a real implementation, you would download the file from storage
      // For now, we'll simulate the parsing
      const buffer = Buffer.from(''); // Simulated file buffer

      const parser = parserFactory.getParser(fileType);
      if (!parser) {
        throw new Error(`No parser available for file type: ${fileType}`);
      }

      return await parser.parse(buffer, fileName);
    } catch (error) {
      throw new Error(`Failed to parse financial data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async mapToTaxonomy(financialData: FinancialData, options: ConversionOptions = {}): Promise<FinancialData> {
    const targetFramework = options.targetFramework || 'US-GAAP';

    try {
      for (const statement of financialData.financialStatements) {
        // Map items to taxonomy
        const mappingResults = await taxonomyMappingService.mapFinancialItems(
          statement.items,
          financialData.documentInfo.sector || 'all',
          statement.type
        );

        // Update items with taxonomy matches
        statement.items = statement.items.map((item, index) => {
          const mappingResult = mappingResults[index];
          if (mappingResult && mappingResult.match) {
            return {
              ...item,
              taxonomyMatch: mappingResult.match
            };
          }
          return item;
        });

        // Log AI processing if enabled
        if (options.aiAssistedMapping) {
          for (const [index, { item, match }] of mappingResults.entries()) {
            if (match && match.mappingMethod === 'ai_assisted') {
              await this.logAIProcessing(
                'temp_job_id', // Would be actual job ID
                'taxonomy_mapping',
                `Mapped ${item.concept} to ${match.xbrlTag}`,
                `AI-assisted mapping with ${match.confidence}% confidence`,
                match.confidence,
                100,
                'taxonomy-ai-model'
              );
            }
          }
        }
      }

      return financialData;
    } catch (error) {
      throw new Error(`Failed to map to taxonomy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateXBRL(
    financialData: FinancialData,
    document: any,
    options: ConversionOptions = {}
  ): Promise<any> {
    try {
      const xbrlOptions = {
        taxonomyFramework: options.targetFramework || 'US-GAAP',
        currency: options.targetCurrency || financialData.documentInfo.currency || 'USD',
        documentLanguage: 'en',
        documentDate: financialData.documentInfo.periodEndDate || new Date(),
        companyName: financialData.documentInfo.companyName || document.originalName,
        identifier: document.id
      };

      return await xbrlGenerator.generateXBRL(financialData.financialStatements, xbrlOptions);
    } catch (error) {
      throw new Error(`Failed to generate XBRL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async saveConversionResults(
    jobId: string,
    financialData: FinancialData,
    xbrlResult: any,
    processingLogs: ProcessingLog[]
  ): Promise<string> {
    try {
      // In a real implementation, you would save to cloud storage (AWS S3, Vercel Blob, etc.)
      const outputFileName = `xbrl-${jobId}-${Date.now()}.xbrl`;
      const outputUrl = `https://storage.example.com/${outputFileName}`;

      // Save financial data to database
      for (const statement of financialData.financialStatements) {
        for (const item of statement.items) {
          if (item.taxonomyMatch && item.value !== null) {
            await db.insert(financialData).values({
              jobId,
              taxonomyId: 'temp_taxonomy_id', // Would resolve to actual taxonomy ID
              periodEndDate: statement.periodEndDate,
              value: item.value.toString(),
              unit: item.unit || 'USD',
              scale: 1,
              decimals: item.decimals,
              isNil: item.isNil || false,
              context: {
                type: statement.type,
                fiscalYear: statement.fiscalYear,
                fiscalQuarter: statement.fiscalQuarter
              },
              confidence: item.taxonomyMatch?.confidence || 0,
              sourceReference: item.sourceReference
            });
          }
        }
      }

      // Save AI processing logs
      for (const log of processingLogs) {
        await db.insert(aiProcessingLogs).values({
          jobId,
          processingStep: log.step,
          response: log.details ? JSON.stringify(log.details) : '',
          confidence: 100,
          processingTime: 100,
          modelUsed: 'conversion-service',
          metadata: {
            status: log.status,
            timestamp: log.timestamp,
            error: log.error
          }
        });
      }

      return outputUrl;
    } catch (error) {
      throw new Error(`Failed to save conversion results: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async logAIProcessing(
    jobId: string,
    processingStep: string,
    response: string,
    details: string,
    confidence: number,
    tokensUsed: number,
    modelUsed: string
  ): Promise<void> {
    try {
      await db.insert(aiProcessingLogs).values({
        jobId,
        processingStep,
        response,
        confidence,
        tokensUsed,
        processingTime: 100, // Simplified
        modelUsed,
        metadata: {
          details,
          timestamp: new Date()
        }
      });
    } catch (error) {
      console.error('Failed to log AI processing:', error);
    }
  }

  async getConversionHistory(userId: string, limit: number = 20): Promise<any[]> {
    try {
      // This would join documents and conversion jobs to get conversion history
      // For now, returning a simplified structure
      const history = await db.select({
        jobId: conversionJobs.id,
        documentId: conversionJobs.documentId,
        fileName: documents.fileName,
        fileType: documents.fileType,
        status: conversionJobs.status,
        createdAt: conversionJobs.createdAt,
        completedAt: conversionJobs.completedAt,
        outputUrl: conversionJobs.outputUrl
      })
        .from(conversionJobs)
        .innerJoin(documents, eq(conversionJobs.documentId, documents.id))
        .where(eq(documents.userId, userId))
        .orderBy(desc(conversionJobs.createdAt))
        .limit(limit);

      return history;
    } catch (error) {
      throw new Error(`Failed to get conversion history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Singleton instance
export const conversionService = new ConversionService();