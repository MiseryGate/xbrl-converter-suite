'use client';

import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import { Badge } from './badge';
import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import {
  Download,
  Eye,
  RefreshCw,
  MoreHorizontal,
  FileText,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ConversionJob {
  id: string;
  documentId: string;
  fileName: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  retryCount: number;
  outputUrl?: string;
  canRetry?: boolean;
  canDownload?: boolean;
  canCancel?: boolean;
}

interface ConversionHistoryTableProps {
  userId?: string;
  className?: string;
  refreshTrigger?: number;
}

export function ConversionHistoryTable({
  userId,
  className = '',
  refreshTrigger = 0
}: ConversionHistoryTableProps) {
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false
  });
  const [filters, setFilters] = useState({
    status: 'all',
    fileType: 'all',
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
        status: filters.status,
        fileType: filters.fileType,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder
      });

      const response = await fetch(`/api/conversions/history?${params}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch conversion history');
      }

      setJobs(result.history);
      setPagination(prev => ({
        ...prev,
        total: result.pagination.total,
        hasMore: result.pagination.hasMore
      }));

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [refreshTrigger, filters, pagination.limit, pagination.offset]);

  const handleRetry = async (jobId: string) => {
    try {
      const response = await fetch(`/api/conversions/jobs/${jobId}`, {
        method: 'POST'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to retry job');
      }

      // Refresh the jobs list
      fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry job');
    }
  };

  const handleDownload = async (jobId: string, format: string = 'xbrl') => {
    try {
      const response = await fetch(`/api/conversions/results/${jobId}?format=${format}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to download result');
      }

      // Get filename from headers or construct one
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `conversion_${jobId}.${format}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download file');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-500" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'secondary',
      processing: 'default',
      completed: 'success',
      failed: 'destructive'
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const loadMore = () => {
    setPagination(prev => ({
      ...prev,
      offset: prev.offset + prev.limit
    }));
  };

  if (loading && jobs.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mr-3" />
            <span>Loading conversion history...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8 text-red-600">
            <XCircle className="h-8 w-8 mr-3" />
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchJobs}
              className="ml-4"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (jobs.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No conversions yet
            </h3>
            <p className="text-gray-600 mb-4">
              Upload your first financial document to get started with XBRL conversion.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Conversion History</CardTitle>
          <div className="flex items-center space-x-2">
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="px-3 py-1 border rounded text-sm"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="processing">Processing</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchJobs}
            >
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>File Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(job.status)}
                      {getStatusBadge(job.status)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{job.originalName}</div>
                      {job.retryCount > 0 && (
                        <div className="text-xs text-gray-500">
                          Retry {job.retryCount}/3
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase">
                      {job.fileType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {formatFileSize(job.fileSize)}
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    {job.status === 'processing' ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                        <span className="text-xs">{job.progress}%</span>
                      </div>
                    ) : job.status === 'completed' ? (
                      <span className="text-green-600">Complete</span>
                    ) : job.status === 'failed' ? (
                      <span className="text-red-600">Failed</span>
                    ) : (
                      <span className="text-gray-600">Pending</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {job.canDownload && (
                          <>
                            <DropdownMenuItem onClick={() => handleDownload(job.id, 'xbrl')}>
                              <Download className="h-4 w-4 mr-2" />
                              Download XBRL
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownload(job.id, 'json')}>
                              <Download className="h-4 w-4 mr-2" />
                              Download JSON
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownload(job.id, 'analytics')}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Analytics
                            </DropdownMenuItem>
                          </>
                        )}
                        {job.canRetry && (
                          <DropdownMenuItem onClick={() => handleRetry(job.id)}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Retry
                          </DropdownMenuItem>
                        )}
                        {job.errorMessage && (
                          <DropdownMenuItem
                            onClick={() => alert(job.errorMessage)}
                            className="text-red-600"
                          >
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            View Error
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {pagination.hasMore && (
          <div className="flex justify-center mt-4">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load More'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}