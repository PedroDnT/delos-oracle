import api, { ratesAPI } from '@/lib/api'

describe('ratesAPI (Supabase REST)', () => {
  const get = jest.spyOn(api, 'get').mockResolvedValue({ data: [] } as any)

  afterEach(() => {
    get.mockClear()
  })

  it('targets the Supabase REST endpoint', () => {
    // Unset in tests, so the base URL is just the /rest/v1 suffix; in a
    // configured build it is prefixed by NEXT_PUBLIC_SUPABASE_URL.
    expect(api.defaults.baseURL).toMatch(/\/rest\/v1$/)
  })

  it('sends the anon key on every request', () => {
    expect(api.defaults.headers).toHaveProperty('apikey')
    expect(api.defaults.headers).toHaveProperty('Authorization')
  })

  it('reads all current rates from the latest_rates view', async () => {
    await ratesAPI.getAll()
    expect(get).toHaveBeenCalledWith('/latest_rates', {
      params: { select: '*' },
    })
  })

  it('reads history for one rate ordered by reference date', async () => {
    await ratesAPI.getHistory('IPCA')
    expect(get).toHaveBeenCalledWith('/rates', {
      params: {
        select: '*',
        rate_type: 'eq.IPCA',
        order: 'real_world_date.desc',
        limit: 30,
      },
    })
  })

  it('passes an explicit history limit through', async () => {
    await ratesAPI.getHistory('CDI', 7)
    expect(get).toHaveBeenCalledWith(
      '/rates',
      expect.objectContaining({ params: expect.objectContaining({ limit: 7 }) })
    )
  })
})
