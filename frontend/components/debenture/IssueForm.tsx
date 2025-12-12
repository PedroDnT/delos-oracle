'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { CONTRACTS } from '@/lib/contracts'
import { useState } from 'react'

const issueSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  symbol: z.string().min(2, 'Symbol must be at least 2 characters').max(10, 'Symbol too long'),
  isinCode: z.string().length(12, 'ISIN must be exactly 12 characters'),
  vne: z.number().positive('VNE must be positive'),
  totalSupply: z.number().positive('Total supply must be positive').int('Must be a whole number'),
  maturityYears: z.number().min(1, 'At least 1 year').max(30, 'Max 30 years'),
  rateType: z.enum(['PRE', 'DI_SPREAD', 'DI_PERCENT', 'IPCA_SPREAD', 'IGPM_SPREAD']),
  spread: z.number().min(0, 'Spread cannot be negative').max(100, 'Max 100%'),
})

type IssueFormData = z.infer<typeof issueSchema>

export function IssueForm() {
  const { address, isConnected } = useAccount()
  const [deployedAddress, setDeployedAddress] = useState<string>('')

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<IssueFormData>({
    resolver: zodResolver(issueSchema),
    defaultValues: {
      name: 'Test Debenture IPCA+ 2026',
      symbol: 'TEST26',
      isinCode: 'BRTEST000001',
      vne: 1000,
      totalSupply: 1000,
      maturityYears: 2,
      rateType: 'IPCA_SPREAD',
      spread: 5,
    },
  })

  const { writeContract, data: hash, isPending: isWriting } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const onSubmit = (data: IssueFormData) => {
    if (!isConnected) {
      alert('Please connect your wallet first')
      return
    }

    // Convert form data to contract parameters
    const now = BigInt(Math.floor(Date.now() / 1000))
    const maturityDate = now + BigInt(data.maturityYears * 365 * 86400)

    const terms = {
      vne: BigInt(Math.floor(data.vne * 1e6)), // 6 decimals
      totalSupplyUnits: BigInt(data.totalSupply),
      issueDate: now,
      maturityDate: maturityDate,
      anniversaryDay: 15,
      lockUpEndDate: now + BigInt(30 * 86400), // 30 days lock-up
      rateType: ['PRE', 'DI_SPREAD', 'DI_PERCENT', 'IPCA_SPREAD', 'IGPM_SPREAD'].indexOf(data.rateType),
      fixedRate: BigInt(Math.floor(data.spread * 10000)), // 4 decimals (5% = 50000)
      percentDI: 100, // 100% of DI
      couponFrequencyDays: BigInt(180), // Semi-annual
      amortType: 0, // PERCENT_VNE
      isinCode: data.isinCode,
      cetipCode: '',
      series: '1a Serie',
      hasRepactuacao: false,
      hasEarlyRedemption: false,
      comboId: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    }

    try {
      writeContract({
        address: CONTRACTS.factory.address,
        abi: CONTRACTS.factory.abi,
        functionName: 'createDebenture',
        args: [
          data.name,
          data.symbol,
          terms,
          '0x0000000000000000000000000000000000000000', // No payment token (default)
          address || '0x0000000000000000000000000000000000000000', // Trustee = deployer
        ],
      })
    } catch (error) {
      console.error('Error creating debenture:', error)
      alert('Failed to create debenture. Check console for details.')
    }
  }

  if (!isConnected) {
    return (
      <div className="max-w-2xl bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
        <h3 className="text-xl font-bold text-yellow-800 mb-2">Wallet Not Connected</h3>
        <p className="text-yellow-700">
          Please connect your wallet using the button in the top right corner to issue a debenture.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white p-8 rounded-lg shadow-sm border">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Debenture Name
          </label>
          <input
            {...register('name')}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="e.g., Petrobras Debenture IPCA+ 2026"
          />
          {errors.name && (
            <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Symbol
            </label>
            <input
              {...register('symbol')}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="e.g., PETR26"
            />
            {errors.symbol && (
              <p className="text-red-500 text-sm mt-1">{errors.symbol.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              ISIN Code
            </label>
            <input
              {...register('isinCode')}
              maxLength={12}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="12 characters"
            />
            {errors.isinCode && (
              <p className="text-red-500 text-sm mt-1">{errors.isinCode.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              VNE (R$ per unit)
            </label>
            <input
              type="number"
              step="0.01"
              {...register('vne', { valueAsNumber: true })}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="1000"
            />
            {errors.vne && (
              <p className="text-red-500 text-sm mt-1">{errors.vne.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Total Supply (units)
            </label>
            <input
              type="number"
              {...register('totalSupply', { valueAsNumber: true })}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="1000"
            />
            {errors.totalSupply && (
              <p className="text-red-500 text-sm mt-1">{errors.totalSupply.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Maturity (years)
          </label>
          <input
            type="number"
            {...register('maturityYears', { valueAsNumber: true })}
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="2"
          />
          {errors.maturityYears && (
            <p className="text-red-500 text-sm mt-1">{errors.maturityYears.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Rate Type
            </label>
            <select
              {...register('rateType')}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="PRE">PRE (Fixed Rate)</option>
              <option value="DI_SPREAD">DI + Spread</option>
              <option value="DI_PERCENT">% of DI</option>
              <option value="IPCA_SPREAD">IPCA + Spread</option>
              <option value="IGPM_SPREAD">IGPM + Spread</option>
            </select>
            {errors.rateType && (
              <p className="text-red-500 text-sm mt-1">{errors.rateType.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Spread/Rate (%)
            </label>
            <input
              type="number"
              step="0.01"
              {...register('spread', { valueAsNumber: true })}
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="5.00"
            />
            {errors.spread && (
              <p className="text-red-500 text-sm mt-1">{errors.spread.message}</p>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={isWriting || isConfirming}
          className="w-full bg-primary text-white p-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isWriting && 'Preparing Transaction...'}
          {isConfirming && 'Confirming Transaction...'}
          {!isWriting && !isConfirming && 'Create Debenture'}
        </button>

        {hash && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 font-semibold mb-1">Transaction Submitted</p>
            <p className="text-xs text-blue-600 font-mono break-all">
              {hash}
            </p>
            <a
              href={`https://sepolia.arbiscan.io/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline mt-2 inline-block"
            >
              View on Arbiscan →
            </a>
          </div>
        )}

        {isSuccess && (
          <div className="p-4 bg-green-100 border border-green-300 rounded-lg">
            <p className="text-green-800 font-semibold">✓ Debenture Created Successfully!</p>
            <p className="text-sm text-green-700 mt-2">
              Your debenture has been deployed and is now live on Arbitrum Sepolia.
            </p>
            <button
              onClick={() => reset()}
              className="mt-3 text-sm text-green-700 hover:underline"
            >
              Create Another Debenture
            </button>
          </div>
        )}
      </form>

      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
        <h4 className="font-semibold mb-2">Note:</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>Factory address: {CONTRACTS.factory.address}</li>
          <li>Coupon frequency: Semi-annual (180 days)</li>
          <li>Amortization type: Percentage of VNE</li>
          <li>Lock-up period: 30 days</li>
        </ul>
      </div>
    </div>
  )
}
