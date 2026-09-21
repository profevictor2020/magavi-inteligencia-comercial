import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the MAGAVI foundation and a successful health check', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', database: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    render(<App />)

    expect(screen.getByRole('heading', { name: /mejores oportunidades/i })).toBeInTheDocument()
    expect(await screen.findByText('Aplicación y base de datos disponibles')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/health/', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('shows a useful message when the health endpoint fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'))

    render(<App />)

    expect(await screen.findByText('No fue posible consultar la plataforma')).toBeInTheDocument()
  })
})
