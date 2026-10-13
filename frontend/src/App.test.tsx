import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
        : url.includes('/industry-segments/')
          ? [{ value: 'FOOD_SERVICE', label: 'Restaurantes, restobares y cafeterías' }, { value: 'HOSPITALITY', label: 'Hoteles y alojamientos' }]
        : url.includes('/inquiries/') || url.includes('/prospects/')
          ? []
        : url.includes('/categories/')
          ? [{ id: 'category-a', name: 'Abarrotes', description: '', is_active: true }]
          : url.includes('/products/')
            ? [{ ...companyA.products[0], category: 'category-a', category_name: 'Abarrotes', is_available: true, is_published: false, target_industries: [], target_industry_labels: [], match_keywords: [], commercial_priority: 'MEDIUM' }]
            : { authenticated: true, csrf_token: 'synthetic-csrf-token' }
      return Promise.resolve({ ok: true, json: async () => payload })
    }))
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Hola, equipo de Empresa A' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Administración de la empresa' })).getByRole('button', { name: /Catálogo/ }))
    expect(await screen.findByRole('heading', { name: 'Productos de Empresa A' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Datos esenciales' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Importar productos desde CSV' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeInTheDocument()
    const catalogNavigation = screen.getByRole('navigation', { name: 'Secciones del catálogo' })
    fireEvent.click(within(catalogNavigation).getByRole('button', { name: /Categorías/ }))
    expect(screen.getByRole('heading', { name: 'Taxonomía del catálogo' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Crear agrupación' })).toBeInTheDocument()
    fireEvent.click(within(catalogNavigation).getByRole('button', { name: /Importación/ }))
    expect(screen.getByRole('heading', { name: 'Carga masiva de productos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Importar productos desde CSV' })).toBeInTheDocument()
    fireEvent.click(within(catalogNavigation).getByRole('button', { name: /Reglas comerciales/ }))
    expect(screen.getByRole('heading', { name: 'Segmentación para oportunidades' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Restaurantes, restobares y cafeterías' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Hoteles y alojamientos' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Restaurante, Hotel')).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Administración de la empresa' })).getByRole('button', { name: /Prospectos/ }))
    expect(screen.getByRole('heading', { name: 'Prospectos comerciales', level: 2 })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Administración de la empresa' })).getByRole('button', { name: /Territorios/ }))
    expect(screen.getByRole('heading', { name: 'Territorios comerciales', level: 2 })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Administración de la empresa' })).getByRole('button', { name: /Oportunidades/ }))
    expect(screen.getByRole('heading', { name: 'Bandeja de oportunidades', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calcular oportunidades' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Administración de la empresa' })).getByRole('button', { name: /Solicitudes/ }))
    expect(screen.getByRole('heading', { name: 'Contactos y cotizaciones', level: 2 })).toBeInTheDocument()
  })

  it('lets the owner update colors, contact email and logo', async () => {
    window.history.replaceState({}, '', '/app/')
    let tenant = { id: 'tenant-a', name: 'Empresa A', role: 'OWNER', logo_path: '/static/demo/empresa-a.svg', primary_color: '#145C5A', secondary_color: '#F4BC57', contact_email: 'old@example.test' }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      let payload: unknown = []
      if (url.includes('/tenant/context/')) {
        if (init?.method === 'PATCH') tenant = { ...tenant, ...JSON.parse(String(init.body)) as typeof tenant }
        payload = tenant
      } else if (url.includes('/tenant/logo/')) {
        tenant = { ...tenant, logo_path: '/api/public/logo/?v=123' }
        payload = tenant
      } else if (url.includes('/auth/session/')) payload = { authenticated: true, csrf_token: 'synthetic-csrf-token' }
      return Promise.resolve({ ok: true, json: async () => payload })
    }))
    render(<App />)
    const nav = within(await screen.findByRole('navigation', { name: 'Administración de la empresa' }))
    fireEvent.click(nav.getByRole('button', { name: 'Mi marca' }))
    expect(screen.getByRole('heading', { name: 'Tu marca en la landing' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Código del color principal'), { target: { value: '#25364A' } })
    fireEvent.change(screen.getByLabelText('Código del color secundario'), { target: { value: '#E88C62' } })
    fireEvent.change(screen.getByLabelText('Correo de contacto'), { target: { value: 'ventas@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar colores y contacto' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/tenant/context/', expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"primary_color":"#25364A"') })))
    expect(await screen.findByText(/Identidad visual guardada/)).toBeInTheDocument()
    const file = new File(['synthetic-logo'], 'logo.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Seleccionar imagen'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Subir logo' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/tenant/logo/', expect.objectContaining({ method: 'POST', body: expect.any(FormData) })))
    expect(await screen.findByAltText('Logo actual de Empresa A')).toHaveAttribute('src', '/api/public/logo/?v=123')
  })

  it('creates and issues a quote from an existing request', async () => {
    window.history.replaceState({}, '', '/app/')
    const quote = { id: 'quote-12345678', folio: 'COT-000001', status: 'DRAFT', valid_until: '2099-01-01', tax_rate: '19.00', notes: '', issued_at: null, subtotal: '3000', tax_amount: '570', total: '3570', follow_up_status: 'UNSENT', tracking_status: 'UNSENT', next_contact_on: null, follow_up_notes: '', sent_at: null, responded_at: null, items: [{ request_item: 1, product_name: 'Café', product_sku: 'CAFE-1', quantity: 3, unit_price: '1000', line_total: '3000' }] }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const payload = url.includes('/tenant/context/') ? { id: 'tenant-a', name: 'Empresa A', role: 'OWNER' }
        : url.includes('/auth/session/') ? { authenticated: true, csrf_token: 'synthetic-csrf-token' }
        : url.includes('/quote/issue/') ? { ...quote, status: 'ISSUED' }
        : url.includes('/quote/') ? quote
        : url.includes('/inquiries/') ? [{ id: 'request-1', full_name: 'Cliente A', company_name: 'Negocio A', email: 'a@example.test', phone: '', message: '', status: 'NEW', quote: null, created_at: '2026-01-01T00:00:00Z', items: [{ id: 1, product: 'product-a', product_name: 'Café', product_sku: 'CAFE-1', quantity: 3 }] }]
        : []
      return Promise.resolve({ ok: true, json: async () => payload, requestInit: init })
    }))
    render(<App />)
    fireEvent.click(within(await screen.findByRole('navigation', { name: 'Administración de la empresa' })).getByRole('button', { name: /Solicitudes/ }))
    expect(screen.queryByRole('button', { name: 'Crear borrador' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Cliente A.*Café × 3/ }))
    expect(screen.getByRole('button', { name: /Cliente A.*Café × 3/ })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.change(screen.getByLabelText(/Café × 3 · Precio unitario/), { target: { value: '1000' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Crear borrador' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/inquiries/request-1/quote/', expect.objectContaining({ method: 'POST', body: expect.stringContaining('"unit_price":"1000"') })))
    fireEvent.click(await screen.findByRole('button', { name: 'Emitir cotización' }))
    expect(await screen.findByRole('link', { name: 'Abrir documento para imprimir o guardar como PDF' })).toHaveAttribute('href', '/api/inquiries/request-1/quote/print/')
  })

  it('tracks an issued quote without sending it automatically', async () => {
    window.history.replaceState({}, '', '/app/')
    let quote = { id: 'quote-1', folio: 'COT-000001', status: 'ISSUED', valid_until: '2099-01-01', tax_rate: '19.00', notes: '', issued_at: '2026-10-13T12:00:00Z', subtotal: '3000', tax_amount: '570', total: '3570', follow_up_status: 'UNSENT', tracking_status: 'UNSENT', next_contact_on: null as string | null, follow_up_notes: '', sent_at: null as string | null, responded_at: null, items: [] }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      let payload: unknown
      if (url.includes('/tenant/context/')) payload = { id: 'tenant-a', name: 'Empresa A', role: 'OWNER' }
      else if (url.includes('/auth/session/')) payload = { authenticated: true, csrf_token: 'synthetic-csrf-token' }
      else if (url.includes('/quote/follow-up/')) {
        const update = JSON.parse(String(init?.body)) as { follow_up_status: string; next_contact_on: string | null; follow_up_notes: string }
        quote = { ...quote, ...update, tracking_status: update.follow_up_status, sent_at: '2026-10-13T12:00:00Z' }
        payload = quote
      } else if (url.endsWith('/inquiries/')) payload = [{ id: 'request-1', full_name: 'Cliente A', company_name: 'Negocio A', email: 'a@example.test', phone: '', message: '', status: 'NEW', quote, created_at: '2026-10-13T12:00:00Z', items: [] }]
      else payload = []
      return Promise.resolve({ ok: true, json: async () => payload })
    }))
    render(<App />)
    const nav = within(await screen.findByRole('navigation', { name: 'Administración de la empresa' }))
    fireEvent.click(nav.getByRole('button', { name: /Seguimiento/ }))
    expect(await screen.findByRole('heading', { name: 'Seguimiento de cotizaciones', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('COT-000001')).toBeInTheDocument()
    expect(screen.getByText('Por enviar', { selector: '.tracking-badge' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar seguimiento' }))
    fireEvent.change(screen.getByLabelText('Resultado del seguimiento'), { target: { value: 'SENT' } })
    fireEvent.change(screen.getByLabelText('Próximo contacto'), { target: { value: '2099-01-02' } })
    fireEvent.change(screen.getByLabelText('Notas de seguimiento'), { target: { value: 'Enviada por WhatsApp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar seguimiento' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/inquiries/request-1/quote/follow-up/', expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"follow_up_status":"SENT"') })))
    expect(await screen.findByText('Enviada', { selector: '.tracking-badge' })).toBeInTheDocument()
    expect(screen.getByText('Seguimiento guardado.')).toBeInTheDocument()
    expect(screen.getByLabelText('Notas de seguimiento')).toHaveValue('Enviada por WhatsApp')
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

    fireEvent.click(await within(await screen.findByRole('navigation', { name: 'Administración de la empresa' })).getByRole('button', { name: /Catálogo/ }))
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones del catálogo' })).getByRole('button', { name: /Importación/ }))
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
