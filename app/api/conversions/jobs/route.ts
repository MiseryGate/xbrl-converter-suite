import { NextRequest, NextResponse } from 'next/server';
import { conversionService } from '@/lib/services';
import { jobQueueService } from '@/lib/services';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const CreateJobSchema = z.object({
  documentId: z.string().uuid(),
  options: z.object({
    targetFramework: z.enum(['US-GAAP', 'IFRS', 'Other']).optional(),
    targetCurrency: z.string().length(3).optional(),
    aiAssistedMapping: z.boolean().optional().default(false),
    validationLevel: z.enum(['basic', 'strict']).optional().default('basic'),
    outputFormat: z.enum(['xbrl', 'json', 'both']).optional().default('xbrl')
  }).optional()
});

export async function POST(request: NextRequest) {
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

    // Parse and validate request body
    const body = await request.json();
    const validatedData = CreateJobSchema.parse(body);

    // Create conversion job
    const result = await conversionService.initiateConversion(
      validatedData.documentId,
      validatedData.options
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      documentId: result.documentId,
      message: 'Conversion job initiated successfully',
      statusUrl: `/api/conversions/jobs/${result.jobId}/status`
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Create job error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as any;
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get user's conversion jobs
    const jobs = await jobQueueService.getJobsByUserId(session.user.id);

    // Filter by status if provided
    let filteredJobs = jobs;
    if (status) {
      filteredJobs = jobs.filter(job => job.status === status);
    }

    // Apply pagination
    const paginatedJobs = filteredJobs.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      jobs: paginatedJobs,
      total: filteredJobs.length,
      limit,
      offset,
      hasMore: offset + limit < filteredJobs.length
    });

  } catch (error) {
    console.error('Get jobs error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}