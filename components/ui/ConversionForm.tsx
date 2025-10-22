'use client';

import React, { useState } from 'react';
import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { Badge } from './badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import { Switch } from './switch';
import { Label } from './label';
import { Alert, AlertDescription } from './alert';
import {
  Info,
  Settings,
  Zap,
  ShieldCheck,
  FileText
} from 'lucide-react';

interface ConversionOptions {
  targetFramework: 'US-GAAP' | 'IFRS' | 'Other';
  targetCurrency: string;
  aiAssistedMapping: boolean;
  validationLevel: 'basic' | 'strict';
  outputFormat: 'xbrl' | 'json' | 'both';
}

interface ConversionFormProps {
  documentId: string;
  fileName: string;
  fileType: string;
  onSubmit: (options: ConversionOptions) => Promise<void>;
  loading?: boolean;
  className?: string;
}

export function ConversionForm({
  documentId,
  fileName,
  fileType,
  onSubmit,
  loading = false,
  className = ''
}: ConversionFormProps) {
  const [options, setOptions] = useState<ConversionOptions>({
    targetFramework: 'US-GAAP',
    targetCurrency: 'USD',
    aiAssistedMapping: true,
    validationLevel: 'basic',
    outputFormat: 'xbrl'
  });

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await onSubmit(options);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start conversion');
    }
  };

  const frameworkInfo = {
    'US-GAAP': {
      description: 'United States Generally Accepted Accounting Principles',
      usage: 'Used by US companies and SEC filings',
      color: 'blue'
    },
    'IFRS': {
      description: 'International Financial Reporting Standards',
      usage: 'Used internationally and in many countries',
      color: 'green'
    },
    'Other': {
      description: 'Custom or local accounting standards',
      usage: 'For specialized accounting frameworks',
      color: 'gray'
    }
  };

  const currentFrameworkInfo = frameworkInfo[options.targetFramework];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* File Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Document Details</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{fileName}</p>
              <p className="text-sm text-gray-600">
                Type: <Badge variant="outline" className="ml-1">{fileType.toUpperCase()}</Badge>
              </p>
            </div>
            <Badge variant="secondary">
              Ready for conversion
            </Badge>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Taxonomy Framework */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Settings className="h-5 w-5" />
              <span>Taxonomy Framework</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(frameworkInfo).map(([key, info]) => (
                <div
                  key={key}
                  className={`
                    relative p-4 border-2 rounded-lg cursor-pointer transition-colors
                    ${options.targetFramework === key
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                    }
                  `}
                  onClick={() => setOptions(prev => ({ ...prev, targetFramework: key as any }))}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{key}</span>
                    {options.targetFramework === key && (
                      <div className="w-3 h-3 bg-blue-500 rounded-full" />
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{info.description}</p>
                  <p className="text-xs text-gray-500 mt-2">{info.usage}</p>
                </div>
              ))}
            </div>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Choose the accounting framework that matches your target reporting requirements.
                US-GAAP is most common for US companies, while IFRS is used internationally.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Advanced Options */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Zap className="h-5 w-5" />
              <span>Advanced Options</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="currency">Target Currency</Label>
                <Select
                  value={options.targetCurrency}
                  onValueChange={(value) => setOptions(prev => ({ ...prev, targetCurrency: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="GBP">GBP - British Pound</SelectItem>
                    <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                    <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                    <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                    <SelectItem value="CHF">CHF - Swiss Franc</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="validation">Validation Level</Label>
                <Select
                  value={options.validationLevel}
                  onValueChange={(value: 'basic' | 'strict') => setOptions(prev => ({ ...prev, validationLevel: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">
                      <div>
                        <div className="font-medium">Basic</div>
                        <div className="text-sm text-gray-500">Standard validation checks</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="strict">
                      <div>
                        <div className="font-medium">Strict</div>
                        <div className="text-sm text-gray-500">Comprehensive validation with error-on-warning</div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="output">Output Format</Label>
                <Select
                  value={options.outputFormat}
                  onValueChange={(value: 'xbrl' | 'json' | 'both') => setOptions(prev => ({ ...prev, outputFormat: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xbrl">XBRL only</SelectItem>
                    <SelectItem value="json">JSON only</SelectItem>
                    <SelectItem value="both">XBRL + JSON</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="ai-assisted" className="flex items-center space-x-2">
                    <Zap className="h-4 w-4" />
                    <span>AI-Assisted Mapping</span>
                  </Label>
                  <p className="text-sm text-gray-500">
                    Use AI to automatically map financial concepts to XBRL taxonomy
                  </p>
                </div>
                <Switch
                  id="ai-assisted"
                  checked={options.aiAssistedMapping}
                  onCheckedChange={(checked) => setOptions(prev => ({ ...prev, aiAssistedMapping: checked }))}
                />
              </div>

              {options.aiAssistedMapping && (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertDescription>
                    AI-assisted mapping provides higher accuracy for complex financial statements
                    and may require additional processing time. Your data is processed securely
                    and is not used for training purposes.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Submit Button */}
        <div className="flex justify-end">
          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="min-w-[200px]"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Starting Conversion...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Start Conversion
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}