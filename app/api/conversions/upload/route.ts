import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { documents } from '@/db/schema/xbrl-conversion';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { FILE_TYPES } from '@/lib/parsers/types';

const ALLOWED_FILE_TYPES = {
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'application/pdf': 'pdf',
  'application/json': 'json',
  'application/xml': 'xbrl',
  'text/xml': 'xbrl',
  'application/xbrl+xml': 'xbrl'
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

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

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds maximum limit of 50MB' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileType = ALLOWED_FILE_TYPES[file.type as keyof typeof ALLOWED_FILE_TYPES];
    if (!fileType) {
      return NextResponse.json(
        { error: 'Unsupported file type. Supported formats: CSV, Excel, PDF, JSON, XBRL' },
        { status: 400 }
      );
    }

    // Validate file name extension
    const fileName = file.name.toLowerCase();
    const validExtensions = ['.csv', '.xlsx', '.xls', '.pdf', '.json', '.xml', '.xbrl'];
    const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

    if (!hasValidExtension) {
      return NextResponse.json(
        { error: 'Invalid file extension' },
        { status: 400 }
      );
    }

    // Generate unique file name
    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `${session.user.id}_${Date.now()}.${fileExtension}`;

    // In a production environment, you would upload to cloud storage
    // For now, we'll simulate the upload and store metadata
    const storageUrl = `https://storage.example.com/files/${uniqueFileName}`;

    // Save file metadata to database
    const result = await db.insert(documents).values({
      userId: session.user.id,
      fileName: uniqueFileName,
      originalName: file.name,
      fileType,
      fileSize: file.size,
      storageUrl,
      mimeType: file.type,
      status: 'uploaded',
      metadata: {
        uploadedAt: new Date(),
        userAgent: request.headers.get('user-agent'),
        ipAddress: request.ip || request.headers.get('x-forwarded-for')
      }
    }).returning();

    const document = result[0];

    // For development, we could save the file locally
    // In production, use cloud storage like AWS S3, Vercel Blob, etc.
    try {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Here you would upload to your cloud storage provider
      // await cloudStorage.upload(uniqueFileName, buffer);

      console.log(`File uploaded: ${file.name} (${file.size} bytes) for user ${session.user.id}`);

    } catch (uploadError) {
      // Update document status to failed if upload fails
      await db.update(documents)
        .set({ status: 'failed' })
        .where(eq(documents.id, document.id));

      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      documentId: document.id,
      fileName: document.originalName,
      fileType: document.fileType,
      fileSize: document.fileSize,
      uploadedAt: document.createdAt
    });

  } catch (error) {
    console.error('Upload error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Generate pre-signed URL for direct cloud upload
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
    const fileName = searchParams.get('fileName');
    const fileType = searchParams.get('fileType');
    const fileSize = searchParams.get('fileSize');

    if (!fileName || !fileType) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedFileType = ALLOWED_FILE_TYPES[fileType as keyof typeof ALLOWED_FILE_TYPES];
    if (!allowedFileType) {
      return NextResponse.json(
        { error: 'Unsupported file type' },
        { status: 400 }
      );
    }

    // Validate file size
    const size = parseInt(fileSize || '0');
    if (size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds maximum limit' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const fileExtension = fileName.toLowerCase().split('.').pop();
    const uniqueFileName = `${session.user.id}_${Date.now()}.${fileExtension}`;

    // In production, generate pre-signed URL for your cloud storage
    // const signedUrl = await cloudStorage.generateSignedUrl(uniqueFileName, fileType, size);

    // For now, return a mock URL
    const mockSignedUrl = `https://storage.example.com/upload/${uniqueFileName}`;

    // Create document record in database
    const result = await db.insert(documents).values({
      userId: session.user.id,
      fileName: uniqueFileName,
      originalName: fileName,
      fileType: allowedFileType,
      fileSize: size,
      storageUrl: `https://storage.example.com/files/${uniqueFileName}`,
      mimeType: fileType,
      status: 'uploading'
    }).returning();

    const document = result[0];

    return NextResponse.json({
      success: true,
      documentId: document.id,
      uploadUrl: mockSignedUrl,
      uniqueFileName,
      expiresIn: 3600 // 1 hour
    });

  } catch (error) {
    console.error('Generate upload URL error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}