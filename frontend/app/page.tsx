import { RateDashboard } from '@/components/oracle/RateDashboard'

export default function HomePage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900">
          DELOS Oracle Dashboard
        </h1>
        <p className="text-gray-600">
          Real-time Brazilian macroeconomic indicators on Arbitrum Sepolia
        </p>
      </div>

      <RateDashboard />
    </main>
  )
}
