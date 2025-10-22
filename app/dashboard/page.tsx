'use client';

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileUploader } from "@/components/ui/FileUploader"
import { ConversionHistoryTable } from "@/components/ui/ConversionHistoryTable"
import { AnalyticsCharts } from "@/components/ui/AnalyticsCharts"
import { ConversionForm } from "@/components/ui/ConversionForm"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Upload, FileText, BarChart3, History, Plus, CheckCircle, AlertCircle } from "lucide-react"

export default function Page() {
  const [activeTab, setActiveTab] = useState('upload')
  const [uploadedFile, setUploadedFile] = useState<any>(null)
  const [conversionJob, setConversionJob] = useState<any>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [analyticsData, setAnalyticsData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileUploadSuccess = (result: any) => {
    setUploadedFile(result)
    setActiveTab('convert')
    setError(null)
  }

  const handleFileUploadError = (error: string) => {
    setError(error)
  }

  const handleStartConversion = async (options: any) => {
    if (!uploadedFile) {
      setError('Please upload a file first')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/conversions/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: uploadedFile.documentId,
          options
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to start conversion')
      }

      setConversionJob(result)
      setActiveTab('history')
      setRefreshTrigger(prev => prev + 1)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start conversion')
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalyticsData = async () => {
    try {
      const response = await fetch('/api/conversions/history')
      const result = await response.json()

      if (response.ok) {
        setAnalyticsData(result.stats)
      }
    } catch (err) {
      console.error('Failed to fetch analytics data:', err)
    }
  }

  useEffect(() => {
    fetchAnalyticsData()
  }, [refreshTrigger])

  const showWelcome = !uploadedFile && !conversionJob
  const showConversionOptions = uploadedFile && !conversionJob

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">XBRL Converter</h1>
            <p className="text-muted-foreground">
              Convert financial documents to XBRL format with AI-powered mapping
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            Beta
          </Badge>
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success Messages */}
        {conversionJob?.success && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Conversion job started successfully! Job ID: {conversionJob.jobId}
            </AlertDescription>
          </Alert>
        )}

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload" className="flex items-center space-x-2">
              <Upload className="h-4 w-4" />
              <span>Upload</span>
            </TabsTrigger>
            <TabsTrigger value="convert" disabled={!uploadedFile} className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Convert</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center space-x-2">
              <History className="h-4 w-4" />
              <span>History</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Analytics</span>
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload" className="space-y-6">
            {showWelcome && (
              <Card>
                <CardHeader>
                  <CardTitle>Welcome to XBRL Converter</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <Upload className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold mb-2">
                      Transform Your Financial Documents
                    </h3>
                    <p className="text-gray-600 mb-6 max-w-md mx-auto">
                      Upload your financial documents (CSV, Excel, PDF, JSON, or XBRL) and convert them
                      to standardized XBRL format with intelligent taxonomy mapping.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <div className="font-medium text-blue-900 mb-1">Smart Parsing</div>
                        <div className="text-blue-700">
                          AI-powered extraction from any financial format
                        </div>
                      </div>
                      <div className="p-4 bg-green-50 rounded-lg">
                        <div className="font-medium text-green-900 mb-1">Taxonomy Matching</div>
                        <div className="text-green-700">
                          Automatic mapping to US-GAAP and IFRS standards
                        </div>
                      </div>
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <div className="font-medium text-purple-900 mb-1">Analytics</div>
                        <div className="text-purple-700">
                          Financial ratios and insights generation
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <FileUploader
              onUploadSuccess={handleFileUploadSuccess}
              onUploadError={handleFileUploadError}
            />
          </TabsContent>

          {/* Convert Tab */}
          <TabsContent value="convert" className="space-y-6">
            {showConversionOptions && uploadedFile && (
              <ConversionForm
                documentId={uploadedFile.documentId}
                fileName={uploadedFile.fileName}
                fileType={uploadedFile.fileType}
                onSubmit={handleStartConversion}
                loading={loading}
              />
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            <ConversionHistoryTable
              refreshTrigger={refreshTrigger}
            />
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            {analyticsData ? (
              <AnalyticsCharts data={analyticsData} />
            ) : (
              <Card>
                <CardContent className="p-6">
                  <div className="text-center py-8">
                    <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Analytics Loading
                    </h3>
                    <p className="text-gray-600">
                      Your analytics data is being processed...
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Quick Actions */}
        {activeTab === 'upload' && uploadedFile && (
          <div className="fixed bottom-8 right-8">
            <Button
              onClick={() => setActiveTab('convert')}
              size="lg"
              className="shadow-lg"
            >
              <Plus className="h-4 w-4 mr-2" />
              Convert Uploaded File
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}