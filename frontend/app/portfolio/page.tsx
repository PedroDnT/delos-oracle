import { PortfolioList } from '@/components/debenture/PortfolioList'

export default function PortfolioPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900">
          My Portfolio
        </h1>
        <p className="text-gray-600">
          View all issued debentures and your holdings
        </p>
      </div>

      <PortfolioList />
    </main>
  )
}
