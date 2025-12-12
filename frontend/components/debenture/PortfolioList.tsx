'use client'

import { useAccount, useReadContract } from 'wagmi'
import { CONTRACTS } from '@/lib/contracts'

export function PortfolioList() {
  const { address, isConnected } = useAccount()

  // Read all debentures from factory
  const { data: allDebentures, isLoading } = useReadContract({
    address: CONTRACTS.factory.address,
    abi: CONTRACTS.factory.abi,
    functionName: 'allDebentures',
    args: [],
  })

  if (!isConnected) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
        <h3 className="text-xl font-bold text-yellow-800 mb-2">Wallet Not Connected</h3>
        <p className="text-yellow-700">
          Please connect your wallet to view your portfolio.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="mt-4 text-gray-600">Loading portfolio...</p>
        </div>
      </div>
    )
  }

  const debentures = (allDebentures as string[]) || []

  if (debentures.length === 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
        <h3 className="text-xl font-bold text-blue-800 mb-2">No Debentures Found</h3>
        <p className="text-blue-700 mb-4">
          No debentures have been issued yet. Be the first to create one!
        </p>
        <a
          href="/issue"
          className="inline-block bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Issue Debenture
        </a>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">All Debentures</h2>
        <p className="text-gray-600 mt-1">
          {debentures.length} debenture{debentures.length !== 1 ? 's' : ''} issued
        </p>
      </div>

      <div className="space-y-4">
        {debentures.map((debentureAddress, index) => (
          <DebentureCard
            key={debentureAddress}
            address={debentureAddress as `0x${string}`}
            userAddress={address}
          />
        ))}
      </div>
    </div>
  )
}

function DebentureCard({
  address: debentureAddress,
  userAddress,
}: {
  address: `0x${string}`
  userAddress: `0x${string}` | undefined
}) {
  // Read debenture details
  const { data: name } = useReadContract({
    address: debentureAddress,
    abi: CONTRACTS.debenture.abi,
    functionName: 'name',
  })

  const { data: symbol } = useReadContract({
    address: debentureAddress,
    abi: CONTRACTS.debenture.abi,
    functionName: 'symbol',
  })

  const { data: balance } = useReadContract({
    address: debentureAddress,
    abi: CONTRACTS.debenture.abi,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
  })

  const { data: totalSupply } = useReadContract({
    address: debentureAddress,
    abi: CONTRACTS.debenture.abi,
    functionName: 'totalSupply',
  })

  const userBalance = balance ? Number(balance) / 1e18 : 0
  const total = totalSupply ? Number(totalSupply) / 1e18 : 0
  const hasHoldings = userBalance > 0

  return (
    <div
      className={`border-2 rounded-lg p-6 transition-all ${
        hasHoldings
          ? 'border-green-300 bg-green-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{name as string || 'Loading...'}</h3>
          <p className="text-sm text-gray-600 font-mono">{symbol as string}</p>
        </div>
        {hasHoldings && (
          <span className="bg-green-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
            Your Holdings
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-sm text-gray-600">Contract Address</p>
          <p className="text-sm font-mono text-gray-800 truncate">{debentureAddress}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Total Supply</p>
          <p className="text-sm font-semibold text-gray-800">{total.toLocaleString()} units</p>
        </div>
      </div>

      {userAddress && (
        <div className="border-t pt-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Your Balance</p>
              <p className="text-2xl font-bold text-gray-900">{userBalance.toLocaleString()} units</p>
            </div>
            {hasHoldings && (
              <a
                href={`https://sepolia.arbiscan.io/address/${debentureAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                View on Arbiscan →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
