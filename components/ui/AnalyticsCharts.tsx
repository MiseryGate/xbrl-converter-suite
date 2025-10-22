'use client';

import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { Badge } from './badge';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  FileText,
  Users,
  AlertCircle
} from 'lucide-react';

interface AnalyticsData {
  overview: {
    totalConversions: number;
    successfulConversions: number;
    failedConversions: number;
    activeConversions: number;
    successRate: number;
  };
  fileTypeDistribution: Record<string, number>;
  monthlyTrend: Array<{
    month: string;
    conversions: number;
  }>;
  financialRatios?: Array<{
    name: string;
    value: number;
    category: string;
    interpretation: string;
  }>;
  insights?: string[];
}

interface AnalyticsChartsProps {
  data: AnalyticsData;
  className?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export function AnalyticsCharts({ data, className = '' }: AnalyticsChartsProps) {
  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) {
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    } else if (current < previous) {
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    }
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  const StatCard = ({
    title,
    value,
    icon: Icon,
    trend,
    color = 'blue'
  }: {
    title: string;
    value: string | number;
    icon: any;
    trend?: number;
    color?: 'blue' | 'green' | 'red' | 'yellow';
  }) => {
    const colorClasses = {
      blue: 'bg-blue-500',
      green: 'bg-green-500',
      red: 'bg-red-500',
      yellow: 'bg-yellow-500'
    };

    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{title}</p>
              <p className="text-2xl font-bold">{value}</p>
              {trend !== undefined && (
                <div className="flex items-center mt-1">
                  {getTrendIcon(trend, 0)}
                  <span className={`text-sm ml-1 ${
                    trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {Math.abs(trend)}% from last month
                  </span>
                </div>
              )}
            </div>
            <div className={`p-3 rounded-full ${colorClasses[color]} bg-opacity-10`}>
              <Icon className={`h-6 w-6 ${colorClasses[color]}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const FileTypeChart = () => {
    const chartData = Object.entries(data.fileTypeDistribution).map(([type, count]) => ({
      name: type.toUpperCase(),
      value: count
    }));

    return (
      <Card>
        <CardHeader>
          <CardTitle>File Type Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  const MonthlyTrendChart = () => {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly Conversion Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="conversions"
                stroke="#8884d8"
                fill="#8884d8"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  const FinancialRatiosChart = () => {
    if (!data.financialRatios || data.financialRatios.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Financial Ratios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center text-gray-500 py-8">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No financial ratio data available</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    const getRatioColor = (value: number, category: string) => {
      if (category === 'liquidity') {
        return value >= 2 ? '#10B981' : value >= 1 ? '#F59E0B' : '#EF4444';
      } else if (category === 'profitability') {
        return value >= 15 ? '#10B981' : value >= 5 ? '#F59E0B' : '#EF4444';
      } else {
        return '#3B82F6';
      }
    };

    return (
      <Card>
        <CardHeader>
          <CardTitle>Financial Ratios Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.financialRatios}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white p-3 border rounded shadow-lg">
                        <p className="font-medium">{data.name}</p>
                        <p className="text-sm">Value: {data.value}</p>
                        <p className="text-sm text-gray-600">{data.interpretation}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="value" fill={(entry: any) => getRatioColor(entry.value, entry.category)}>
                {data.financialRatios.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getRatioColor(entry.value, entry.category)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  };

  const InsightsPanel = () => {
    if (!data.insights || data.insights.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>AI Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center text-gray-500 py-8">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No insights available yet</p>
              <p className="text-sm mt-2">Complete more conversions to get AI-powered insights</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.insights.map((insight, index) => (
              <div
                key={index}
                className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50"
              >
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                </div>
                <p className="text-sm text-gray-700">{insight}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Conversions"
          value={data.overview.totalConversions}
          icon={FileText}
          color="blue"
        />
        <StatCard
          title="Success Rate"
          value={`${data.overview.successRate}%`}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="Active Jobs"
          value={data.overview.activeConversions}
          icon={Users}
          color="yellow"
        />
        <StatCard
          title="Successful"
          value={data.overview.successfulConversions}
          icon={DollarSign}
          color="green"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FileTypeChart />
        <MonthlyTrendChart />
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FinancialRatiosChart />
        <InsightsPanel />
      </div>
    </div>
  );
}