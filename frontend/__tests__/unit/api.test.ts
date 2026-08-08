import api, { ratesAPI } from '@/lib/api'

describe('ratesAPI', () => {
  const get = jest.spyOn(api, 'get').mockResolvedValue({ data: null } as any)
  const post = jest.spyOn(api, 'post').mockResolvedValue({ data: null } as any)

  afterEach(() => {
    get.mockClear()
    post.mockClear()
  })

  it('defaults to the local backend when no env var is set', () => {
    expect(api.defaults.baseURL).toBe(
      process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000'
    )
  })

  it('requests every rate from /rates', async () => {
    await ratesAPI.getAll()
    expect(get).toHaveBeenCalledWith('/rates')
  })

  it('requests a single rate by type', async () => {
    await ratesAPI.getRate('CDI')
    expect(get).toHaveBeenCalledWith('/rates/CDI')
  })

  it('defaults rate history to 30 days', async () => {
    await ratesAPI.getHistory('IPCA')
    expect(get).toHaveBeenCalledWith('/rates/IPCA/history?days=30')
  })

  it('passes an explicit history window through', async () => {
    await ratesAPI.getHistory('IPCA', 7)
    expect(get).toHaveBeenCalledWith('/rates/IPCA/history?days=7')
  })

  it('posts a sync request with the rate type', async () => {
    await ratesAPI.sync('SELIC')
    expect(post).toHaveBeenCalledWith('/sync', { rate_type: 'SELIC' })
  })

  it('posts a sync request for all rates when no type is given', async () => {
    await ratesAPI.sync()
    expect(post).toHaveBeenCalledWith('/sync', { rate_type: undefined })
  })

  it('requests health from /health', async () => {
    await ratesAPI.health()
    expect(get).toHaveBeenCalledWith('/health')
  })
})
