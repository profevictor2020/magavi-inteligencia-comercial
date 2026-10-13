type Quote = {
  folio: string
  status: 'DRAFT' | 'ISSUED'
  valid_until: string
  tracking_status: 'UNSENT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'
  next_contact_on: string | null
}

type Inquiry = {
  id: string
  full_name: string
  email: string
  phone: string
  status: 'NEW' | 'CONTACTED' | 'CLOSED'
  created_at: string
  items: { product_sku: string; product_name: string; quantity: number }[]
  quote: Quote | null
}

type Order = {
  id: string
  folio: string
  full_name: string
  email: string
  phone: string
  status: 'NEW' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
  created_at: string
}

export type CommercialPriority = {
  key: string
  title: string
  detail: string
  section: 'inquiries' | 'orders' | 'quoteTracking'
  target: string
  urgency: number
  date: string
}

function contactKey(contact: { email: string; phone: string }) {
  if (contact.email.trim()) return `email:${contact.email.trim().toLocaleLowerCase('es-CL')}`
  const phone = contact.phone.replace(/\D/g, '')
  return phone.length >= 8 ? `phone:${phone}` : null
}

export function buildCommercialInsights(inquiries: Inquiry[], orders: Order[], today: string) {
  const priorities: CommercialPriority[] = []
  const soon = new Date(`${today}T12:00:00Z`)
  soon.setUTCDate(soon.getUTCDate() + 3)
  const soonDate = soon.toISOString().slice(0, 10)

  for (const order of orders) {
    if (order.status !== 'NEW' && order.status !== 'CONFIRMED') continue
    priorities.push({ key: `order-${order.id}`, title: order.status === 'NEW' ? 'Confirmar pedido' : 'Completar pedido',
      detail: `${order.full_name} · ${order.folio}`, section: 'orders', target: order.id,
      urgency: order.status === 'NEW' ? 0 : 6, date: order.created_at })
  }

  for (const inquiry of inquiries) {
    const quote = inquiry.quote
    if (inquiry.status === 'NEW' && !quote) {
      priorities.push({ key: `inquiry-${inquiry.id}`, title: 'Responder solicitud nueva', detail: inquiry.full_name,
        section: 'inquiries', target: inquiry.id, urgency: 1, date: inquiry.created_at })
    }
    if (!quote || quote.status !== 'ISSUED') continue
    let title: string | null = null
    let urgency = 5
    if (quote.tracking_status === 'EXPIRED') { title = 'Revisar cotización vencida'; urgency = 2 }
    else if (quote.tracking_status === 'UNSENT') { title = 'Enviar cotización emitida'; urgency = 3 }
    else if (quote.tracking_status === 'SENT' && quote.next_contact_on && quote.next_contact_on <= today) {
      title = 'Contactar cliente hoy'; urgency = 2
    } else if (quote.tracking_status === 'SENT' && quote.valid_until >= today && quote.valid_until <= soonDate) {
      title = 'Cotización próxima a vencer'; urgency = 4
    }
    if (title) priorities.push({ key: `quote-${inquiry.id}`, title, detail: `${inquiry.full_name} · ${quote.folio}`,
      section: 'quoteTracking', target: quote.folio, urgency, date: inquiry.created_at })
  }

  priorities.sort((a, b) => a.urgency - b.urgency || b.date.localeCompare(a.date))

  const demand = new Map<string, { sku: string; name: string; quantity: number }>()
  for (const inquiry of inquiries) for (const item of inquiry.items) {
    const existing = demand.get(item.product_sku)
    demand.set(item.product_sku, { sku: item.product_sku, name: item.product_name,
      quantity: (existing?.quantity ?? 0) + item.quantity })
  }

  const orderContacts = new Set(orders.filter((order) => order.status !== 'CANCELLED').map(contactKey).filter(Boolean))
  const inquiryContacts = new Map<string, { key: string; name: string; count: number }>()
  for (const inquiry of inquiries) {
    const key = contactKey(inquiry)
    if (!key || orderContacts.has(key)) continue
    const existing = inquiryContacts.get(key)
    inquiryContacts.set(key, { key, name: inquiry.full_name, count: (existing?.count ?? 0) + 1 })
  }

  const issued = inquiries.filter((inquiry) => inquiry.quote?.status === 'ISSUED')
  const accepted = issued.filter((inquiry) => inquiry.quote?.tracking_status === 'ACCEPTED').length
  return {
    priorities,
    issued: issued.length,
    accepted,
    acceptanceRate: issued.length ? Math.round(accepted * 100 / issued.length) : null,
    completedOrders: orders.filter((order) => order.status === 'COMPLETED').length,
    repeatedContacts: [...inquiryContacts.values()].filter((contact) => contact.count >= 2).sort((a, b) => b.count - a.count),
    topProducts: [...demand.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'es-CL')).slice(0, 5),
  }
}
