import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

const companyA = {
  name: 'Empresa A',
  description: 'Descripción pública A',
  headline: 'Propuesta de Empresa A',
  logo_path: '/static/demo/empresa-a.svg',
  theme: { primary: '#145C5A', secondary: '#F1A950' },
  contact: { email: 'a@example.test', phone: '+56 9 0000 0001' },
  featured_offerings: [{ name: 'Servicio A', description: 'Contenido sintético A' }],
  is_demo: false,
}

const companyB = {
  ...companyA,
  name: 'Empresa B',
  headline: 'Propuesta de Empresa B',
  logo_path: '/static/demo/empresa-b.svg',
  featured_offerings: [{ name: 'Servicio B', description: 'Contenido sintético B' }],
}

function mockJson(data: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => data }))
}

describe('multi-tenant application routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('renders company A public landing', async () => {
    mockJson(companyA)
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Propuesta de Empresa A' })).toBeInTheDocument()
    expect(screen.getByText('Servicio A')).toBeInTheDocument()
    expect(screen.queryByText('Empresa B')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/public/landing/', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('renders company B public landing', async () => {
    mockJson(companyB)
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Propuesta de Empresa B' })).toBeInTheDocument()
    expect(screen.getByText('Servicio B')).toBeInTheDocument()
    expect(screen.queryByText('Servicio A')).not.toBeInTheDocument()
  })

  it('renders the controlled demo returned for an unknown hostname', async () => {
    mockJson({ ...companyA, name: 'Empresa demostrativa', headline: 'Experiencia demo', is_demo: true })
    render(<App />)

    expect(await screen.findByText('SITIO DEMOSTRATIVO')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Experiencia demo' })).toBeInTheDocument()
  })

  it('protects /app/ when the tenant context request is denied', async () => {
    window.history.replaceState({}, '', '/app/')
    mockJson({}, false)
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Necesitas iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al acceso' })).toHaveAttribute('href', '/app/login/')
  })

  it('renders the login route independently', () => {
    window.history.replaceState({}, '', '/app/login/')
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Ingresa a tu espacio comercial' })).toBeInTheDocument()
    expect(vi.isMockFunction(globalThis.fetch)).toBe(false)
  })
})
