import { NextRequest, NextResponse } from 'next/server';
import { conversionService } from '@/lib/services';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { documents, conversionJobs } from '@/db/schema/xbrl-conversion';
import { eq, and, desc, sql } from 'drizzle-orm';
import { z } from 'zod';

const HistoryQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'all']).optional().default('all'),
  fileType: z.enum(['csv', 'excel', 'pdf', 'json', 'xbrl', 'all']).optional().default('all'),
  sortBy: z.enum(['createdAt', 'completedAt', 'fileSize', 'status']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
});

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

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams.entries());
    const validatedQuery = HistoryQuerySchema.parse(query);

    const limit = Math.min(parseInt(validatedQuery.limit || '20'), 100);
    const offset = parseInt(validatedQuery.offset || '0');

    // Build base query
    let baseQuery = db.select({
      jobId: conversionJobs.id,
      documentId: conversionJobs.documentId,
      fileName: documents.fileName,
      originalName: documents.originalName,
      fileType: documents.fileType,
      fileSize: documents.fileSize,
      mimeType: documents.mimeType,
      status: conversionJobs.status,
      progress: conversionJobs.progress,
      createdAt: conversionJobs.createdAt,
      startedAt: conversionJobs.startedAt,
      completedAt: conversionJobs.completedAt,
      errorMessage: conversionJobs.errorMessage,
      retryCount: conversionJobs.retryCount,
      outputUrl: conversionJobs.outputUrl,
      documentStatus: documents.status
    })
      .from(conversionJobs)
      .innerJoin(documents, eq(conversionJobs.documentId, documents.id))
      .where(eq(documents.userId, session.user.id));

    // Apply filters
    const conditions = [];

    if (validatedQuery.status !== 'all') {
      conditions.push(eq(conversionJobs.status, validatedQuery.status));
    }

    if (validatedQuery.fileType !== 'all') {
      conditions.push(eq(documents.fileType, validatedQuery.fileType));
    }

    if (conditions.length > 0) {
      baseQuery = baseQuery.where(and(...conditions));
    }

    // Apply sorting
    const sortField = validatedQuery.sortBy;
    const sortDirection = validatedQuery.sortOrder === 'desc' ? desc : undefined;

    switch (sortField) {
      case 'createdAt':
        baseQuery = baseQuery.orderBy(desc(conversionJobs.createdAt));
        break;
      case 'completedAt':
        baseQuery = baseQuery.orderBy(desc(conversionJobs.completedAt));
        break;
      case 'fileSize':
        baseQuery = baseQuery.orderBy(desc(documents.fileSize));
        break;
      case 'status':
        baseQuery = baseQuery.orderBy(conversionJobs.status);
        break;
      default:
        baseQuery = baseQuery.orderBy(desc(conversionJobs.createdAt));
    }

    // Execute query with pagination
    const history = await baseQuery.limit(limit).offset(offset);

    // Get total count for pagination
    const totalCount = await db.select({ count: sql`count(*)` })
      .from(conversionJobs)
      .innerJoin(documents, eq(conversionJobs.documentId, documents.id))
      .where(and(
        eq(documents.userId, session.user.id),
        ...conditions
      ));

    // Calculate statistics
    const stats = await calculateConversionStats(session.user.id);

    return NextResponse.json({
      success: true,
      history: history.map(item => ({
        ...item,
        canRetry: item.status === 'failed' && item.retryCount < 3,
        canDownload: item.status === 'completed' && item.outputUrl,
        canCancel: ['pending', 'processing'].includes(item.status)
      })),
      pagination: {
        total: totalCount[0]?.count || 0,
        limit,
        offset,
        hasMore: offset + limit < (totalCount[0]?.count || 0)
      },
      filters: {
        status: validatedQuery.status,
        fileType: validatedQuery.fileType,
        sortBy: validatedQuery.sortBy,
        sortOrder: validatedQuery.sortOrder
      },
      stats
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Get conversion history error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function calculateConversionStats(userId: string) {
  try {
    const stats = await db.select({
      total: sql`count(*)`,
      completed: sql`count(*) filter (where ${conversionJobs.status} = 'completed')`,
      failed: sql`count(*) filter (where ${conversionJobs.status} = 'failed')`,
      processing: sql`count(*) filter (where ${conversionJobs.status} = 'processing')`,
      pending: sql`count(*) filter (where ${conversionJobs.status} = 'pending')`
    })
      .from(conversionJobs)
      .innerJoin(documents, eq(conversionJobs.documentId, documents.id))
      .where(eq(documents.userId, userId));

    const result = stats[0];

    // Calculate file type distribution
    const fileTypeStats = await db.select({
      fileType: documents.fileType,
      count: sql`count(*)`
    })
      .from(documents)
      .where(eq(documents.userId, userId))
      .groupBy(documents.fileType);

    // Calculate monthly conversion trend (last 6 months)
    const monthlyTrend = await db.select({
      month: sql`date_trunc('month', ${conversionJobs.createdAt})`,
      count: sql`count(*)`
    })
      .from(conversionJobs)
      .innerJoin(documents, eq(conversionJobs.documentId, documents.id))
      .where(and(
        eq(documents.userId, userId),
        sql`${conversionJobs.createdAt} >= now() - interval '6 months'`
      ))
      .groupBy(sql`date_trunc('month', ${conversionJobs.createdAt})`)
      .orderBy(sql`date_trunc('month', ${conversionJobs.createdAt})`);

    return {
      overview: {
        totalConversions: parseInt(result.total as string) || 0,
        successfulConversions: parseInt(result.completed as string) || 0,
        failedConversions: parseInt(result.failed as string) || 0,
        activeConversions: (parseInt(result.processing as string) || 0) + (parseInt(result.pending as string) || 0),
        successRate: result.total ?
          Math.round((parseInt(result.completed as string) / parseInt(result.total as string)) * 100) : 0
      },
      fileTypeDistribution: fileTypeStats.reduce((acc, item) => {
        acc[item.fileType] = parseInt(item.count as string) || 0;
        return acc;
      }, {} as Record<string, number>),
      monthlyTrend: monthlyTrend.map(item => ({
        month: item.month?.toISOString().split('T')[0],
        conversions: parseInt(item.count as string) || 0
      }))
    };

  } catch (error) {
    console.error('Error calculating conversion stats:', error);
    return {
      overview: {
        totalConversions: 0,
        successfulConversions: 0,
        failedConversions: 0,
        activeConversions: 0,
        successRate: 0
      },
      fileTypeDistribution: {},
      monthlyTrend: []
    };
  }
}

