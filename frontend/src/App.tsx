import { type CSSProperties, type FormEvent, useEffect, useState } from 'react'

type Offering = { name: string; description: string }
type LandingData = {
  name: string
  description: string
  headline: string
  logo_path: string
  theme: { primary: string; secondary: string }
  contact: { email: string; phone: string }
  featured_offerings: Offering[]
  products: PublicProduct[]
  is_demo: boolean
}

type PublicProduct = {
  id: string
  name: string
  description: string
  sku: string
  format: string
  price: string | null
  category: string
}

type Category = { id: string; name: string; description: string; is_active: boolean }
type Product = PublicProduct & {
  category: string
  category_name: string
  is_available: boolean
  is_published: boolean
  target_industries: string[]
  target_industry_labels: string[]
  match_keywords: string[]
  commercial_priority: 'LOW' | 'MEDIUM' | 'HIGH'
}

type ImportRow = {
  row: number
  sku: string
  name: string
  category: string
  price: string | null
  action: 'crear' | 'actualizar'
  errors: string[]
  warnings: string[]
}

type ImportPreview = {
  valid: boolean
  token: string | null
  rows: ImportRow[]
  summary: { total: number; create: number; update: number; errors: number; warnings: number }
}

type QuoteInquiry = {
  id: string
  full_name: string
  company_name: string
  email: string
  phone: string
  message: string
  status: 'NEW' | 'CONTACTED' | 'CLOSED'
  items: { id: number; product: string; product_name: string; product_sku: string; quantity: number }[]
  quote: FormalQuote | null
  created_at: string
}

type FormalQuote = {
  id: string
  folio: string
  status: 'DRAFT' | 'ISSUED'
  valid_until: string
  tax_rate: string
  notes: string
  issued_at: string | null
  subtotal: string
  tax_amount: string
  total: string
  follow_up_status: 'UNSENT' | 'SENT' | 'ACCEPTED' | 'REJECTED'
  tracking_status: 'UNSENT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'
  next_contact_on: string | null
  follow_up_notes: string
  sent_at: string | null
  responded_at: string | null
  items: { request_item: number; product_name: string; product_sku: string; quantity: number; unit_price: string; line_total: string }[]
}

const trackingLabels: Record<FormalQuote['tracking_status'], string> = {
  UNSENT: 'Por enviar', SENT: 'Enviada', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', EXPIRED: 'Vencida',
}

const formatQuoteDate = (date: string) => date.split('-').reverse().join('/')
const formatClp = (value: string) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value))
const todayInChile = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

function needsQuoteAttention(quote: FormalQuote, today: string) {
  return quote.tracking_status === 'UNSENT' || quote.tracking_status === 'EXPIRED'
    || (quote.tracking_status === 'SENT' && !!quote.next_contact_on && quote.next_contact_on <= today)
}

type Territory = { id: string; name: string; description: string; region: string; localities: string[]; prospect_goal: number; is_active: boolean; prospect_count: number; reviewed_count: number; coverage_percentage: number }

type Prospect = {
  id: string
  territory: string | null
  territory_name: string
  name: string
  industry: string
  industry_label: string
  address: string
  city: string
  region: string
  website: string
  email: string
  phone: string
  source: string
  notes: string
  verified_at: string | null
  status: 'NEW' | 'REVIEWED' | 'DISCARDED'
  duplicate_warnings: { id: string; name: string; matches: string[] }[]
}

type Opportunity = {
  id: string
  prospect: string
  prospect_name: string
  prospect_industry: string
  territory_name: string
  product: string
  product_name: string
  product_sku: string
  score: number
  score_version: string
  explanation: string
  score_breakdown: Record<string, number>
  status: 'PENDING' | 'ACCEPTED' | 'POSTPONED' | 'DISCARDED'
  review_reason: string
  evaluated_at: string
}

type TenantContext = {
  id: string
  name: string
  role: 'OWNER' | 'ADMIN' | 'STAFF' | 'VIEWER'
}

type AuthSession = {
  authenticated: boolean
  csrf_token?: string
  tenant?: TenantContext
}

type LoadState<T> = { phase: 'loading' } | { phase: 'ready'; data: T } | { phase: 'error' }

const jsonHeaders = { Accept: 'application/json' }

type IndustrySegmentOption = { value: string; label: string }

function Brand({ name, logo }: { name: string; logo: string }) {
  return (
    <a className="brand" href="/" aria-label={`${name}, inicio`}>
      <img src={logo} alt="" width="44" height="44" />
      <span>{name}</span>
    </a>
  )
}

function PublicQuoteForm({ products }: { products: PublicProduct[] }) {
  const [phase, setPhase] = useState<'ready' | 'submitting' | 'success' | 'error'>('ready')
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    if (selectedProducts.length === 0) {
      setPhase('error')
      return
    }
    setPhase('submitting')
    const body = {
      full_name: data.get('full_name'),
      company_name: data.get('company_name'),
      email: data.get('email'),
      phone: data.get('phone'),
      message: data.get('message'),
      website: data.get('website'),
      consent: data.get('consent') === 'on',
      items: selectedProducts.map((product) => ({
        product,
        quantity: Number(data.get(`quantity-${product}`) || 1),
      })),
    }
    try {
      const response = await fetch('/api/inquiries/public/', {
        method: 'POST',
        headers: { ...jsonHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error('Request rejected')
      form.reset()
      setSelectedProducts([])
      setPhase('success')
    } catch {
      setPhase('error')
    }
  }

  return (
    <form className="quote-form" onSubmit={submitRequest} aria-label="Solicitud de cotización">
      <div className="quote-products">
        <strong>Selecciona los productos</strong>
        {products.map((product) => {
          const selected = selectedProducts.includes(product.id)
          return <div className={`quote-product ${selected ? 'is-selected' : ''}`} key={product.id}><label><input type="checkbox" value={product.id} checked={selected} onChange={(event) => setSelectedProducts((current) => event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id))} /><span><strong>{product.name}</strong><small>{product.format || product.category}</small></span></label>{selected && <label className="quantity-label">Cantidad<input name={`quantity-${product.id}`} type="number" min="1" max="100000" defaultValue="1" required /></label>}</div>
        })}
      </div>
      <div className="quote-fields">
        <label>Nombre completo<input name="full_name" maxLength={160} required /></label>
        <label>Empresa<input name="company_name" maxLength={160} /></label>
        <div className="form-row"><label>Correo electrónico<input name="email" type="email" /></label><label>Teléfono<input name="phone" maxLength={40} /></label></div>
        <label>Mensaje<textarea name="message" maxLength={1500} /></label>
        <label className="honeypot" aria-hidden="true">Sitio web<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <label className="consent-field"><input name="consent" type="checkbox" required /> Autorizo que esta empresa me contacte para responder mi solicitud.</label>
        {phase === 'success' && <p className="quote-success" role="status">Solicitud enviada. El equipo comercial se pondrá en contacto contigo.</p>}
        {phase === 'error' && <p className="quote-error" role="alert">No fue posible enviar la solicitud. Selecciona un producto, completa tus datos e inténtalo nuevamente.</p>}
        <button type="submit" disabled={phase === 'submitting' || products.length === 0}>{phase === 'submitting' ? 'Enviando…' : 'Enviar solicitud'}</button>
      </div>
    </form>
  )
}

function PublicLanding() {
  const [state, setState] = useState<LoadState<LandingData>>({ phase: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/public/landing/', { headers: jsonHeaders, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Landing unavailable')
        setState({ phase: 'ready', data: (await response.json()) as LandingData })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ phase: 'error' })
      })
    return () => controller.abort()
  }, [])

  if (state.phase === 'loading') {
    return <main className="centered-state" role="status">Preparando la experiencia…</main>
  }
  if (state.phase === 'error') {
    return <main className="centered-state error-state">No pudimos cargar esta empresa. Inténtalo nuevamente.</main>
  }

  const tenant = state.data
  const theme = {
    '--tenant-primary': tenant.theme.primary,
    '--tenant-secondary': tenant.theme.secondary,
  } as CSSProperties

  return (
    <main className="tenant-site" style={theme}>
      <header className="site-header">
        <nav className="public-nav page-width" aria-label="Navegación pública">
          <Brand name={tenant.name} logo={tenant.logo_path} />
          <div className="nav-links">
            <a href="#empresa">Empresa</a>
            <a href="#productos">Productos y servicios</a>
            <a href="#contacto">Contacto</a>
          </div>
          <a className="app-link" href="/app/login/">Acceso equipo <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section className="tenant-hero page-width" id="empresa">
        <div className="hero-copy">
          <span className="eyebrow">{tenant.is_demo ? 'SITIO DEMOSTRATIVO' : 'BIENVENIDOS'}</span>
          <h1>{tenant.headline}</h1>
          <p>{tenant.description}</p>
          <a className="hero-action" href="#productos">Conoce nuestra propuesta <span aria-hidden="true">→</span></a>
          {(tenant.contact.email || tenant.contact.phone) && (
            <div className="contact-row" aria-label="Datos de contacto">
              {tenant.contact.email && <a href={`mailto:${tenant.contact.email}`}>{tenant.contact.email}</a>}
              {tenant.contact.phone && <span>{tenant.contact.phone}</span>}
            </div>
          )}
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="visual-main"><img src={tenant.logo_path} alt="" /></div>
          <div className="visual-detail visual-detail-top"><span>Calidad</span></div>
          <div className="visual-detail visual-detail-bottom"><span>Confianza</span></div>
        </div>
      </section>

      <section className="value-strip" aria-label="Compromisos de la empresa">
        <div className="page-width value-grid">
          <div><strong>01</strong><span>Atención cercana</span></div>
          <div><strong>02</strong><span>Soluciones confiables</span></div>
          <div><strong>03</strong><span>Experiencia especializada</span></div>
        </div>
      </section>

      <section className="offerings page-width" id="productos" aria-labelledby="offerings-title">
        <div className="section-heading">
          <div><span>NUESTRA OFERTA</span><h2 id="offerings-title">Productos y servicios</h2></div>
          <p>Una selección pensada para entregar calidad, continuidad y una atención que acompaña cada necesidad.</p>
        </div>
        <div className="offering-grid">
          {tenant.featured_offerings.map((offering, index) => (
            <article key={`${offering.name}-${index}`}>
              <div className={`offering-art offering-art-${(index % 3) + 1}`} aria-hidden="true"><span>0{index + 1}</span></div>
              <span className="card-kicker">DESTACADO</span>
              <h3>{offering.name}</h3>
              <p>{offering.description}</p>
              <span className="card-link">Ver más <span aria-hidden="true">→</span></span>
            </article>
          ))}
        </div>
        {tenant.products.length > 0 && (
          <div className="product-grid" aria-label="Catálogo publicado">
            {tenant.products.map((product) => (
              <article className="product-card" key={product.id}>
                <span className="card-kicker">{product.category}</span>
                <h3>{product.name}</h3>
                <p>{product.description || product.format}</p>
                <div className="product-meta">
                  {product.format && <span>{product.format}</span>}
                  {product.price && <strong>${Number(product.price).toLocaleString('es-CL')}</strong>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="contact-banner" id="contacto">
        <div className="page-width contact-banner-inner">
          <div><span className="eyebrow">HABLEMOS</span><h2>Construyamos una gran relación comercial.</h2></div>
          <div className="contact-actions">
            {tenant.contact.email && <a href={`mailto:${tenant.contact.email}`}>{tenant.contact.email} <span aria-hidden="true">↗</span></a>}
            {tenant.contact.phone && <span>{tenant.contact.phone}</span>}
          </div>
        </div>
        {tenant.products.length > 0 && <div className="page-width"><PublicQuoteForm products={tenant.products} /></div>}
      </section>

      <footer className="public-footer page-width">
        <Brand name={tenant.name} logo={tenant.logo_path} />
        <span>{tenant.is_demo ? 'Contenido sintético de demostración' : 'Sitio impulsado por MAGAVI'}</span>
      </footer>
    </main>
  )
}

function CatalogImportPanel({ csrfToken, onConfirmed }: { csrfToken: string; onConfirmed: () => Promise<void> }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [phase, setPhase] = useState<'ready' | 'previewing' | 'confirming'>('ready')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function previewFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setPhase('previewing')
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/catalog/import/preview/', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'X-CSRFToken': csrfToken },
        body: data,
      })
      const payload = await response.json() as ImportPreview | { detail: string }
      if (!response.ok) {
        setError('detail' in payload ? payload.detail : 'No fue posible revisar el archivo.')
        setPreview(null)
      } else {
        setPreview(payload as ImportPreview)
      }
    } catch {
      setError('No fue posible revisar el archivo. Inténtalo nuevamente.')
      setPreview(null)
    } finally {
      setPhase('ready')
    }
  }

  async function confirmImport() {
    if (!preview?.token) return
    setPhase('confirming')
    setError('')
    try {
      const response = await fetch('/api/catalog/import/confirm/', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { ...jsonHeaders, 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify({ token: preview.token }),
      })
      const payload = await response.json() as { created?: number; updated?: number; detail?: string }
      if (!response.ok) {
        setError(payload.detail ?? 'No fue posible confirmar la importación.')
      } else {
        await onConfirmed()
        setMessage(`Importación completada: ${payload.created} creados y ${payload.updated} actualizados.`)
        setPreview(null)
      }
    } catch {
      setError('No fue posible confirmar la importación. Inténtalo nuevamente.')
    } finally {
      setPhase('ready')
    }
  }

  return (
    <section className="catalog-import" aria-labelledby="import-title">
      <div className="catalog-import-heading">
        <div><span className="eyebrow">CARGA MASIVA</span><h2 id="import-title">Importar productos desde CSV</h2></div>
        <a className="template-link" href="/api/catalog/import/template/">Descargar plantilla</a>
      </div>
      <p>Completa la plantilla y revisa los cambios antes de aplicarlos. Una nueva carga actualiza productos con el mismo SKU sin duplicarlos.</p>
      <form className="import-form" onSubmit={previewFile}>
        <label>Archivo CSV<input name="file" type="file" accept=".csv,text/csv" required /></label>
        <button type="submit" disabled={!csrfToken || phase !== 'ready'}>{phase === 'previewing' ? 'Revisando…' : 'Revisar archivo'}</button>
      </form>
      {error && <p className="catalog-error" role="alert">{error}</p>}
      {message && <p className="catalog-success" role="status">{message}</p>}
      {preview && (
        <div className="import-preview">
          <div className="import-summary">
            <strong>{preview.summary.total} filas</strong><span>{preview.summary.create} nuevas</span><span>{preview.summary.update} actualizaciones</span><span>{preview.summary.errors} con errores</span>
          </div>
          <div className="catalog-table-wrap"><table><thead><tr><th>Fila</th><th>SKU / producto</th><th>Categoría</th><th>Acción</th><th>Revisión</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.row} className={row.errors.length ? 'row-error' : ''}><td>{row.row}</td><td><strong>{row.sku || 'Sin SKU'}</strong><small>{row.name || 'Sin nombre'}</small></td><td>{row.category || '—'}</td><td>{row.action}</td><td>{row.errors.length ? row.errors.join(' ') : row.warnings.length ? row.warnings.join(' ') : 'Lista para importar'}</td></tr>)}</tbody></table></div>
          <button className="confirm-import" type="button" onClick={confirmImport} disabled={!preview.valid || !preview.token || phase !== 'ready'}>{phase === 'confirming' ? 'Importando…' : 'Confirmar importación'}</button>
        </div>
      )}
    </section>
  )
}

function QuotePanel({ inquiry, products, canEdit, csrfToken, onSaved }: {
  inquiry: QuoteInquiry
  products: Product[]
  canEdit: boolean
  csrfToken: string
  onSaved: (quote: FormalQuote) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const quote = inquiry.quote
  const today = todayInChile()
  const defaultValidity = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const endpoint = `/api/inquiries/${inquiry.id}/quote/`
  const currency = formatClp

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const data = new FormData(event.currentTarget)
    const payload = {
      valid_until: data.get('valid_until'),
      tax_rate: data.get('tax_rate'),
      notes: data.get('notes'),
      items: inquiry.items.map((item) => ({ request_item: item.id, unit_price: data.get(`price-${item.id}`) })),
    }
    try {
      const response = await fetch(endpoint, {
        method: quote ? 'PATCH' : 'POST', credentials: 'same-origin',
        headers: { ...jsonHeaders, 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Revisa la vigencia, los precios y los productos de la cotización.')
      onSaved(await response.json() as FormalQuote)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No fue posible guardar la cotización.')
    } finally { setBusy(false) }
  }

  async function issue() {
    if (busy || !quote) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(endpoint + 'issue/', {
        method: 'POST', credentials: 'same-origin',
        headers: { ...jsonHeaders, 'X-CSRFToken': csrfToken },
      })
      if (!response.ok) throw new Error('No fue posible emitir la cotización. Revisa su vigencia.')
      onSaved(await response.json() as FormalQuote)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No fue posible emitir la cotización.')
    } finally { setBusy(false) }
  }

  return <section className="quote-panel" aria-label={`Cotización de ${inquiry.full_name}`}>
    <div className="quote-panel-heading"><div><span className="eyebrow">PROPUESTA COMERCIAL</span><h3>{quote ? `Cotización ${quote.folio}` : 'Preparar cotización'}</h3></div>{quote && <span className={`quote-state ${quote.status.toLowerCase()}`}>{quote.status === 'ISSUED' ? 'Emitida' : 'Borrador'}</span>}</div>
    {quote && <div className="quote-totals"><div><span>Subtotal</span><strong>{currency(quote.subtotal)}</strong></div><div><span>IVA ({Number(quote.tax_rate).toLocaleString('es-CL')}%)</span><strong>{currency(quote.tax_amount)}</strong></div><div className="quote-total"><span>Total</span><strong>{currency(quote.total)}</strong></div></div>}
    {quote?.status === 'ISSUED' && <div className="quote-issued"><p>Emitida · Vigente hasta el {quote.valid_until.split('-').reverse().join('/')}. Puedes imprimirla o guardarla en PDF.</p><a className="quote-primary-button" href={endpoint + 'print/'} target="_blank" rel="noopener noreferrer">Abrir documento para imprimir o guardar como PDF</a></div>}
    {canEdit && quote?.status !== 'ISSUED' && <form key={quote?.id ?? inquiry.id} onSubmit={save} className="quote-editor">
      <div className="quote-editor-intro"><strong>Detalle de productos</strong><span>Ingresa precios en pesos chilenos, sin centavos.</span></div>
      <div className="quote-price-list">{inquiry.items.map((item) => {
        const price = quote?.items.find((line) => line.request_item === item.id)?.unit_price ?? products.find((product) => product.id === item.product)?.price
        return <div className="quote-price-row" key={item.id}><div><strong>{item.product_name}</strong><small>{item.product_sku} · {item.quantity} unidad{item.quantity === 1 ? '' : 'es'}</small></div><label>Precio unitario <span>(CLP)</span><div className="quote-price-input"><span aria-hidden="true">$</span><input name={`price-${item.id}`} type="number" inputMode="numeric" min="0" step="1" required placeholder="0" defaultValue={price == null ? '' : Math.round(Number(price))} aria-label={`${item.product_name} × ${item.quantity} · Precio unitario en pesos`} /></div></label></div>
      })}</div>
      <div className="quote-editor-fields"><label>Válida hasta<input name="valid_until" type="date" min={today} required defaultValue={quote?.valid_until ?? defaultValidity} /></label><label>IVA (%)<input name="tax_rate" type="number" min="0" max="100" step="0.01" required defaultValue={quote?.tax_rate ?? '19.00'} /></label><label className="quote-notes">Condiciones comerciales <span>Opcional</span><textarea name="notes" maxLength={1500} rows={3} placeholder="Ej.: plazo de entrega, forma de pago o retiro" defaultValue={quote?.notes ?? ''} /></label></div>
      {error && <p className="quote-error" role="alert">{error}</p>}
      <div className="quote-actions"><button className="quote-primary-button" type="submit" disabled={busy || !csrfToken}>{busy ? 'Guardando…' : quote ? 'Guardar cambios' : 'Crear borrador'}</button>{quote && <button className="quote-secondary-button" type="button" onClick={issue} disabled={busy || !csrfToken}>Emitir cotización</button>}</div>
      {quote && <p className="quote-save-hint">Antes de emitir, guarda cualquier cambio pendiente. La emisión usa el último borrador guardado.</p>}
    </form>}
  </section>
}

function InquiryCard({ inquiry, expanded, onToggle, products, canEdit, csrfToken, onStatusChange, onQuoteSaved }: {
  inquiry: QuoteInquiry
  expanded: boolean
  onToggle: () => void
  products: Product[]
  canEdit: boolean
  csrfToken: string
  onStatusChange: (status: QuoteInquiry['status']) => void
  onQuoteSaved: (quote: FormalQuote) => void
}) {
  const statusLabel = { NEW: 'Nueva', CONTACTED: 'Contactada', CLOSED: 'Cerrada' }[inquiry.status]
  return <article className={`inquiry-card ${expanded ? 'is-open' : ''}`}>
    <button type="button" className="inquiry-card-toggle" aria-expanded={expanded} aria-controls={`inquiry-detail-${inquiry.id}`} onClick={onToggle}>
      <span className="inquiry-card-top"><span className="inquiry-card-person"><strong>{inquiry.full_name}</strong><small>{inquiry.company_name || 'Sin empresa'}</small></span><span className="inquiry-card-chevron" aria-hidden="true">⌄</span></span>
      <span className="inquiry-card-meta"><span className={`inquiry-status status-${inquiry.status.toLowerCase()}`}>{statusLabel}</span><span>{inquiry.quote ? `${inquiry.quote.folio} · ${inquiry.quote.status === 'ISSUED' ? 'Emitida' : 'Borrador'}` : 'Sin cotización'}</span></span>
      <span className="inquiry-card-summary">{inquiry.items.map((item) => `${item.product_name} × ${item.quantity}`).join(' · ')}</span>
      <span className="inquiry-card-footer"><time dateTime={inquiry.created_at}>{new Date(inquiry.created_at).toLocaleDateString('es-CL')}</time><span>{expanded ? 'Cerrar solicitud' : 'Ver solicitud y cotizar'}</span></span>
    </button>
    {expanded && <div id={`inquiry-detail-${inquiry.id}`} className="inquiry-detail">
      <div className="inquiry-detail-heading"><div><span className="eyebrow">SOLICITUD</span><h3>Datos del cliente</h3></div>{canEdit && <label>Estado<select aria-label={`Estado de ${inquiry.full_name}`} value={inquiry.status} onChange={(event) => onStatusChange(event.target.value as QuoteInquiry['status'])}><option value="NEW">Nueva</option><option value="CONTACTED">Contactada</option><option value="CLOSED">Cerrada</option></select></label>}</div>
      <div className="inquiry-detail-contact">{inquiry.email && <a href={`mailto:${inquiry.email}`}>{inquiry.email}</a>}{inquiry.phone && <a href={`tel:${inquiry.phone}`}>{inquiry.phone}</a>}</div>
      {inquiry.message && <p className="inquiry-message">{inquiry.message}</p>}
      <div className="inquiry-request-items"><strong>Productos solicitados</strong><ul>{inquiry.items.map((item) => <li key={item.id}><span>{item.product_name}</span><strong>× {item.quantity}</strong></li>)}</ul></div>
      <QuotePanel inquiry={inquiry} products={products} canEdit={canEdit} csrfToken={csrfToken} onSaved={onQuoteSaved} />
    </div>}
  </article>
}

function QuoteFollowUpCard({ inquiry, quote, canEdit, csrfToken, onSaved }: {
  inquiry: QuoteInquiry
  quote: FormalQuote
  canEdit: boolean
  csrfToken: string
  onSaved: (quote: FormalQuote) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const today = todayInChile()
  const due = quote.next_contact_on && quote.next_contact_on <= today && quote.tracking_status === 'SENT'

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setSaved(false)
    const data = new FormData(event.currentTarget)
    try {
      const response = await fetch(`/api/inquiries/${inquiry.id}/quote/follow-up/`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { ...jsonHeaders, 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify({
          follow_up_status: data.get('follow_up_status'),
          next_contact_on: data.get('next_contact_on') || null,
          follow_up_notes: data.get('follow_up_notes'),
        }),
      })
      if (!response.ok) throw new Error('No fue posible guardar el seguimiento. Revisa los datos e inténtalo nuevamente.')
      onSaved(await response.json() as FormalQuote)
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar el seguimiento.')
    } finally { setBusy(false) }
  }

  return <article className={`tracking-card ${expanded ? 'is-open' : ''}`}>
    <div className="tracking-card-main"><div><span className="eyebrow">{quote.folio}</span><h3>{inquiry.full_name}</h3><p>{inquiry.company_name || 'Cliente particular'}</p></div><span className={`tracking-badge status-${quote.tracking_status.toLowerCase()}`}>{trackingLabels[quote.tracking_status]}</span></div>
    <div className="tracking-card-values"><div><span>Total</span><strong>{formatClp(quote.total)}</strong></div><div><span>Válida hasta</span><strong>{formatQuoteDate(quote.valid_until)}</strong></div><div><span>Próximo contacto</span><strong className={due ? 'tracking-due' : ''}>{quote.next_contact_on ? formatQuoteDate(quote.next_contact_on) : 'Sin programar'}{due ? ' · Hoy o atrasado' : ''}</strong></div></div>
    <div className="tracking-card-actions"><button type="button" className="quote-secondary-button" aria-expanded={expanded} aria-controls={`follow-up-${quote.id}`} onClick={() => setExpanded((current) => !current)}>{expanded ? 'Cerrar seguimiento' : canEdit ? 'Registrar seguimiento' : 'Ver seguimiento'}</button><a href={`/api/inquiries/${inquiry.id}/quote/print/`} target="_blank" rel="noopener noreferrer">Ver cotización</a></div>
    {expanded && <div id={`follow-up-${quote.id}`} className="tracking-card-detail"><div className="tracking-contact">{inquiry.email && <a href={`mailto:${inquiry.email}`}>{inquiry.email}</a>}{inquiry.phone && <a href={`tel:${inquiry.phone}`}>{inquiry.phone}</a>}</div>
      {canEdit ? <form key={`${quote.id}-${quote.follow_up_status}-${quote.next_contact_on}-${quote.follow_up_notes}`} onSubmit={save} className="tracking-form"><label>Resultado del seguimiento<select name="follow_up_status" defaultValue={quote.follow_up_status}><option value="UNSENT">Por enviar</option><option value="SENT">Enviada por mi cuenta</option><option value="ACCEPTED">Aceptada</option><option value="REJECTED">Rechazada</option></select></label><label>Próximo contacto<input name="next_contact_on" type="date" defaultValue={quote.next_contact_on ?? ''} /></label><label className="tracking-notes">Notas de seguimiento<textarea name="follow_up_notes" maxLength={1500} rows={3} placeholder="Ej.: llamada realizada, respuesta del cliente o próximo paso" defaultValue={quote.follow_up_notes} /></label><p className="tracking-hint">Marcar «Enviada» registra el envío que hiciste por tu cuenta; la aplicación aún no envía correos.</p>{error && <p className="quote-error" role="alert">{error}</p>}{saved && <p className="quote-success" role="status">Seguimiento guardado.</p>}<button className="quote-primary-button" type="submit" disabled={busy || !csrfToken}>{busy ? 'Guardando…' : 'Guardar seguimiento'}</button></form> : <div className="tracking-readonly"><p><strong>Notas:</strong> {quote.follow_up_notes || 'Sin notas de seguimiento.'}</p>{quote.sent_at && <p>Registrada como enviada el {new Date(quote.sent_at).toLocaleDateString('es-CL')}.</p>}</div>}
    </div>}
  </article>
}

function PrivateApp() {
  const [state, setState] = useState<LoadState<TenantContext>>({ phase: 'loading' })
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [inquiries, setInquiries] = useState<QuoteInquiry[]>([])
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [territories, setTerritories] = useState<Territory[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [industrySegments, setIndustrySegments] = useState<IndustrySegmentOption[]>([])
  const [activeSection, setActiveSection] = useState<'summary' | 'catalog' | 'prospects' | 'territories' | 'opportunities' | 'inquiries' | 'quoteTracking'>('summary')
  const [catalogSection, setCatalogSection] = useState<'products' | 'categories' | 'import' | 'matching'>('products')
  const [opportunityStatus, setOpportunityStatus] = useState<'ALL' | Opportunity['status']>('ALL')
  const [generatingOpportunities, setGeneratingOpportunities] = useState(false)
  const [prospectSearch, setProspectSearch] = useState('')
  const [openInquiryId, setOpenInquiryId] = useState<string | null>(null)
  const [trackingFilter, setTrackingFilter] = useState<'ALL' | 'ATTENTION' | FormalQuote['tracking_status']>('ALL')
  const [trackingSearch, setTrackingSearch] = useState('')
  const [csrfToken, setCsrfToken] = useState('')
  const [catalogError, setCatalogError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/tenant/context/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Authentication required')
        const tenant = (await response.json()) as TenantContext
        const [categoryResponse, productResponse, sessionResponse, inquiryResponse, prospectResponse, territoryResponse, opportunityResponse, industryResponse] = await Promise.all([
          fetch('/api/catalog/categories/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/catalog/products/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/auth/session/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/inquiries/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/prospects/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/prospects/territories/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/prospects/opportunities/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/catalog/industry-segments/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
        ])
        if (!categoryResponse.ok || !productResponse.ok || !sessionResponse.ok || !inquiryResponse.ok || !prospectResponse.ok || !territoryResponse.ok || !opportunityResponse.ok || !industryResponse.ok) throw new Error('Private data unavailable')
        const session = (await sessionResponse.json()) as AuthSession
        setCategories((await categoryResponse.json()) as Category[])
        setProducts((await productResponse.json()) as Product[])
        setCsrfToken(session.csrf_token ?? '')
        setInquiries((await inquiryResponse.json()) as QuoteInquiry[])
        setProspects((await prospectResponse.json()) as Prospect[])
        setTerritories((await territoryResponse.json()) as Territory[])
        setOpportunities((await opportunityResponse.json()) as Opportunity[])
        setIndustrySegments((await industryResponse.json()) as IndustrySegmentOption[])
        setState({ phase: 'ready', data: tenant })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ phase: 'error' })
      })
    return () => controller.abort()
  }, [])

  if (state.phase === 'loading') return <main className="centered-state">Verificando acceso…</main>
  if (state.phase === 'error') {
    return (
      <main className="private-shell">
        <Brand name="MAGAVI" logo="/static/magavi-mark.svg" />
        <section className="access-card">
          <span className="eyebrow">ÁREA PRIVADA</span>
          <h1>Necesitas iniciar sesión</h1>
          <p>Esta ruta está protegida y requiere una membresía activa para el dominio actual.</p>
          <a className="primary-action" href="/app/login/">Ir al acceso</a>
        </section>
      </main>
    )
  }

  const canEdit = state.data.role === 'OWNER' || state.data.role === 'ADMIN'
  const issuedInquiries = inquiries.filter((inquiry) => inquiry.quote?.status === 'ISSUED')
  const todayChile = todayInChile()
  const attentionCount = issuedInquiries.filter((inquiry) => inquiry.quote && needsQuoteAttention(inquiry.quote, todayChile)).length
  const visibleQuotes = issuedInquiries.filter((inquiry) => {
    const quote = inquiry.quote
    if (!quote) return false
    const matchesFilter = trackingFilter === 'ALL' || (trackingFilter === 'ATTENTION' ? needsQuoteAttention(quote, todayChile) : quote.tracking_status === trackingFilter)
    const matchesSearch = `${inquiry.full_name} ${inquiry.company_name} ${quote.folio}`.toLocaleLowerCase('es-CL').includes(trackingSearch.toLocaleLowerCase('es-CL'))
    return matchesFilter && matchesSearch
  })

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const response = await catalogRequest('/api/catalog/categories/', 'POST', {
      name: form.get('name'),
      description: form.get('description'),
      is_active: true,
    })
    if (response) {
      setCategories((current) => [...current, response as Category].sort((a, b) => a.name.localeCompare(b.name)))
      formElement.reset()
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const price = String(form.get('price') ?? '').trim()
    const response = await catalogRequest('/api/catalog/products/', 'POST', {
      category: form.get('category'),
      name: form.get('name'),
      sku: form.get('sku'),
      description: form.get('description'),
      format: form.get('format'),
      price: price || null,
      is_available: true,
      is_published: false,
      target_industries: form.getAll('target_industries'),
      match_keywords: String(form.get('match_keywords') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
      commercial_priority: form.get('commercial_priority') || 'MEDIUM',
    })
    if (response) {
      setProducts((current) => [...current, response as Product].sort((a, b) => a.name.localeCompare(b.name)))
      formElement.reset()
    }
  }

  async function togglePublished(product: Product) {
    const response = await catalogRequest(`/api/catalog/products/${product.id}/`, 'PATCH', {
      is_published: !product.is_published,
    })
    if (response) setProducts((current) => current.map((item) => item.id === product.id ? response as Product : item))
  }

  async function updateProductTargeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const productId = String(form.get('product'))
    const response = await catalogRequest(`/api/catalog/products/${productId}/`, 'PATCH', {
      target_industries: form.getAll('target_industries'),
      match_keywords: String(form.get('match_keywords') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
      commercial_priority: form.get('commercial_priority'),
    })
    if (response) {
      setProducts((current) => current.map((item) => item.id === productId ? response as Product : item))
      formElement.reset()
    }
  }

  async function catalogRequest(url: string, method: 'POST' | 'PATCH', body: object) {
    setCatalogError('')
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { ...jsonHeaders, 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      setCatalogError('No fue posible guardar. Revisa los datos e inténtalo nuevamente.')
      return null
    }
    return response.json() as Promise<unknown>
  }

  async function refreshCatalog() {
    const [categoryResponse, productResponse] = await Promise.all([
      fetch('/api/catalog/categories/', { headers: jsonHeaders, credentials: 'same-origin' }),
      fetch('/api/catalog/products/', { headers: jsonHeaders, credentials: 'same-origin' }),
    ])
    if (!categoryResponse.ok || !productResponse.ok) throw new Error('Catalog unavailable')
    setCategories((await categoryResponse.json()) as Category[])
    setProducts((await productResponse.json()) as Product[])
  }

  async function createProspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const response = await catalogRequest('/api/prospects/', 'POST', {
      territory: form.get('territory') || null, name: form.get('name'), industry: form.get('industry'), address: form.get('address'), city: form.get('city'), region: form.get('region'),
      website: form.get('website'), email: form.get('email'), phone: form.get('phone'), source: form.get('source'),
      notes: form.get('notes'), verified_at: form.get('verified_at') || null, status: 'NEW',
    })
    if (response) {
      setProspects((current) => [...current, response as Prospect].sort((a, b) => a.name.localeCompare(b.name)))
      formElement.reset()
    }
  }

  async function createTerritory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const response = await catalogRequest('/api/prospects/territories/', 'POST', {
      name: form.get('name'), description: form.get('description'), region: form.get('region'),
      localities: String(form.get('localities') ?? '').split(',').map((item) => item.trim()).filter(Boolean),
      prospect_goal: Number(form.get('prospect_goal') || 0), is_active: true,
    })
    if (response) {
      setTerritories((current) => [...current, response as Territory].sort((a, b) => a.name.localeCompare(b.name)))
      formElement.reset()
    }
  }

  async function updateProspectStatus(prospect: Prospect, status: Prospect['status']) {
    const response = await catalogRequest(`/api/prospects/${prospect.id}/`, 'PATCH', { status })
    if (response) setProspects((current) => current.map((item) => item.id === prospect.id ? response as Prospect : item))
  }

  async function updateInquiryStatus(inquiry: QuoteInquiry, status: QuoteInquiry['status']) {
    setCatalogError('')
    const response = await fetch(`/api/inquiries/${inquiry.id}/`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { ...jsonHeaders, 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) {
      setCatalogError('No fue posible actualizar la solicitud.')
      return
    }
    const updated = await response.json() as QuoteInquiry
    setInquiries((current) => current.map((item) => item.id === updated.id ? updated : item))
  }

  async function refreshOpportunities() {
    const response = await fetch('/api/prospects/opportunities/', { headers: jsonHeaders, credentials: 'same-origin' })
    if (!response.ok) throw new Error('Opportunities unavailable')
    setOpportunities((await response.json()) as Opportunity[])
  }

  async function generateMatches() {
    setCatalogError('')
    setGeneratingOpportunities(true)
    try {
      const response = await fetch('/api/prospects/opportunities/generate/', {
        method: 'POST', credentials: 'same-origin', headers: { ...jsonHeaders, 'X-CSRFToken': csrfToken },
      })
      if (!response.ok) throw new Error('Generation unavailable')
      await refreshOpportunities()
    } catch {
      setCatalogError('No fue posible calcular las oportunidades. Configura las reglas de los productos e inténtalo nuevamente.')
    } finally {
      setGeneratingOpportunities(false)
    }
  }

  async function reviewOpportunity(opportunity: Opportunity, status: Opportunity['status']) {
    let reviewReason = opportunity.review_reason
    if (status === 'DISCARDED') {
      reviewReason = window.prompt('Indica por qué se descarta esta oportunidad:', opportunity.review_reason) ?? ''
      if (!reviewReason.trim()) return
    }
    const response = await catalogRequest(`/api/prospects/opportunities/${opportunity.id}/`, 'PATCH', {
      status, review_reason: reviewReason,
    })
    if (response) setOpportunities((current) => current.map((item) => item.id === opportunity.id ? response as Opportunity : item))
  }

  return (
    <main className="private-shell admin-shell">
      <aside className="admin-sidebar">
        <Brand name={state.data.name} logo="/static/magavi-mark.svg" />
        <nav aria-label="Administración de la empresa">
          <button className={activeSection === 'summary' ? 'is-active' : ''} onClick={() => setActiveSection('summary')}>Resumen</button>
          <button className={activeSection === 'catalog' ? 'is-active' : ''} onClick={() => setActiveSection('catalog')}>Catálogo <span>{products.length}</span></button>
          <button className={activeSection === 'prospects' ? 'is-active' : ''} onClick={() => setActiveSection('prospects')}>Prospectos <span>{prospects.length}</span></button>
          <button className={activeSection === 'territories' ? 'is-active' : ''} onClick={() => setActiveSection('territories')}>Territorios <span>{territories.length}</span></button>
          <button className={activeSection === 'opportunities' ? 'is-active' : ''} onClick={() => setActiveSection('opportunities')}>Oportunidades <span>{opportunities.filter((item) => item.status === 'PENDING').length}</span></button>
          <button className={activeSection === 'inquiries' ? 'is-active' : ''} onClick={() => setActiveSection('inquiries')}>Solicitudes <span>{inquiries.length}</span></button>
          <button className={activeSection === 'quoteTracking' ? 'is-active' : ''} onClick={() => setActiveSection('quoteTracking')}>Seguimiento <span>{attentionCount}</span></button>
        </nav>
        <div className="sidebar-footer"><small>{state.data.role}</small><LogoutButton /></div>
      </aside>
      <div className="admin-content">
        <section className="private-heading">
          <span className="eyebrow">ÁREA PRIVADA</span>
          <h1>{activeSection === 'summary' ? `Hola, equipo de ${state.data.name}` : ({ catalog: 'Catálogo comercial', prospects: 'Prospectos comerciales', territories: 'Territorios', opportunities: 'Oportunidades priorizadas', inquiries: 'Solicitudes comerciales', quoteTracking: 'Seguimiento de cotizaciones' } as const)[activeSection]}</h1>
          <p>Selecciona una opción del menú para administrar esta empresa.</p>
        </section>
        {catalogError && <p className="catalog-error" role="alert">{catalogError}</p>}

        {activeSection === 'summary' && <section className="summary-grid" aria-label="Resumen de la empresa">
          <button onClick={() => setActiveSection('catalog')}><span>Catálogo</span><strong>{products.length}</strong><small>productos registrados</small></button>
          <button onClick={() => setActiveSection('prospects')}><span>Prospectos</span><strong>{prospects.length}</strong><small>organizaciones potenciales</small></button>
          <button onClick={() => setActiveSection('territories')}><span>Territorios</span><strong>{territories.length}</strong><small>zonas comerciales</small></button>
          <button onClick={() => setActiveSection('opportunities')}><span>Oportunidades</span><strong>{opportunities.filter((item) => item.status === 'PENDING').length}</strong><small>recomendaciones por revisar</small></button>
          <button onClick={() => setActiveSection('inquiries')}><span>Solicitudes</span><strong>{inquiries.length}</strong><small>contactos recibidos</small></button>
          <button onClick={() => setActiveSection('quoteTracking')}><span>Seguimiento</span><strong>{attentionCount}</strong><small>cotizaciones que requieren atención</small></button>
        </section>}

        {activeSection === 'catalog' && <section className="catalog-workspace">
          <div className="catalog-workspace-intro">
            <div><span className="eyebrow">CENTRO DE CATÁLOGO</span><h2>Gestiona la oferta comercial por etapas</h2><p>Separamos productos, categorías, importación y reglas de oportunidad para trabajar con menos ruido.</p></div>
            <div className="catalog-health" aria-label="Estado del catálogo"><strong>{products.length}</strong><span>productos</span><strong>{categories.length}</strong><span>categorías</span></div>
          </div>
          <nav className="catalog-subnav" aria-label="Secciones del catálogo">
            <button className={catalogSection === 'products' ? 'is-active' : ''} onClick={() => setCatalogSection('products')}><span>01</span><strong>Productos</strong><small>Oferta, precios y publicación</small></button>
            <button className={catalogSection === 'categories' ? 'is-active' : ''} onClick={() => setCatalogSection('categories')}><span>02</span><strong>Categorías</strong><small>Organización de la oferta</small></button>
            <button className={catalogSection === 'import' ? 'is-active' : ''} onClick={() => setCatalogSection('import')}><span>03</span><strong>Importación</strong><small>Carga masiva revisable</small></button>
            <button className={catalogSection === 'matching' ? 'is-active' : ''} onClick={() => setCatalogSection('matching')}><span>04</span><strong>Reglas comerciales</strong><small>Segmentos y palabras clave</small></button>
          </nav>

          {catalogSection === 'products' && <div className="catalog-module">
            <header className="module-heading"><div><span className="eyebrow">PRODUCTOS</span><h2>Oferta comercial</h2><p>Crea productos y controla disponibilidad, precio y publicación desde una sola vista.</p></div></header>
            {canEdit && <form className="catalog-form product-create-form" onSubmit={createProduct}><div><span className="eyebrow">NUEVO PRODUCTO</span><h3>Datos esenciales</h3></div><label>Categoría<select name="category" required defaultValue=""><option value="" disabled>Selecciona una categoría</option>{categories.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Nombre<input name="name" required maxLength={160} /></label><label>SKU<input name="sku" required maxLength={80} /></label><label>Formato<input name="format" maxLength={120} /></label><label>Precio<input name="price" type="number" min="0" step="0.01" /></label><label className="wide-field">Descripción<textarea name="description" maxLength={1000} /></label><button type="submit" disabled={!csrfToken || categories.length === 0}>Crear producto</button></form>}
            <section className="catalog-list"><div className="catalog-list-heading"><div><span className="eyebrow">INVENTARIO</span><h2>Productos de {state.data.name}</h2></div><strong>{products.length} producto{products.length === 1 ? '' : 's'}</strong></div>{products.length === 0 ? <p className="empty-catalog">Todavía no hay productos.</p> : <div className="catalog-table-wrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Estado</th><th>Publicación</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku}</small></td><td>{product.category_name}</td><td>{product.price ? `$${Number(product.price).toLocaleString('es-CL')}` : 'Por cotizar'}</td><td>{product.is_available ? 'Disponible' : 'No disponible'}</td><td>{canEdit ? <button className={`publish-button ${product.is_published ? 'is-published' : ''}`} onClick={() => togglePublished(product)}>{product.is_published ? 'Publicado' : 'Publicar'}</button> : product.is_published ? 'Publicado' : 'Borrador'}</td></tr>)}</tbody></table></div>}</section>
          </div>}

          {catalogSection === 'categories' && <div className="catalog-module category-module">
            <header className="module-heading"><div><span className="eyebrow">CATEGORÍAS</span><h2>Taxonomía del catálogo</h2><p>Agrupa la oferta para que clientes, importaciones y reglas comerciales usen una estructura consistente.</p></div></header>
            {canEdit && <form className="catalog-form category-create-form" onSubmit={createCategory}><div><span className="eyebrow">NUEVA CATEGORÍA</span><h3>Crear agrupación</h3></div><label>Nombre<input name="name" required maxLength={120} /></label><label>Descripción<textarea name="description" maxLength={500} /></label><button type="submit" disabled={!csrfToken}>Crear categoría</button></form>}
            <div className="category-grid">{categories.length === 0 ? <p className="empty-catalog">Crea una categoría antes de registrar productos.</p> : categories.map((category) => <article key={category.id}><div><strong>{category.name}</strong><span className={category.is_active ? 'status-active' : ''}>{category.is_active ? 'Activa' : 'Inactiva'}</span></div><p>{category.description || 'Sin descripción.'}</p><small>{products.filter((product) => product.category === category.id).length} productos asociados</small></article>)}</div>
          </div>}

          {catalogSection === 'import' && <div className="catalog-module import-module">
            <header className="module-heading"><div><span className="eyebrow">IMPORTACIÓN</span><h2>Carga masiva de productos</h2><p>Descarga la plantilla, revisa los cambios y confirma solo cuando el archivo esté correcto.</p></div></header>
            {canEdit ? <CatalogImportPanel csrfToken={csrfToken} onConfirmed={refreshCatalog} /> : <p className="empty-catalog">Tu rol tiene acceso de lectura y no puede ejecutar importaciones.</p>}
          </div>}

          {catalogSection === 'matching' && <div className="catalog-module matching-module">
            <header className="module-heading"><div><span className="eyebrow">REGLAS COMERCIALES</span><h2>Segmentación para oportunidades</h2><p>Indica a qué industrias y señales responde cada producto. Estas reglas alimentan el score explicable.</p></div></header>
            {canEdit && products.length > 0 && <form className="matching-rules-form" onSubmit={updateProductTargeting}><label>Producto<select name="product" required defaultValue=""><option value="" disabled>Selecciona un producto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><fieldset className="industry-selector"><legend>Industrias objetivo</legend><p>Selecciona segmentos normalizados para mantener datos comparables.</p><div>{industrySegments.map(({ value, label }) => <label key={value}><input type="checkbox" name="target_industries" value={value} /> <span>{label}</span></label>)}</div></fieldset><label>Palabras clave<input name="match_keywords" placeholder="mariscos, cocina, eventos" /></label><label>Prioridad<select name="commercial_priority" defaultValue="MEDIUM"><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option></select></label><button type="submit" disabled={!csrfToken}>Guardar reglas</button></form>}
            {products.length === 0 ? <p className="empty-catalog">Registra productos antes de configurar reglas comerciales.</p> : <div className="matching-product-grid">{products.map((product) => <article key={product.id}><div><strong>{product.name}</strong><span className={`priority priority-${product.commercial_priority.toLowerCase()}`}>{product.commercial_priority === 'HIGH' ? 'Alta' : product.commercial_priority === 'LOW' ? 'Baja' : 'Media'}</span></div><small>{product.sku} · {product.category_name}</small><section><span>Industrias</span><p>{product.target_industry_labels.length ? product.target_industry_labels.join(', ') : 'Sin industrias configuradas'}</p></section><section><span>Palabras clave</span><p>{product.match_keywords.length ? product.match_keywords.join(', ') : 'Sin palabras clave configuradas'}</p></section></article>)}</div>}
          </div>}
        </section>}

        {activeSection === 'prospects' && <section className="catalog-list prospect-list">
          <div className="catalog-list-heading"><div><span className="eyebrow">PROSPECCIÓN</span><h2>Prospectos comerciales</h2></div><strong>{prospects.length}</strong></div>
          {canEdit && <form className="prospect-form" onSubmit={createProspect}><label>Nombre comercial<input name="name" required /></label><label>Territorio<select name="territory" defaultValue=""><option value="">Sin asignar</option>{territories.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Industria<select name="industry" defaultValue=""><option value="">Sin clasificar</option>{industrySegments.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label><label>Dirección<input name="address" /></label><label>Ciudad o comuna<input name="city" /></label><label>Región<input name="region" /></label><label>Sitio web<input name="website" type="url" /></label><label>Correo<input name="email" type="email" /></label><label>Teléfono<input name="phone" /></label><label>Fuente<input name="source" required /></label><label>Verificado el<input name="verified_at" type="date" /></label><label className="wide-field">Observaciones<textarea name="notes" /></label><button type="submit" disabled={!csrfToken}>Crear prospecto</button></form>}
          <label className="prospect-search">Buscar prospectos<input value={prospectSearch} onChange={(event) => setProspectSearch(event.target.value)} placeholder="Nombre, rubro o ubicación" /></label>
          {prospects.length === 0 ? <p className="empty-catalog">Todavía no hay prospectos.</p> : <div className="prospect-grid">{prospects.filter((prospect) => `${prospect.name} ${prospect.industry_label} ${prospect.city}`.toLowerCase().includes(prospectSearch.toLowerCase())).map((prospect) => <article key={prospect.id}><div className="inquiry-title"><div><strong>{prospect.name}</strong><small>{prospect.industry_label || 'Sin industria'} · {prospect.territory_name || 'Sin territorio'}</small></div>{canEdit ? <select aria-label={`Estado de ${prospect.name}`} value={prospect.status} onChange={(event) => updateProspectStatus(prospect, event.target.value as Prospect['status'])}><option value="NEW">Nuevo</option><option value="REVIEWED">Revisado</option><option value="DISCARDED">Descartado</option></select> : <span>{prospect.status}</span>}</div><p>{prospect.notes || 'Sin observaciones.'}</p><small>Fuente: {prospect.source}</small>{prospect.duplicate_warnings.length > 0 && <p className="duplicate-warning">Posible duplicado: {prospect.duplicate_warnings.map((warning) => warning.name).join(', ')}</p>}</article>)}</div>}
        </section>}

        {activeSection === 'territories' && <section className="catalog-list territory-list">
          <div className="catalog-list-heading"><div><span className="eyebrow">COBERTURA</span><h2>Territorios comerciales</h2></div><strong>{territories.length}</strong></div>
          {canEdit && <form className="territory-form" onSubmit={createTerritory}><label>Nombre<input name="name" required /></label><label>Región<input name="region" /></label><label>Localidades separadas por coma<input name="localities" placeholder="Viña del Mar, Concón" /></label><label>Objetivo de prospectos<input name="prospect_goal" type="number" min="0" defaultValue="0" /></label><label className="wide-field">Descripción<textarea name="description" /></label><button type="submit" disabled={!csrfToken}>Crear territorio</button></form>}
          {territories.length === 0 ? <p className="empty-catalog">Crea el primer territorio para organizar la prospección.</p> : <div className="territory-grid">{territories.map((territory) => <article key={territory.id}><div><strong>{territory.name}</strong><small>{territory.region || 'Sin región'}</small></div><p>{territory.description || territory.localities.join(', ') || 'Sin descripción.'}</p><div className="coverage-bar"><span style={{ width: `${territory.coverage_percentage}%` }} /></div><footer><span>{territory.prospect_count} prospectos</span><span>{territory.reviewed_count} revisados</span><strong>{territory.coverage_percentage}%</strong></footer></article>)}</div>}
        </section>}

        {activeSection === 'opportunities' && <section className="catalog-list opportunity-list">
          <div className="opportunity-heading"><div><span className="eyebrow">MATCHING EXPLICABLE</span><h2>Bandeja de oportunidades</h2><p>Productos recomendados para cada prospecto según reglas comerciales verificables.</p></div>{canEdit && <button type="button" onClick={generateMatches} disabled={!csrfToken || generatingOpportunities}>{generatingOpportunities ? 'Calculando…' : 'Calcular oportunidades'}</button>}</div>
          <div className="opportunity-filters"><label>Estado<select value={opportunityStatus} onChange={(event) => setOpportunityStatus(event.target.value as typeof opportunityStatus)}><option value="ALL">Todos</option><option value="PENDING">Pendientes</option><option value="ACCEPTED">Aceptadas</option><option value="POSTPONED">Postergadas</option><option value="DISCARDED">Descartadas</option></select></label><span>{opportunities.filter((item) => opportunityStatus === 'ALL' || item.status === opportunityStatus).length} resultados</span></div>
          {opportunities.length === 0 ? <div className="empty-catalog"><strong>Aún no hay oportunidades.</strong><p>Configura industrias o palabras clave en el catálogo, registra prospectos y ejecuta el cálculo.</p></div> : <div className="opportunity-grid">{opportunities.filter((item) => opportunityStatus === 'ALL' || item.status === opportunityStatus).map((opportunity) => <article key={opportunity.id}><header><div className={`score-badge score-${opportunity.score >= 75 ? 'high' : opportunity.score >= 50 ? 'medium' : 'low'}`}><strong>{opportunity.score}</strong><small>/100</small></div><div><span>{opportunity.prospect_name}</span><h3>{opportunity.product_name}</h3><small>{opportunity.prospect_industry || 'Sin rubro'} · {opportunity.territory_name || 'Sin territorio'}</small></div></header><p>{opportunity.explanation}</p><div className="score-breakdown">{Object.entries(opportunity.score_breakdown).filter(([, value]) => value > 0).map(([criterion, value]) => <span key={criterion}>{({ industry: 'Rubro', keywords: 'Señales', territory: 'Territorio', contact: 'Contacto', data_quality: 'Calidad', priority: 'Prioridad' } as Record<string, string>)[criterion] ?? criterion} +{value}</span>)}</div><footer><small>Fórmula {opportunity.score_version}</small>{canEdit ? <select aria-label={`Revisar ${opportunity.prospect_name} y ${opportunity.product_name}`} value={opportunity.status} onChange={(event) => reviewOpportunity(opportunity, event.target.value as Opportunity['status'])}><option value="PENDING">Pendiente</option><option value="ACCEPTED">Aceptar</option><option value="POSTPONED">Postergar</option><option value="DISCARDED">Descartar</option></select> : <strong>{opportunity.status}</strong>}</footer>{opportunity.review_reason && <p className="review-reason">Motivo: {opportunity.review_reason}</p>}</article>)}</div>}
        </section>}

        {activeSection === 'inquiries' && <section className="catalog-list inquiry-list">
          <div className="catalog-list-heading"><div><span className="eyebrow">SOLICITUDES</span><h2>Contactos y cotizaciones</h2><p>Selecciona una solicitud para revisar los datos del cliente y preparar su cotización.</p></div><strong>{inquiries.length} solicitud{inquiries.length === 1 ? '' : 'es'}</strong></div>
          {inquiries.length === 0 ? <p className="empty-catalog">Todavía no hay solicitudes comerciales.</p> : <div className="inquiry-grid">{inquiries.map((inquiry) => <InquiryCard key={inquiry.id} inquiry={inquiry} expanded={openInquiryId === inquiry.id} onToggle={() => setOpenInquiryId((current) => current === inquiry.id ? null : inquiry.id)} products={products} canEdit={canEdit} csrfToken={csrfToken} onStatusChange={(status) => updateInquiryStatus(inquiry, status)} onQuoteSaved={(quote) => setInquiries((current) => current.map((item) => item.id === inquiry.id ? { ...item, quote } : item))} />)}</div>}
        </section>}

        {activeSection === 'quoteTracking' && <section className="catalog-list tracking-list">
          <div className="catalog-list-heading"><div><span className="eyebrow">GESTIÓN COMERCIAL</span><h2>Seguimiento de cotizaciones</h2><p>Revisa cotizaciones emitidas, registra el resultado de cada contacto y planifica el próximo paso.</p></div><strong>{issuedInquiries.length} emitida{issuedInquiries.length === 1 ? '' : 's'}</strong></div>
          {issuedInquiries.length === 0 ? <div className="empty-catalog"><strong>Aún no hay cotizaciones emitidas.</strong><p>Emite una desde Solicitudes para comenzar el seguimiento.</p></div> : <><div className="tracking-toolbar"><div className="tracking-filters" aria-label="Filtrar cotizaciones">{([['ALL', 'Todas'], ['ATTENTION', `Requieren atención (${attentionCount})`], ['UNSENT', 'Por enviar'], ['SENT', 'Enviadas'], ['ACCEPTED', 'Aceptadas'], ['REJECTED', 'Rechazadas'], ['EXPIRED', 'Vencidas']] as const).map(([value, label]) => <button key={value} type="button" className={trackingFilter === value ? 'is-active' : ''} aria-pressed={trackingFilter === value} onClick={() => setTrackingFilter(value)}>{label}</button>)}</div><label className="tracking-search">Buscar por cliente o folio<input value={trackingSearch} onChange={(event) => setTrackingSearch(event.target.value)} placeholder="Nombre, empresa o COT-..." /></label></div>{visibleQuotes.length === 0 ? <p className="empty-catalog">No hay cotizaciones que coincidan con esta búsqueda o filtro.</p> : <div className="tracking-grid">{visibleQuotes.map((inquiry) => inquiry.quote && <QuoteFollowUpCard key={inquiry.id} inquiry={inquiry} quote={inquiry.quote} canEdit={canEdit} csrfToken={csrfToken} onSaved={(quote) => setInquiries((current) => current.map((item) => item.id === inquiry.id ? { ...item, quote } : item))} />)}</div>}</>}
        </section>}
      </div>
    </main>
  )
}

function LogoutButton() {
  const [submitting, setSubmitting] = useState(false)

  async function logout() {
    setSubmitting(true)
    try {
      const sessionResponse = await fetch('/api/auth/session/', { headers: jsonHeaders, credentials: 'same-origin' })
      const session = (await sessionResponse.json()) as AuthSession
      const response = await fetch('/api/auth/logout/', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { ...jsonHeaders, 'X-CSRFToken': session.csrf_token ?? '' },
      })
      if (!response.ok) throw new Error('Logout unavailable')
      window.location.assign('/app/login/')
    } catch {
      setSubmitting(false)
    }
  }

  return <button className="logout-button" type="button" onClick={logout} disabled={submitting}>{submitting ? 'Saliendo…' : 'Cerrar sesión'}</button>
}

function LoginPage() {
  const [csrfToken, setCsrfToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phase, setPhase] = useState<'loading' | 'ready' | 'submitting' | 'error'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/auth/session/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Session unavailable')
        const session = (await response.json()) as AuthSession
        if (session.authenticated) {
          window.location.assign('/app/')
          return
        }
        setCsrfToken(session.csrf_token ?? '')
        setPhase('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setPhase('error')
      })
    return () => controller.abort()
  }, [])

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPhase('submitting')
    try {
      const response = await fetch('/api/auth/login/', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { ...jsonHeaders, 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) throw new Error('Invalid credentials')
      window.location.assign('/app/')
    } catch {
      setPassword('')
      setPhase('error')
    }
  }

  return (
    <main className="login-shell">
      <a href="/" className="back-link">← Volver al sitio</a>
      <section className="login-card">
        <Brand name="MAGAVI" logo="/static/magavi-mark.svg" />
        <div>
          <span className="eyebrow">ACCESO SEGURO</span>
          <h1>Ingresa a tu espacio comercial</h1>
          <p>Utiliza las credenciales asociadas a esta empresa. El acceso está aislado por dominio y membresía.</p>
        </div>
        <form aria-label="Formulario de acceso" onSubmit={submitLogin}>
          <label>Correo electrónico<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={phase === 'loading' || phase === 'submitting'} /></label>
          <label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={phase === 'loading' || phase === 'submitting'} /></label>
          {phase === 'error' && <p className="form-error" role="alert">No fue posible iniciar sesión. Revisa tus datos e inténtalo nuevamente.</p>}
          <button type="submit" disabled={phase === 'loading' || phase === 'submitting' || !csrfToken}>{phase === 'submitting' ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
      </section>
    </main>
  )
}

export default function App() {
  const path = window.location.pathname
  if (path === '/app/login' || path === '/app/login/') return <LoginPage />
  if (path === '/app' || path.startsWith('/app/')) return <PrivateApp />
  return <PublicLanding />
}
