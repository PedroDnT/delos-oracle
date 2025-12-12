'use client'

import { formatDistanceToNow } from 'date-fns'

interface RateCardProps {
  rate: {
    rate_type: string
    raw_value: number
    real_world_date: number
    timestamp: number
    is_stale: boolean
  }
}

export function RateCard({ rate }: RateCardProps) {
  const formatDate = (yyyymmdd: number) => {
    const str = yyyymmdd.toString()
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`
  }

  const getRateIcon = (type: string) => {
    const icons: Record<string, string> = {
      IPCA: '📈',
      CDI: '💹',
      SELIC: '🏦',
      PTAX: '💱',
      IGPM: '📊',
      TR: '💰',
    }
    return icons[type] || '📊'
  }

  return (
    <div
      className={`p-6 rounded-lg border-2 transition-all hover:shadow-lg ${
        rate.is_stale
          ? 'border-red-500 bg-red-50'
          : 'border-gray-200 bg-white hover:border-primary'
      }`}
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-bold text-gray-800">{rate.rate_type}</h3>
        <span className="text-3xl">{getRateIcon(rate.rate_type)}</span>
      </div>

      <p className="text-4xl font-mono font-bold text-primary mb-4">
        {rate.rate_type === 'PTAX'
          ? rate.raw_value.toFixed(3)
          : `${rate.raw_value.toFixed(2)}%`}
      </p>

      <div className="space-y-1 text-sm">
        <p className="text-gray-600">
          <span className="font-semibold">Date:</span>{' '}
          {formatDate(rate.real_world_date)}
        </p>
        <p className="text-gray-500 text-xs">
          Updated {formatDistanceToNow(rate.timestamp * 1000, { addSuffix: true })}
        </p>
      </div>

      {rate.is_stale && (
        <div className="mt-3 px-3 py-2 bg-red-100 border border-red-300 rounded text-xs text-red-700 font-semibold">
          ⚠️ Stale data - needs update
        </div>
      )}
    </div>
  )
}
