import { render, screen } from '@testing-library/react'
import { RateCard } from '@/components/oracle/RateCard'

const baseRate = {
  rate_type: 'IPCA',
  raw_value: 4.5,
  real_world_date: 20240101,
  timestamp: Math.floor(Date.now() / 1000),
  is_stale: false,
}

describe('RateCard', () => {
  it('renders the rate type', () => {
    render(<RateCard rate={baseRate} />)
    expect(screen.getByText('IPCA')).toBeInTheDocument()
  })

  it('formats percentage rates with two decimals', () => {
    render(<RateCard rate={baseRate} />)
    expect(screen.getByText('4.50%')).toBeInTheDocument()
  })

  it('formats PTAX as an exchange rate, not a percentage', () => {
    render(<RateCard rate={{ ...baseRate, rate_type: 'PTAX', raw_value: 5.8123 }} />)
    expect(screen.getByText('5.812')).toBeInTheDocument()
    expect(screen.queryByText('5.812%')).not.toBeInTheDocument()
  })

  it('renders the reference date in ISO form', () => {
    render(<RateCard rate={baseRate} />)
    expect(screen.getByText('2024-01-01')).toBeInTheDocument()
  })

  it('does not show the stale warning for fresh data', () => {
    render(<RateCard rate={baseRate} />)
    expect(screen.queryByText(/Stale data/)).not.toBeInTheDocument()
  })

  it('shows the stale warning when the rate is stale', () => {
    render(<RateCard rate={{ ...baseRate, is_stale: true }} />)
    expect(screen.getByText(/Stale data/)).toBeInTheDocument()
  })

  it.each(['IPCA', 'CDI', 'SELIC', 'PTAX', 'IGPM', 'TR'])(
    'renders %s without crashing',
    (rateType) => {
      render(<RateCard rate={{ ...baseRate, rate_type: rateType }} />)
      expect(screen.getByText(rateType)).toBeInTheDocument()
    }
  )
})
