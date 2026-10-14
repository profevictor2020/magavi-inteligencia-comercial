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
  products: [{
    id: 'product-a',
    name: 'Café premium',
    description: 'Café para negocios',
    sku: 'CAFE-001',
    format: 'Caja 12 unidades',
    price: '24990.00',
    category: 'Abarrotes',
    image_path: '/api/public/products/product-a/image/?v=1',
  }],
  is_demo: false,
}

const companyB = {
  ...companyA,
  name: 'Empresa B',
  headline: 'Propuesta de Empresa B',
  logo_path: '/static/demo/empresa-b.svg',
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
    expect(screen.getByRole('heading', { name: 'Productos', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Café premium' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Café premium' })).toHaveLength(2)
    expect(screen.getAllByRole('img', { name: 'Café premium' })[0]).toHaveAttribute('src', companyA.products[0].image_path)
    expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Solicitar cotización/ })).toBeDisabled()
    expect(screen.queryByText('Servicio A')).not.toBeInTheDocument()
    expect(screen.queryByText('Empresa B')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/public/landing/', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('renders company B public landing', async () => {
    mockJson(companyB)
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Propuesta de Empresa B' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Productos', level: 2 })).toBeInTheDocument()
    expect(screen.queryByText('Servicio B')).not.toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a mi selección' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Café premium' }))
    expect(screen.getByRole('button', { name: /Solicitar cotización/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a mi selección' }))
    fireEvent.change(screen.getByLabelText('Cantidad de Café premium'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /Solicitar cotización/ }))
    expect(screen.getByText('Productos elegidos')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Cliente de prueba' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresa un correo electrónico o teléfono')
    expect(fetch).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'cliente@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))

    expect(await screen.findByText(/Solicitud enviada/)).toBeInTheDocument()
    expect(fetch).toHaveBeenLastCalledWith('/api/inquiries/public/', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('product-a'),
    }))
    expect(fetch).toHaveBeenLastCalledWith('/api/inquiries/public/', expect.objectContaining({ body: expect.stringContaining('"quantity":3') }))
    expect(screen.queryByLabelText('Nombre completo')).not.toBeInTheDocument()
  })

  it('places a purchase order from the same selection and shows its folio', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => companyA })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'order-1', folio: 'PED-000001' }) }))
    render(<App />)
    await screen.findByRole('heading', { name: 'Propuesta de Empresa A' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a mi selección' }))
    fireEvent.change(screen.getByLabelText('Cantidad de Café premium'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /Comprar ahora/ }))
    expect(screen.getByText('$49.980')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Cliente de prueba' } })
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'cliente@example.test' } })
    fireEvent.change(screen.getByLabelText('Entrega'), { target: { value: 'SHIPPING' } })
    fireEvent.change(screen.getByLabelText('Dirección de despacho'), { target: { value: 'Calle Falsa 123, Santiago' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pedido' }))
    expect(await screen.findByText(/Pedido PED-000001 registrado/)).toBeInTheDocument()
    expect(fetch).toHaveBeenLastCalledWith('/api/inquiries/orders/public/', expect.objectContaining({
      method: 'POST', body: expect.stringContaining('"delivery_method":"SHIPPING"'),
    }))
  })

  it('keeps quote available when a selected product has no price', async () => {
    mockJson({ ...companyA, products: [{ ...companyA.products[0], price: null }] })
    render(<App />)
    await screen.findByRole('heading', { name: 'Propuesta de Empresa A' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a mi selección' }))
    expect(screen.getByRole('button', { name: /Comprar ahora/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Solicitar cotización/ })).toBeEnabled()
  })

  it('shows a tenant order in /app and lets the owner confirm it', async () => {
    window.history.replaceState({}, '', '/app/')
    const order = { id: 'order-1', folio: 'PED-000001', full_name: 'Cliente de prueba', company_name: '', email: 'cliente@example.test', phone: '', delivery_method: 'PICKUP', delivery_address: '', notes: '', status: 'NEW', items: [{ product_name: 'Café premium', product_sku: 'CAFE-001', quantity: 2, unit_price: 24990, line_total: 49980 }], total: 49980, created_at: '2026-10-13T12:00:00Z' }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const payload = url.includes('/tenant/context/') ? { id: 'tenant-a', name: 'Empresa A', role: 'OWNER' }
        : url.includes('/auth/session/') ? { authenticated: true, csrf_token: 'synthetic-csrf-token' }
          : url.endsWith('/inquiries/orders/') ? [order]
            : url.includes('/inquiries/orders/order-1/') ? { ...order, status: 'CONFIRMED' }
              : []
      return Promise.resolve({ ok: true, json: async () => payload })
    }))
    render(<App />)
    const nav = within(await screen.findByRole('navigation', { name: 'Administración de la empresa' }))
    fireEvent.click(nav.getByRole('button', { name: /Pedidos/ }))
    expect(screen.getByText('PED-000001')).toBeInTheDocument()
    expect(screen.getAllByText('$49.980')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Marcar confirmado' }))
    expect(await screen.findByRole('button', { name: 'Marcar completado' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/inquiries/orders/order-1/', expect.objectContaining({ method: 'PATCH', body: '{"status":"CONFIRMED"}' }))
  })

  it('opens the matching order from the commercial priorities dashboard', async () => {
    window.history.replaceState({}, '', '/app/')
    const order = { id: 'order-1', folio: 'PED-000001', full_name: 'Cliente de prueba', company_name: '', email: 'cliente@example.test', phone: '', delivery_method: 'PICKUP', delivery_address: '', notes: '', status: 'NEW', items: [], total: 0, created_at: '2026-10-13T12:00:00Z' }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const payload = url.includes('/tenant/context/') ? { id: 'tenant-a', name: 'Empresa A', role: 'OWNER' }
        : url.includes('/auth/session/') ? { authenticated: true, csrf_token: 'synthetic-csrf-token' }
          : url.endsWith('/inquiries/orders/') ? [order] : []
      return Promise.resolve({ ok: true, json: async () => payload })
    }))
    render(<App />)
    const dashboard = await screen.findByRole('region', { name: 'Tablero de prioridades comerciales' })
    expect(within(dashboard).getByText('1 pendiente')).toBeInTheDocument()
    fireEvent.click(within(dashboard).getByRole('button', { name: /Confirmar pedido/ }))
    expect(await screen.findByRole('heading', { name: 'Pedidos recibidos' })).toBeInTheDocument()
    expect(document.getElementById('order-order-1')).toHaveTextContent('PED-000001')
  })

  it('links an order to a matching request and updates measured conversion', async () => {
    window.history.replaceState({}, '', '/app/')
    const inquiry = { id: 'request-1', full_name: 'Cliente de prueba', company_name: '', email: 'cliente@example.test', phone: '', message: '', status: 'CLOSED', items: [], quote: null, created_at: '2026-10-12T12:00:00Z' }
    const order = { id: 'order-1', folio: 'PED-000001', full_name: 'Cliente de prueba', company_name: '', email: 'CLIENTE@example.test', phone: '', delivery_method: 'PICKUP', delivery_address: '', notes: '', status: 'COMPLETED', source_request: null, items: [{ product_name: 'Café premium', product_sku: 'CAFE-001', quantity: 2, unit_price: 24990, line_total: 49980 }], total: 49980, created_at: '2026-10-13T12:00:00Z' }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const payload = url.includes('/tenant/context/') ? { id: 'tenant-a', name: 'Empresa A', role: 'OWNER' }
        : url.includes('/auth/session/') ? { authenticated: true, csrf_token: 'synthetic-csrf-token' }
          : url.endsWith('/inquiries/orders/') ? [order]
            : url.endsWith('/inquiries/') ? [inquiry]
              : url.includes('/inquiries/orders/order-1/') ? { ...order, source_request: 'request-1' } : []
      return Promise.resolve({ ok: true, json: async () => payload })
    }))
    render(<App />)
    const dashboard = await screen.findByRole('region', { name: 'Tablero de prioridades comerciales' })
    expect(within(dashboard).getByText('0 de 1 solicitudes, solo pedidos vinculados y completados')).toBeInTheDocument()
    const nav = within(screen.getByRole('navigation', { name: 'Administración de la empresa' }))
    fireEvent.click(nav.getByRole('button', { name: /Pedidos/ }))
    fireEvent.change(screen.getByLabelText('Solicitud de origen'), { target: { value: 'request-1' } })
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/inquiries/orders/order-1/', expect.objectContaining({ method: 'PATCH', body: '{"source_request":"request-1"}' })))
    await waitFor(() => expect(screen.getByLabelText('Solicitud de origen')).toHaveValue('request-1'))
    fireEvent.click(nav.getByRole('button', { name: 'Resumen' }))
    expect(await screen.findByText('1 de 1 solicitudes, solo pedidos vinculados y completados')).toBeInTheDocument()
    expect(screen.getByText('$49.980')).toBeInTheDocument()
  })

  it('lets an owner enable scheduled Instagram discovery without adding profile links', async () => {
    window.history.replaceState({}, '', '/app/')
    const initial = { configured: true, enabled: false, status: 'NOT_STARTED', finished_at: null, hashtags: [], profiles_found: 0, prospects_created: 0, error: '' }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const payload = url.includes('/tenant/context/') ? { id: 'tenant-a', name: 'Empresa A', role: 'OWNER' }
        : url.includes('/auth/session/') ? { authenticated: true, csrf_token: 'synthetic-csrf-token' }
          : url.endsWith('/prospects/discovery/') ? { ...initial, enabled: init?.method === 'PATCH' }
            : []
      return Promise.resolve({ ok: true, json: async () => payload })
    }))
    render(<App />)
    const nav = within(await screen.findByRole('navigation', { name: 'Administración de la empresa' }))
    fireEvent.click(nav.getByRole('button', { name: /Prospectos/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Activar búsqueda automática' }))
    expect(await screen.findByRole('button', { name: 'Pausar búsqueda automática' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/prospects/discovery/', expect.objectContaining({ method: 'PATCH', body: '{"enabled":true}' }))
  })

  it('starts one manual Instagram test when the daily cooldown is active', async () => {
    window.history.replaceState({}, '', '/app/')
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const payload = url.includes('/tenant/context/') ? { id: 'tenant-a', name: 'Empresa A', role: 'OWNER' }
        : url.includes('/auth/session/') ? { authenticated: true, csrf_token: 'synthetic-csrf-token' }
          : url.endsWith('/prospects/discovery/') ? { configured: true, enabled: true, status: 'COMPLETED', finished_at: '2026-10-14T14:51:15Z', hashtags: ['cafeterías Chile'], profiles_found: 7, prospects_created: 3, error: '', mindcase_job_id: 'old-job' }
            : url.endsWith('/prospects/discovery/test/') ? { status: 'PENDING', created: 0 } : []
      return Promise.resolve({ ok: true, json: async () => payload })
    }))
    render(<App />)
    const nav = within(await screen.findByRole('navigation', { name: 'Administración de la empresa' }))
    fireEvent.click(nav.getByRole('button', { name: /Prospectos/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Buscar ahora' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/prospects/discovery/test/', expect.objectContaining({ method: 'POST' })))
  })

  it('shows why an Instagram profile was not selected', async () => {
    window.history.replaceState({}, '', '/app/')
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const payload = url.includes('/tenant/context/') ? { id: 'tenant-a', name: 'Empresa A', role: 'OWNER' }
        : url.includes('/auth/session/') ? { authenticated: true, csrf_token: 'synthetic-csrf-token' }
          : url.includes('/discovery/evaluations/') ? { total: 1, results: [{ id: 'evaluation-1', batch_id: 'batch-1', username: 'cuenta_personal', name: 'Cuenta personal', search_term: 'cafeterías Chile', decision: 'REJECTED', score: 15, reason: 'La IA no encontró señales de negocio comprador.', evaluated_at: '2026-10-14T14:51:15Z' }] }
            : url.endsWith('/prospects/discovery/') ? { configured: true, enabled: false, status: 'COMPLETED', finished_at: '2026-10-14T14:51:15Z', hashtags: [], profiles_found: 1, prospects_created: 0, error: '', mindcase_job_id: 'job-1' }
              : []
      return Promise.resolve({ ok: true, json: async () => payload })
    }))
    render(<App />)
    const nav = within(await screen.findByRole('navigation', { name: 'Administración de la empresa' }))
    fireEvent.click(nav.getByRole('button', { name: /Prospectos/ }))
    fireEvent.click(await screen.findByText('Perfiles evaluados'))
    expect(await screen.findByText('La IA no encontró señales de negocio comprador.')).toBeInTheDocument()
    expect(screen.getByText('No seleccionado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver Instagram ↗' })).toHaveAttribute('href', 'https://www.instagram.com/cuenta_personal/')
  })

  it('suggests Chilean localities when a territory region is selected', async () => {
    window.history.replaceState({}, '', '/app/')
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      const payload = url.includes('/tenant/context/') ? { id: 'tenant-a', name: 'Empresa A', role: 'OWNER' }
        : url.includes('/auth/session/') ? { authenticated: true, csrf_token: 'synthetic-csrf-token' }
          : url.endsWith('/prospects/territories/regions/') ? [{ name: 'Metropolitana de Santiago', localities: ['Santiago', 'Providencia', 'Ñuñoa'] }]
            : []
      return Promise.resolve({ ok: true, json: async () => payload })
    }))
    render(<App />)
    const nav = within(await screen.findByRole('navigation', { name: 'Administración de la empresa' }))
    fireEvent.click(nav.getByRole('button', { name: /Territorios/ }))
    fireEvent.change(screen.getByLabelText('Región de interés'), { target: { value: 'Metropolitana de Santiago' } })
    expect(screen.getByLabelText('Nombre del territorio')).toHaveValue('Metropolitana de Santiago')
    expect(screen.getByLabelText('Ciudades y comunas de interés')).toHaveValue('Santiago, Providencia, Ñuñoa')
    fireEvent.change(screen.getByLabelText('Ciudades y comunas de interés'), { target: { value: 'Santiago, Maipú' } })
    expect(screen.getByLabelText('Ciudades y comunas de interés')).toHaveValue('Santiago, Maipú')
  })

  it('filters a larger catalog while keeping the selected products', async () => {
    const products = [companyA.products[0], ...Array.from({ length: 13 }, (_, index) => ({ ...companyA.products[0], id: `product-${index + 2}`, name: `Producto ${index + 2}`, description: 'Repostería artesanal', sku: `P-${index + 2}`, category: 'Repostería' }))]
    mockJson({ ...companyA, products })
    render(<App />)

    await screen.findByRole('heading', { name: 'Propuesta de Empresa A' })
    expect(screen.getAllByRole('button', { name: 'Agregar a mi selección' })).toHaveLength(12)
    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar a mi selección' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar más productos' }))
    expect(screen.getAllByRole('button', { name: 'Agregar a mi selección' })).toHaveLength(13)
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Repostería' } })
    expect(screen.queryByRole('heading', { name: 'Café premium' })).not.toBeInTheDocument()
    expect(screen.getByText('1 producto elegido')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Buscar productos'), { target: { value: 'cafe' } })
    expect(screen.getByText('No encontramos productos con esos filtros.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    expect(screen.getByRole('heading', { name: 'Café premium' })).toBeInTheDocument()
    expect(screen.getByText('1 producto elegido')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Buscar productos'), { target: { value: 'cafe' } })
    expect(screen.getByRole('heading', { name: 'Café premium' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Buscar productos'), { target: { value: '' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar a mi selección' })[0])
    fireEvent.change(screen.getByLabelText('Cantidad de Producto 2'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Solicitar cotización/ }))
    fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Cliente de prueba' } })
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'cliente@example.test' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith('/api/inquiries/public/', expect.objectContaining({ method: 'POST' })))
    const sent = JSON.parse(String(vi.mocked(fetch).mock.lastCall?.[1]?.body)) as { items: { product: string; quantity: number }[] }
    expect(sent.items).toEqual([{ product: 'product-a', quantity: 1 }, { product: 'product-2', quantity: 5 }])
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
            ? [{ ...companyA.products[0], category: 'category-a', category_name: 'Abarrotes', category_is_active: true, is_available: true, is_published: false, target_industries: [], target_industry_labels: [], match_keywords: [], commercial_priority: 'MEDIUM' }]
            : { authenticated: true, csrf_token: 'synthetic-csrf-token' }
      return Promise.resolve({ ok: true, json: async () => payload })
    }))
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Hola, equipo de Empresa A' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Administración de la empresa' })).getByRole('button', { name: /Catálogo/ }))
    expect(await screen.findByRole('heading', { name: 'Productos de Empresa A' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Datos esenciales' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Importar productos desde CSV' })).not.toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    const catalogNavigation = screen.getByRole('navigation', { name: 'Secciones del catálogo' })
    fireEvent.click(within(catalogNavigation).getByRole('button', { name: /Categorías/ }))
    expect(screen.getByRole('heading', { name: 'Taxonomía del catálogo' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Crear agrupación' })).toBeInTheDocument()
    fireEvent.click(within(catalogNavigation).getByRole('button', { name: /Importación/ }))
    expect(screen.getByRole('heading', { name: 'Carga masiva de productos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Descargar plantilla Excel/ })).toHaveAttribute('href', '/api/catalog/import/template/')
    expect(screen.getByLabelText('Archivo Excel (.xlsx) o CSV')).toHaveAttribute('accept', expect.stringContaining('.xlsx'))
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

  it('lets the owner update company name, colors, contact email and logo', async () => {
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
    fireEvent.change(screen.getByLabelText('Nombre de la empresa'), { target: { value: 'Empresa Renovada' } })
    fireEvent.change(screen.getByLabelText('Código del color principal'), { target: { value: '#25364A' } })
    fireEvent.change(screen.getByLabelText('Código del color secundario'), { target: { value: '#E88C62' } })
    fireEvent.change(screen.getByLabelText('Correo de contacto'), { target: { value: 'ventas@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar identidad' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/tenant/context/', expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"name":"Empresa Renovada"') })))
    expect(await screen.findByText(/Identidad de la empresa guardada/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Empresa Renovada, inicio' })).toBeInTheDocument()
    const file = new File(['synthetic-logo'], 'logo.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Seleccionar imagen'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Subir logo' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/tenant/logo/', expect.objectContaining({ method: 'POST', body: expect.any(FormData) })))
    expect(await screen.findByAltText('Logo actual de Empresa Renovada')).toHaveAttribute('src', '/api/public/logo/?v=123')
  })

  it('lets marketing add an image and publish a catalog product', async () => {
    window.history.replaceState({}, '', '/app/')
    let product = { ...companyA.products[0], image_path: null as string | null, category: 'category-a', category_name: 'Abarrotes', category_is_active: true, is_available: true, is_published: false, target_industries: [], target_industry_labels: [], match_keywords: [], commercial_priority: 'MEDIUM' }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      let payload: unknown = []
      if (url.includes('/tenant/context/')) payload = { id: 'tenant-a', name: 'Empresa A', role: 'OWNER' }
      else if (url.includes('/auth/session/')) payload = { authenticated: true, csrf_token: 'synthetic-csrf-token' }
      else if (url.includes('/products/') && url.includes('/image/')) {
        product = { ...product, image_path: '/api/catalog/products/product-a/image/?v=123' }
        payload = product
      } else if (url.includes('/products/') && init?.method === 'PATCH') {
        product = { ...product, is_published: true }
        payload = product
      } else if (url.includes('/products/')) payload = [product]
      return Promise.resolve({ ok: true, json: async () => payload })
    }))
    render(<App />)
    const nav = within(await screen.findByRole('navigation', { name: 'Administración de la empresa' }))
    fireEvent.click(nav.getByRole('button', { name: 'Marketing' }))
    expect(screen.getByRole('heading', { name: 'Productos en tu landing' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Imagen del producto/), { target: { files: [new File(['imagen'], 'cafe.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Subir imagen' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/catalog/products/product-a/image/', expect.objectContaining({ method: 'POST', body: expect.any(FormData) })))
    expect(await screen.findByAltText('Imagen de Café premium')).toHaveAttribute('src', '/api/catalog/products/product-a/image/?v=123')
    fireEvent.click(screen.getByRole('button', { name: 'Publicar en la landing' }))
    expect(await screen.findByText('Publicado en la landing')).toBeInTheDocument()
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
    const fileInput = await screen.findByLabelText('Archivo Excel (.xlsx) o CSV')
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
