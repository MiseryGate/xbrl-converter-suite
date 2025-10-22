import { NextRequest, NextResponse } from 'next/server';
import { jobQueueService } from '@/lib/services';
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
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'xbrl';

    // Validate job ID
    if (!jobId) {
      return NextResponse.json(
        { error: 'Invalid job ID' },
        { status: 400 }
      );
    }

    // Validate format
    if (!['xbrl', 'json', 'analytics'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid format. Supported formats: xbrl, json, analytics' },
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
      userId: documents.userId,
      originalName: documents.originalName,
      fileType: documents.fileType
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

    // Check if job is completed
    if (job.status !== 'completed') {
      return NextResponse.json(
        { error: 'Job has not completed yet', status: job.status },
        { status: 400 }
      );
    }

    // Check if output URL is available
    if (!job.outputUrl) {
      return NextResponse.json(
        { error: 'Output file not available' },
        { status: 404 }
      );
    }

    if (format === 'xbrl') {
      // Download XBRL file
      return await downloadXBRLFile(job, document[0]);
    } else if (format === 'json') {
      // Download JSON version
      return await downloadJSONFile(job, document[0]);
    } else if (format === 'analytics') {
      // Download analytics report
      return await downloadAnalyticsReport(job, document[0]);
    }

  } catch (error) {
    console.error('Download result error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function downloadXBRLFile(job: any, document: any): Promise<NextResponse> {
  try {
    // In production, you would fetch the file from your cloud storage
    // const fileBuffer = await cloudStorage.getFile(job.outputUrl);

    // For now, simulate the file content
    const fileContent = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated XBRL Document -->
<!-- Original File: ${document.originalName} -->
<!-- Generated: ${new Date().toISOString()} -->
<!-- Job ID: ${job.id} -->
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance">
  <xbrli:context id="current">
    <xbrli:entity>
      <xbrli:identifier scheme="http://www.example.com">EXAMPLE</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period>
      <xbrli:instant>${new Date().toISOString().split('T')[0]}</xbrli:instant>
    </xbrli:period>
  </xbrli:context>
  <xbrli:unit id="USD">
    <xbrli:measure>iso4217:USD</xbrli:measure>
  </xbrli:unit>

  <!-- Sample XBRL content would go here -->
  <us-gaap:Assets contextRef="current" unitRef="USD">1000000</us-gaap:Assets>
  <us-gaap:Liabilities contextRef="current" unitRef="USD">500000</us-gaap:Liabilities>
  <us-gaap:StockholdersEquity contextRef="current" unitRef="USD">500000</us-gaap:StockholdersEquity>
</xbrli:xbrl>`;

    // Generate download filename
    const baseName = document.originalName.replace(/\.[^/.]+$/, '');
    const fileName = `${baseName}_converted_${job.id}.xbrl`;

    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': Buffer.byteLength(fileContent).toString(),
        'Cache-Control': 'no-cache',
        'X-Job-ID': job.id
      }
    });

  } catch (error) {
    throw new Error(`Failed to generate XBRL file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function downloadJSONFile(job: any, document: any): Promise<NextResponse> {
  try {
    // Generate JSON representation of the conversion results
    const jsonContent = {
      metadata: {
        jobId: job.id,
        originalFileName: document.originalName,
        originalFileType: document.fileType,
        conversionDate: job.completedAt,
        status: job.status
      },
      financialData: {
        // This would contain the structured financial data
        statements: [
          {
            type: 'balance_sheet',
            periodEndDate: new Date().toISOString(),
            items: [
              { concept: 'Assets', value: 1000000, unit: 'USD' },
              { concept: 'Liabilities', value: 500000, unit: 'USD' },
              { concept: 'Equity', value: 500000, unit: 'USD' }
            ]
          }
        ]
      },
      taxonomyMappings: [
        {
          sourceConcept: 'Assets',
          xbrlTag: 'us-gaap:Assets',
          confidence: 95,
          framework: 'US-GAAP'
        }
      ]
    };

    const fileContent = JSON.stringify(jsonContent, null, 2);

    // Generate download filename
    const baseName = document.originalName.replace(/\.[^/.]+$/, '');
    const fileName = `${baseName}_converted_${job.id}.json`;

    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': Buffer.byteLength(fileContent).toString(),
        'Cache-Control': 'no-cache',
        'X-Job-ID': job.id
      }
    });

  } catch (error) {
    throw new Error(`Failed to generate JSON file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function downloadAnalyticsReport(job: any, document: any): Promise<NextResponse> {
  try {
    // Generate analytics report
    const analyticsContent = {
      metadata: {
        jobId: job.id,
        originalFileName: document.originalName,
        reportGeneratedAt: new Date().toISOString(),
        dataQuality: 'high'
      },
      financialRatios: [
        {
          name: 'Current Ratio',
          value: 2.0,
          formula: 'Current Assets / Current Liabilities',
          interpretation: 'Strong liquidity position',
          category: 'liquidity'
        },
        {
          name: 'Debt-to-Equity Ratio',
          value: 1.0,
          formula: 'Total Liabilities / Total Equity',
          interpretation: 'Moderate debt levels',
          category: 'solvency'
        }
      ],
      insights: [
        'Strong liquidity position with current ratio of 2.0',
        'Moderate debt levels provide good financial flexibility',
        'Profitability metrics indicate solid operational performance'
      ],
      recommendations: [
        'Maintain current liquidity levels',
        'Monitor debt-to-equity ratio for any increases',
        'Consider optimizing working capital management'
      ]
    };

    const fileContent = JSON.stringify(analyticsContent, null, 2);

    // Generate download filename
    const baseName = document.originalName.replace(/\.[^/.]+$/, '');
    const fileName = `${baseName}_analytics_${job.id}.json`;

    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': Buffer.byteLength(fileContent).toString(),
        'Cache-Control': 'no-cache',
        'X-Job-ID': job.id
      }
    });

  } catch (error) {
    throw new Error(`Failed to generate analytics report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}