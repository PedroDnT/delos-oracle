import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { RateDashboard } from '@/components/oracle/RateDashboard'
import { ratesAPI } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  ratesAPI: {
    getAll: jest.fn(),
  },
}))

const getAll = ratesAPI.getAll as jest.Mock

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <RateDashboard />
    </QueryClientProvider>
  )
}

const rate = (rate_type: string, raw_value: number) => ({
  rate_type,
  raw_value,
  real_world_date: 20240101,
  timestamp: Math.floor(Date.now() / 1000),
  is_stale: false,
})

describe('RateDashboard', () => {
  afterEach(() => {
    getAll.mockReset()
  })

  it('shows a loading state while rates are in flight', () => {
    getAll.mockReturnValue(new Promise(() => {}))
    renderDashboard()
    expect(screen.getByText('Loading rates...')).toBeInTheDocument()
  })

  it('renders a card per rate once loaded', async () => {
    getAll.mockResolvedValue({ data: [rate('IPCA', 4.5), rate('CDI', 10.9)] })
    renderDashboard()

    await waitFor(() => expect(screen.getByText('IPCA')).toBeInTheDocument())
    expect(screen.getByText('4.50%')).toBeInTheDocument()
    expect(screen.getByText('CDI')).toBeInTheDocument()
    expect(screen.getByText('10.90%')).toBeInTheDocument()
  })

  it('surfaces backend failures instead of rendering an empty grid', async () => {
    getAll.mockRejectedValue(new Error('Network Error'))
    renderDashboard()

    await waitFor(() =>
      expect(screen.getByText('Failed to load rates')).toBeInTheDocument()
    )
    expect(screen.getByText('Network Error')).toBeInTheDocument()
  })

  it('explains when the oracle has no data yet', async () => {
    getAll.mockResolvedValue({ data: [] })
    renderDashboard()

    await waitFor(() =>
      expect(screen.getByText('No rates available')).toBeInTheDocument()
    )
  })
})
