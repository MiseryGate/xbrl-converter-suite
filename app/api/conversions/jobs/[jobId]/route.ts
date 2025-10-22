import { NextRequest, NextResponse } from 'next/server';
import { jobQueueService } from '@/lib/services';
import { analyticsService } from '@/lib/services';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { documents, conversionJobs } from '@/db/schema/xbrl-conversion';
import { eq, and } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: request.headers
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { jobId } = params;

    // Validate job ID format
    if (!jobId || jobId.length !== 36) {
      return NextResponse.json(
        { error: 'Invalid job ID' },
        { status: 400 }
      );
    }

    // Get job details
    const job = await jobQueueService.getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Verify user owns this job
    const document = await db.select({
      userId: documents.userId
    })
      .from(documents)
      .innerJoin(conversionJobs, eq(conversionJobs.documentId, documents.id))
      .where(and(
        eq(conversionJobs.id, jobId),
        eq(documents.userId, session.user.id)
      ))
      .limit(1);

    if (document.length === 0) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get job status from conversion service
    const conversionResult = await conversionService.getJobStatus(jobId);

    // Get analytics if job is completed
    let analytics = null;
    if (job.status === 'completed') {
      try {
        analytics = await analyticsService.performComprehensiveAnalysis(jobId);
      } catch (error) {
        console.warn('Failed to load analytics for completed job:', error);
      }
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        documentId: job.documentId,
        status: job.status,
        progress: job.progress,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        errorMessage: job.errorMessage,
        retryCount: job.retryCount,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      },
      conversionResult,
      analytics,
      outputUrl: job.outputUrl
    });

  } catch (error) {
    console.error('Get job status error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: request.headers
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { jobId } = params;

    // Validate job ID
    if (!jobId) {
      return NextResponse.json(
        { error: 'Invalid job ID' },
        { status: 400 }
      );
    }

    // Get job and verify ownership
    const job = await jobQueueService.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Verify user owns this job
    const document = await db.select({
      userId: documents.userId
    })
      .from(documents)
      .innerJoin(conversionJobs, eq(conversionJobs.documentId, documents.id))
      .where(and(
        eq(conversionJobs.id, jobId),
        eq(documents.userId, session.user.id)
      ))
      .limit(1);

    if (document.length === 0) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Only allow deletion of completed or failed jobs
    if (!['completed', 'failed'].includes(job.status)) {
      return NextResponse.json(
        { error: 'Cannot delete job that is currently processing' },
        { status: 400 }
      );
    }

    // In a real implementation, you might want to mark as deleted rather than actually delete
    // For now, we'll update the status to indicate cancellation
    await jobQueueService.updateJob(jobId, {
      status: 'failed',
      errorMessage: 'Job cancelled by user',
      completedAt: new Date()
    });

    return NextResponse.json({
      success: true,
      message: 'Job cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel job error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Retry a failed job
export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    // Authenticate user
    const session = await auth.api.getSession({
      headers: request.headers
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { jobId } = params;

    // Get job and verify ownership
    const job = await jobQueueService.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Verify user owns this job
    const document = await db.select({
      userId: documents.userId
    })
      .from(documents)
      .innerJoin(conversionJobs, eq(conversionJobs.documentId, documents.id))
      .where(and(
        eq(conversionJobs.id, jobId),
        eq(documents.userId, session.user.id)
      ))
      .limit(1);

    if (document.length === 0) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Only allow retry of failed jobs
    if (job.status !== 'failed') {
      return NextResponse.json(
        { error: 'Can only retry failed jobs' },
        { status: 400 }
      );
    }

    // Check if retry limit has been reached
    if (job.retryCount >= 3) {
      return NextResponse.json(
        { error: 'Maximum retry limit reached' },
        { status: 400 }
      );
    }

    // Schedule retry
    await jobQueueService.scheduleRetry(jobId, job.retryCount + 1);

    return NextResponse.json({
      success: true,
      message: 'Job retry scheduled',
      retryCount: job.retryCount + 1
    });

  } catch (error) {
    console.error('Retry job error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}