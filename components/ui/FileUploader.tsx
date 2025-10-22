'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from './button';
import { Progress } from './progress';
import { Badge } from './badge';
import { Alert, AlertDescription } from './alert';

interface FileUploadResult {
  success: boolean;
  documentId?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  error?: string;
}

interface FileUploaderProps {
  onUploadSuccess?: (result: FileUploadResult) => void;
  onUploadError?: (error: string) => void;
  maxFileSize?: number; // in bytes
  className?: string;
  disabled?: boolean;
}

interface UploadingFile {
  file: File;
  id: string;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  result?: FileUploadResult;
}

const ALLOWED_FILE_TYPES = {
  'text/csv': '.csv',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/pdf': '.pdf',
  'application/json': '.json',
  'application/xml': '.xml',
  'text/xml': '.xml',
  'application/xbrl+xml': '.xbrl'
};

const FILE_TYPE_ICONS = {
  csv: FileText,
  excel: FileText,
  pdf: FileText,
  json: FileText,
  xml: FileText,
  xbrl: FileText
};

export function FileUploader({
  onUploadSuccess,
  onUploadError,
  maxFileSize = 50 * 1024 * 1024, // 50MB default
  className = '',
  disabled = false
}: FileUploaderProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  const uploadFile = async (file: File): Promise<FileUploadResult> => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/conversions/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Upload failed'
        };
      }

      return {
        success: true,
        documentId: result.documentId,
        fileName: result.fileName,
        fileType: result.fileType,
        fileSize: result.fileSize
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      };
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const validFiles = acceptedFiles.filter(file => {
      if (file.size > maxFileSize) {
        onUploadError?.(`File ${file.name} exceeds maximum size limit`);
        return false;
      }
      return true;
    });

    validFiles.forEach(file => {
      const uploadingFile: UploadingFile = {
        file,
        id: Math.random().toString(36).substr(2, 9),
        progress: 0,
        status: 'uploading'
      };

      setUploadingFiles(prev => [...prev, uploadingFile]);

      // Simulate progress (in real app, track actual upload progress)
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 30;
        if (progress >= 90) {
          clearInterval(progressInterval);
        }

        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === uploadingFile.id
              ? { ...f, progress: Math.min(progress, 90) }
              : f
          )
        );
      }, 200);

      uploadFile(file).then(result => {
        clearInterval(progressInterval);

        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === uploadingFile.id
              ? {
                  ...f,
                  progress: 100,
                  status: result.success ? 'success' : 'error',
                  result
                }
              : f
          )
        );

        if (result.success) {
          onUploadSuccess?.(result);
        } else {
          onUploadError?.(result.error || 'Upload failed');
        }

        // Remove from uploading list after a delay
        setTimeout(() => {
          setUploadingFiles(prev => prev.filter(f => f.id !== uploadingFile.id));
        }, result.success ? 2000 : 5000);
      });
    });
  }, [maxFileSize, onUploadSuccess, onUploadError]);

  const { getRootProps, getInputProps, isDragActive: isReactDropzoneActive } = useDropzone({
    onDrop,
    accept: ALLOWED_FILE_TYPES,
    disabled: disabled || uploadingFiles.some(f => f.status === 'uploading'),
    multiple: true
  });

  const removeFile = (id: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== id));
  };

  const getFileTypeIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return extension ? FILE_TYPE_ICONS[extension as keyof typeof FILE_TYPE_ICONS] || FileText : FileText;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const active = isReactDropzoneActive || isDragActive;

  return (
    <div className={`space-y-4 ${className}`}>
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${active
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 hover:border-gray-400'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center space-y-4">
          <Upload className={`h-12 w-12 ${active ? 'text-primary' : 'text-gray-400'}`} />
          <div className="space-y-2">
            <p className="text-lg font-medium">
              {active ? 'Drop files here' : 'Drag & drop financial files here'}
            </p>
            <p className="text-sm text-gray-500">
              or click to browse
            </p>
          </div>
          <div className="space-y-2 text-xs text-gray-400">
            <p>Supported formats: CSV, Excel, PDF, JSON, XBRL</p>
            <p>Maximum file size: {formatFileSize(maxFileSize)}</p>
          </div>
        </div>
      </div>

      {uploadingFiles.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Uploading Files</h4>
          {uploadingFiles.map(file => {
            const Icon = getFileTypeIcon(file.file.name);
            return (
              <div
                key={file.id}
                className={`
                  flex items-center space-x-3 p-3 rounded-lg border
                  ${file.status === 'success' ? 'border-green-200 bg-green-50' :
                    file.status === 'error' ? 'border-red-200 bg-red-50' :
                    'border-gray-200 bg-gray-50'
                  }
                `}
              >
                <Icon className="h-8 w-8 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium truncate">
                      {file.file.name}
                    </p>
                    <div className="flex items-center space-x-2">
                      {file.status === 'uploading' && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {file.status === 'success' && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {file.status === 'error' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(file.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{formatFileSize(file.file.size)}</span>
                    <span>{file.progress}%</span>
                  </div>
                  {file.status === 'uploading' && (
                    <Progress value={file.progress} className="mt-2 h-1" />
                  )}
                  {file.status === 'error' && file.result?.error && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        {file.result.error}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="space-y-2">
          <h5 className="font-medium text-gray-900">Recommended Formats:</h5>
          <ul className="space-y-1 text-gray-600">
            <li>• CSV with clear column headers</li>
            <li>• Excel (.xlsx, .xls) spreadsheets</li>
            <li>• Structured JSON financial data</li>
          </ul>
        </div>
        <div className="space-y-2">
          <h5 className="font-medium text-gray-900">File Requirements:</h5>
          <ul className="space-y-1 text-gray-600">
            <li>• Clear financial statement structure</li>
            <li>• Valid date formats</li>
            <li>• Consistent number formatting</li>
          </ul>
        </div>
      </div>
    </div>
  );
}