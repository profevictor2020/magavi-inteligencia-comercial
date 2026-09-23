import { fireEvent, render, screen } from '@testing-library/react'
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
  products: [{
    id: 'product-a',
    name: 'Café premium',
    description: 'Café para negocios',
    sku: 'CAFE-001',
    format: 'Caja 12 unidades',
    price: '24990.00',
    category: 'Abarrotes',
  }],
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
    expect(screen.getByRole('heading', { name: 'Café premium' })).toBeInTheDocument()
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

  it('sends a public quote request for selected products', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => companyA })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'quote-1' }) }))
    render(<App />)

    await screen.findByRole('heading', { name: 'Propuesta de Empresa A' })
    fireEvent.click(screen.getByRole('checkbox', { name: /Café premium/ }))
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Cliente de prueba' } })
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'cliente@example.test' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Solicitud enviada')
    expect(fetch).toHaveBeenLastCalledWith('/api/inquiries/public/', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('product-a'),
    }))
  })

  it('protects /app/ when the tenant context request is denied', async () => {
    window.history.replaceState({}, '', '/app/')
    mockJson({}, false)
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Necesitas iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al acceso' })).toHaveAttribute('href', '/app/login/')
  })

  it('shows the tenant catalog controls to an owner', async () => {
    window.history.replaceState({}, '', '/app/')
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const payload = url.includes('/tenant/context/')
        ? { id: 'tenant-a', name: 'Empresa A', role: 'OWNER' }
        : url.includes('/inquiries/')
          ? []
        : url.includes('/categories/')
          ? [{ id: 'category-a', name: 'Abarrotes', description: '', is_active: true }]
          : url.includes('/products/')
            ? [{ ...companyA.products[0], category: 'category-a', category_name: 'Abarrotes', is_available: true, is_published: false }]
            : { authenticated: true, csrf_token: 'synthetic-csrf-token' }
      return Promise.resolve({ ok: true, json: async () => payload })
    }))
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Productos de Empresa A' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nueva categoría' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nuevo producto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Contactos y cotizaciones' })).toBeInTheDocument()
  })

  it('previews and confirms a CSV catalog import', async () => {
    window.history.replaceState({}, '', '/app/')
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      let payload: unknown
      if (url.includes('/tenant/context/')) payload = { id: 'tenant-a', name: 'Empresa A', role: 'OWNER' }
      else if (url.includes('/auth/session/')) payload = { authenticated: true, csrf_token: 'synthetic-csrf-token' }
      else if (url.includes('/import/preview/')) payload = {
        valid: true,
        token: 'preview-token',
        rows: [{ row: 2, sku: 'NEW-1', name: 'Producto importado', category: 'Abarrotes', price: '100.00', action: 'crear', errors: [], warnings: [] }],
        summary: { total: 1, create: 1, update: 0, errors: 0, warnings: 0 },
      }
      else if (url.includes('/import/confirm/')) payload = { created: 1, updated: 0, total: 1 }
      else if (url.includes('/categories/')) payload = [{ id: 'category-a', name: 'Abarrotes', description: '', is_active: true }]
      else payload = []
      return Promise.resolve({ ok: true, json: async () => payload, requestInit: init })
    }))
    render(<App />)

    const fileInput = await screen.findByLabelText('Archivo CSV')
    const csv = new File(['sku,nombre,categoria,descripcion,formato,precio,disponible,publicar\nNEW-1,Producto importado,Abarrotes,,Caja,100,sí,no\n'], 'catalogo.csv', { type: 'text/csv' })
    fireEvent.change(fileInput, { target: { files: [csv] } })
    fireEvent.submit(fileInput.closest('form') as HTMLFormElement)

    expect(await screen.findByText('Producto importado')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar importación' }))
    expect(await screen.findByRole('status')).toHaveTextContent('1 creados y 0 actualizados')
    expect(fetch).toHaveBeenCalledWith('/api/catalog/import/confirm/', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ token: 'preview-token' }),
    }))
  })

  it('loads a CSRF token and enables the tenant login form', async () => {
    window.history.replaceState({}, '', '/app/login/')
    mockJson({ authenticated: false, csrf_token: 'synthetic-csrf-token' })
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Ingresa a tu espacio comercial' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeEnabled()
    expect(fetch).toHaveBeenCalledWith('/api/auth/session/', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('submits credentials with CSRF and shows a generic login error', async () => {
    window.history.replaceState({}, '', '/app/login/')
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ authenticated: false, csrf_token: 'synthetic-csrf-token' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ detail: 'generic error' }) }))
    render(<App />)

    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'user@example.test' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'not-a-real-password' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible iniciar sesión')
    expect(fetch).toHaveBeenLastCalledWith('/api/auth/login/', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-CSRFToken': 'synthetic-csrf-token' }),
      body: JSON.stringify({ email: 'user@example.test', password: 'not-a-real-password' }),
    }))
  })
})
