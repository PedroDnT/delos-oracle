'use client'

import { useQuery } from '@tanstack/react-query'
import { ratesAPI } from '@/lib/api'
import { RateCard } from './RateCard'

export function RateDashboard() {
  const { data: ratesResponse, isLoading, error } = useQuery({
    queryKey: ['rates'],
    queryFn: () => ratesAPI.getAll(),
    refetchInterval: 60000, // Refresh every minute
  })

  const rates = ratesResponse?.data

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="mt-4 text-gray-600">Loading rates...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700 font-semibold">Failed to load rates</p>
        <p className="text-red-600 text-sm mt-2">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
        <p className="text-sm text-gray-600 mt-3">
          Make sure the backend API is running at{' '}
          {process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000'}
        </p>
      </div>
    )
  }

  if (!rates || rates.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
        <p className="text-yellow-700 font-semibold">No rates available</p>
        <p className="text-yellow-600 text-sm mt-2">
          The oracle hasn't been populated with data yet
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Current Macro Rates</h2>
        <div className="text-sm text-gray-500">
          Auto-refreshes every minute
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rates.map((rate) => (
          <RateCard key={rate.rate_type} rate={rate} />
        ))}
      </div>

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">About These Rates</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li><strong>IPCA:</strong> Brazilian Consumer Price Index (monthly inflation)</li>
          <li><strong>CDI:</strong> Interbank Deposit Certificate rate (daily)</li>
          <li><strong>SELIC:</strong> Brazilian Central Bank base interest rate (daily)</li>
          <li><strong>PTAX:</strong> Brazilian Real / US Dollar exchange rate (daily)</li>
          <li><strong>IGPM:</strong> General Market Price Index (monthly inflation)</li>
          <li><strong>TR:</strong> Reference Rate for savings and contracts (daily)</li>
        </ul>
      </div>
    </div>
  )
}
