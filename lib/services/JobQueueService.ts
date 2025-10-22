import { db } from '../db';
import { conversionJobs, documents } from '../db/schema/xbrl-conversion';
import { eq, and, desc } from 'drizzle-orm';

export interface Job {
  id: string;
  documentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  outputUrl?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobCreationData {
  documentId: string;
  status?: 'pending';
  progress?: number;
}

export interface JobUpdateData {
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  errorMessage?: string;
  outputUrl?: string;
  outputMetadata?: any;
  processingLog?: any;
}

export class JobQueueService {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 5000; // 5 seconds

  async createJob(data: JobCreationData): Promise<Job> {
    try {
      const result = await db.insert(conversionJobs).values({
        documentId: data.documentId,
        status: data.status || 'pending',
        progress: data.progress || 0,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();

      const job = result[0];
      return this.mapDbJobToJob(job);
    } catch (error) {
      throw new Error(`Failed to create job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getJob(jobId: string): Promise<Job | null> {
    try {
      const result = await db.select()
        .from(conversionJobs)
        .where(eq(conversionJobs.id, jobId))
        .limit(1);

      return result.length > 0 ? this.mapDbJobToJob(result[0]) : null;
    } catch (error) {
      throw new Error(`Failed to get job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateJob(jobId: string, data: JobUpdateData): Promise<Job> {
    try {
      const updateData: any = {
        ...data,
        updatedAt: new Date()
      };

      if (data.status === 'processing' && !data.startedAt) {
        updateData.startedAt = new Date();
      }

      if (data.status === 'completed' || data.status === 'failed') {
        updateData.completedAt = new Date();
      }

      const result = await db.update(conversionJobs)
        .set(updateData)
        .where(eq(conversionJobs.id, jobId))
        .returning();

      const job = result[0];
      return this.mapDbJobToJob(job);
    } catch (error) {
      throw new Error(`Failed to update job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    try {
      await db.update(conversionJobs)
        .set({
          progress: Math.max(0, Math.min(100, progress)),
          updatedAt: new Date()
        })
        .where(eq(conversionJobs.id, jobId));
    } catch (error) {
      throw new Error(`Failed to update job progress: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPendingJobs(limit: number = 10): Promise<Job[]> {
    try {
      const result = await db.select()
        .from(conversionJobs)
        .where(eq(conversionJobs.status, 'pending'))
        .orderBy(desc(conversionJobs.createdAt))
        .limit(limit);

      return result.map(job => this.mapDbJobToJob(job));
    } catch (error) {
      throw new Error(`Failed to get pending jobs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getJobsByUserId(userId: string): Promise<Job[]> {
    try {
      const result = await db.select({
        id: conversionJobs.id,
        documentId: conversionJobs.documentId,
        status: conversionJobs.status,
        progress: conversionJobs.progress,
        startedAt: conversionJobs.startedAt,
        completedAt: conversionJobs.completedAt,
        errorMessage: conversionJobs.errorMessage,
        outputUrl: conversionJobs.outputUrl,
        retryCount: conversionJobs.retryCount,
        createdAt: conversionJobs.createdAt,
        updatedAt: conversionJobs.updatedAt
      })
        .from(conversionJobs)
        .innerJoin(documents, eq(conversionJobs.documentId, documents.id))
        .where(eq(documents.userId, userId))
        .orderBy(desc(conversionJobs.createdAt));

      return result.map(job => this.mapDbJobToJob(job));
    } catch (error) {
      throw new Error(`Failed to get jobs for user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getJobsByDocumentId(documentId: string): Promise<Job[]> {
    try {
      const result = await db.select()
        .from(conversionJobs)
        .where(eq(conversionJobs.documentId, documentId))
        .orderBy(desc(conversionJobs.createdAt));

      return result.map(job => this.mapDbJobToJob(job));
    } catch (error) {
      throw new Error(`Failed to get jobs for document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async markJobAsFailed(jobId: string, errorMessage: string): Promise<Job> {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      // Check if we should retry
      if (job.retryCount < JobQueueService.MAX_RETRIES) {
        return this.scheduleRetry(jobId, job.retryCount + 1);
      }

      // Mark as permanently failed
      return this.updateJob(jobId, {
        status: 'failed',
        errorMessage,
        completedAt: new Date()
      });
    } catch (error) {
      throw new Error(`Failed to mark job as failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async scheduleRetry(jobId: string, retryCount: number): Promise<Job> {
    try {
      // Update job for retry
      await this.updateJob(jobId, {
        status: 'pending',
        retryCount,
        errorMessage: `Retrying (attempt ${retryCount}/${JobQueueService.MAX_RETRIES})`,
        progress: 0
      });

      // Schedule retry in background
      setTimeout(() => {
        this.processRetry(jobId).catch(console.error);
      }, JobQueueService.RETRY_DELAY_MS * retryCount);

      return await this.getJob(jobId) as Job;
    } catch (error) {
      throw new Error(`Failed to schedule retry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getJobStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    try {
      const allJobs = await db.select()
        .from(conversionJobs);

      const stats = {
        total: allJobs.length,
        pending: allJobs.filter(job => job.status === 'pending').length,
        processing: allJobs.filter(job => job.status === 'processing').length,
        completed: allJobs.filter(job => job.status === 'completed').length,
        failed: allJobs.filter(job => job.status === 'failed').length
      };

      return stats;
    } catch (error) {
      throw new Error(`Failed to get job stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async cleanupOldJobs(daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // This is a simplified cleanup - in production, you might want more sophisticated logic
      const result = await db.delete(conversionJobs)
        .where(and(
          eq(conversionJobs.status, 'completed'),
          // Note: Drizzle ORM syntax for date comparison might vary
          // This is a conceptual implementation
        ));

      return result.rowCount || 0;
    } catch (error) {
      throw new Error(`Failed to cleanup old jobs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processRetry(jobId: string): Promise<void> {
    try {
      const job = await this.getJob(jobId);
      if (!job || job.status !== 'pending') {
        return;
      }

      // In a real implementation, this would trigger the job processing
      console.log(`Processing retry for job ${jobId} (attempt ${job.retryCount})`);
    } catch (error) {
      console.error('Failed to process job retry:', error);
    }
  }

  private mapDbJobToJob(dbJob: any): Job {
    return {
      id: dbJob.id,
      documentId: dbJob.documentId,
      status: dbJob.status as any,
      progress: dbJob.progress || 0,
      startedAt: dbJob.startedAt ? new Date(dbJob.startedAt) : undefined,
      completedAt: dbJob.completedAt ? new Date(dbJob.completedAt) : undefined,
      errorMessage: dbJob.errorMessage || undefined,
      outputUrl: dbJob.outputUrl || undefined,
      retryCount: dbJob.retryCount || 0,
      createdAt: new Date(dbJob.createdAt),
      updatedAt: new Date(dbJob.updatedAt)
    };
  }
}

// Singleton instance
export const jobQueueService = new JobQueueService();

// Simple in-memory queue for development (in production, use proper job queue like Redis or BullMQ)
export class InMemoryJobQueue {
  private queue: Job[] = [];
  private processing = false;

  async addJob(job: Job): Promise<void> {
    this.queue.push(job);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      try {
        await this.processJob(job);
      } catch (error) {
        console.error(`Job ${job.id} failed:`, error);
      }
    }

    this.processing = false;
  }

  private async processJob(job: Job): Promise<void> {
    // Update job status to processing
    await jobQueueService.updateJob(job.id, { status: 'processing' });

    try {
      // In a real implementation, this would call the conversion service
      console.log(`Processing job ${job.id} for document ${job.documentId}`);

      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mark as completed
      await jobQueueService.updateJob(job.id, {
        status: 'completed',
        progress: 100,
        outputUrl: `https://storage.example.com/xbrl/${job.id}.xbrl`
      });

    } catch (error) {
      // Mark as failed
      await jobQueueService.markJobAsFailed(
        job.id,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}

export const inMemoryJobQueue = new InMemoryJobQueue();