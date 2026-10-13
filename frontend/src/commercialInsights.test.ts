import { describe, expect, it } from 'vitest'
import { buildCommercialInsights } from './commercialInsights'

const baseInquiry = {
  id: 'request-1', full_name: 'Ana Pérez', email: 'ANA@example.com', phone: '', status: 'NEW' as const,
  created_at: '2026-10-12T12:00:00Z', items: [{ product_sku: 'CAM-1', product_name: 'Camarón', quantity: 3 }], quote: null,
}

describe('commercial insights', () => {
  it('prioritizes open work and clears it when states advance', () => {
    const quote = { folio: 'COT-000001', status: 'ISSUED' as const, valid_until: '2026-10-14', tracking_status: 'SENT' as const, next_contact_on: '2026-10-13' }
    const inquiries = [baseInquiry, { ...baseInquiry, id: 'request-2', status: 'CONTACTED' as const, quote }]
    const orders = [{ id: 'order-1', folio: 'PED-000001', full_name: 'Luis', email: '', phone: '950000000', status: 'NEW' as const, created_at: '2026-10-13T12:00:00Z' }]
    const result = buildCommercialInsights(inquiries, orders, '2026-10-13')
    expect(result.priorities.map((item) => item.title)).toEqual(['Confirmar pedido', 'Responder solicitud nueva', 'Contactar cliente hoy'])
    expect(result.topProducts).toEqual([{ sku: 'CAM-1', name: 'Camarón', quantity: 6 }])
    expect(result.repeatedContacts).toEqual([{ key: 'email:ana@example.com', name: 'Ana Pérez', count: 2 }])

    const settled = buildCommercialInsights(inquiries.map((item) => ({ ...item, status: 'CLOSED' as const, quote: item.quote ? { ...quote, tracking_status: 'ACCEPTED' as const } : null })), [{ ...orders[0], status: 'COMPLETED' }], '2026-10-13')
    expect(settled.priorities).toEqual([])
    expect(settled.acceptanceRate).toBe(100)
    expect(settled.completedOrders).toBe(1)
  })

  it('shows expiring quotes but ignores rejected ones and contacts with a recorded order', () => {
    const quote = { folio: 'COT-000002', status: 'ISSUED' as const, valid_until: '2026-10-15', tracking_status: 'SENT' as const, next_contact_on: null }
    const inquiries = [{ ...baseInquiry, status: 'CONTACTED' as const, quote }, { ...baseInquiry, id: 'request-2', status: 'CLOSED' as const, quote: { ...quote, folio: 'COT-000003', tracking_status: 'REJECTED' as const } }]
    const orders = [{ id: 'order-2', folio: 'PED-000002', full_name: 'Ana Pérez', email: 'ana@example.com', phone: '', status: 'COMPLETED' as const, created_at: '2026-10-13T12:00:00Z' }]
    const result = buildCommercialInsights(inquiries, orders, '2026-10-13')
    expect(result.priorities.map((item) => item.title)).toEqual(['Cotización próxima a vencer'])
    expect(result.repeatedContacts).toEqual([])
    expect(result.acceptanceRate).toBe(0)
  })

  it('counts conversion and product sales only from linked completed orders', () => {
    const orders = [
      { id: 'order-1', folio: 'PED-000001', full_name: 'Ana', email: 'ana@example.com', phone: '', status: 'COMPLETED' as const, created_at: '2026-10-13T12:00:00Z', source_request: baseInquiry.id, items: [{ product_sku: 'CAM-1', product_name: 'Camarón', quantity: 2, line_total: '49980' }] },
      { id: 'order-2', folio: 'PED-000002', full_name: 'Ana', email: 'ana@example.com', phone: '', status: 'COMPLETED' as const, created_at: '2026-10-13T13:00:00Z', source_request: baseInquiry.id, items: [{ product_sku: 'CAM-1', product_name: 'Camarón', quantity: 1, line_total: '24990' }] },
      { id: 'order-3', folio: 'PED-000003', full_name: 'Luis', email: 'luis@example.com', phone: '', status: 'CANCELLED' as const, created_at: '2026-10-13T14:00:00Z', source_request: null, items: [{ product_sku: 'CAM-1', product_name: 'Camarón', quantity: 8, line_total: '199920' }] },
    ]
    const result = buildCommercialInsights([baseInquiry, { ...baseInquiry, id: 'request-2' }], orders, '2026-10-13')
    expect(result.completedOrders).toBe(2)
    expect(result.linkedCompletedRequests).toBe(1)
    expect(result.requestConversionRate).toBe(50)
    expect(result.salesByProduct).toEqual([{ sku: 'CAM-1', name: 'Camarón', quantity: 3, total: 74970 }])
  })
})
