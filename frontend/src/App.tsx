import { type CSSProperties, type FormEvent, useEffect, useState } from 'react'
import { buildCommercialInsights, contactsMatch, type CommercialPriority } from './commercialInsights'

type LandingData = {
  name: string
  description: string
  headline: string
  logo_path: string
  theme: { primary: string; secondary: string }
  contact: { email: string; phone: string }
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
  image_path: string | null
}

type Category = { id: string; name: string; description: string; is_active: boolean }
type Product = PublicProduct & {
  category: string
  category_name: string
  category_is_active: boolean
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

type PurchaseOrder = {
  id: string
  folio: string
  full_name: string
  company_name: string
  email: string
  phone: string
  delivery_method: 'COORDINATE' | 'PICKUP' | 'SHIPPING'
  delivery_address: string
  notes: string
  status: 'NEW' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
  source_request: string | null
  items: { product_name: string; product_sku: string; quantity: number; unit_price: string; line_total: string }[]
  total: string
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
function colorLuminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
  return channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0)
}

const colorOn = (hex: string) => colorLuminance(hex) > 0.18 ? '#000000' : '#ffffff'
const todayInChile = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

function needsQuoteAttention(quote: FormalQuote, today: string) {
  return quote.tracking_status === 'UNSENT' || quote.tracking_status === 'EXPIRED'
    || (quote.tracking_status === 'SENT' && !!quote.next_contact_on && quote.next_contact_on <= today)
}

type Territory = { id: string; name: string; description: string; region: string; localities: string[]; prospect_goal: number; is_active: boolean; prospect_count: number; reviewed_count: number; coverage_percentage: number }
type ChileanRegionOption = { name: string; localities: string[] }

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
  instagram_handle: string
  discovery_score: number | null
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
  logo_path: string
  primary_color: string
  secondary_color: string
  contact_email: string
}

type AuthSession = {
  authenticated: boolean
  csrf_token?: string
  tenant?: TenantContext
}

type DiscoveryStatus = {
  configured: boolean
  enabled: boolean
  status: 'NOT_STARTED' | 'RUNNING' | 'PENDING' | 'COMPLETED' | 'FAILED' | 'SKIPPED'
  finished_at: string | null
  hashtags: string[]
  profiles_found: number
  prospects_created: number
  error: string
  mindcase_job_id: string
  mindcase_next_poll_at?: string | null
}

type DiscoveryEvaluation = {
  id: string
  batch_id: string
  username: string
  name: string
  search_term: string
  decision: 'CREATED' | 'EXISTING' | 'REJECTED' | 'NOT_EVALUATED'
  score: number | null
  reason: string
  evaluated_at: string
}

type DiscoveryEvaluationPage = { total: number; results: DiscoveryEvaluation[] }

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

type SelectedProduct = { product: PublicProduct; quantity: number }

function PublicQuoteForm({ selectedItems, mode, onSuccess }: { selectedItems: SelectedProduct[]; mode: 'quote' | 'purchase'; onSuccess: (folio?: string) => void }) {
  const [phase, setPhase] = useState<'ready' | 'submitting' | 'error'>('ready')
  const [error, setError] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState<'COORDINATE' | 'PICKUP' | 'SHIPPING'>('COORDINATE')

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    if (selectedItems.length === 0) {
      setError('Agrega al menos un producto a tu selección.')
      setPhase('error')
      return
    }
    if (!String(data.get('email') || '').trim() && !String(data.get('phone') || '').trim()) {
      setError('Ingresa un correo electrónico o teléfono para responderte.')
      setPhase('error')
      return
    }
    setError('')
    setPhase('submitting')
    const body = {
      full_name: data.get('full_name'),
      company_name: data.get('company_name'),
      email: data.get('email'),
      phone: data.get('phone'),
      ...(mode === 'quote' ? { message: data.get('message') } : {
        notes: data.get('notes'),
        delivery_method: data.get('delivery_method'),
        delivery_address: data.get('delivery_address') ?? '',
      }),
      website: data.get('website'),
      consent: data.get('consent') === 'on',
      items: selectedItems.map(({ product, quantity }) => ({
        product: product.id,
        quantity,
      })),
    }
    try {
      const response = await fetch(mode === 'quote' ? '/api/inquiries/public/' : '/api/inquiries/orders/public/', {
        method: 'POST',
        headers: { ...jsonHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error('Request rejected')
      const result = await response.json() as { folio?: string }
      form.reset()
      onSuccess(result.folio)
    } catch {
      setError(mode === 'quote' ? 'No fue posible enviar la solicitud. Revisa tus datos e inténtalo nuevamente.' : 'No fue posible registrar el pedido. Revisa tus datos e inténtalo nuevamente.')
      setPhase('error')
    }
  }

  return (
    <form className="quote-form" onSubmit={submitRequest} aria-label={mode === 'quote' ? 'Solicitud de cotización' : 'Finalizar compra'}>
      <div className="quote-products">
        <span className="eyebrow">{mode === 'quote' ? 'TU SOLICITUD' : 'TU PEDIDO'}</span>
        <h3>Productos elegidos</h3>
        <ul>{selectedItems.map(({ product, quantity }) => <li key={product.id}><span>{product.name}</span><strong>× {quantity}{mode === 'purchase' && product.price ? ` · ${formatClp(String(Number(product.price) * quantity))}` : ''}</strong></li>)}</ul>
        {mode === 'purchase' && <p className="checkout-total"><span>Total productos</span><strong>{formatClp(String(selectedItems.reduce((sum, { product, quantity }) => sum + Number(product.price) * quantity, 0)))}</strong></p>}
        <a href="#mi-seleccion">Modificar mi selección</a>
      </div>
      <div className="quote-fields">
        <h3>Datos de contacto</h3>
        <label>Nombre completo<input name="full_name" maxLength={160} required /></label>
        <label>Empresa<input name="company_name" maxLength={160} /></label>
        <div className="form-row"><label>Correo electrónico<input name="email" type="email" /></label><label>Teléfono<input name="phone" maxLength={40} /></label></div>
        <small className="quote-contact-hint">Ingresa al menos uno de estos datos para que podamos responderte.</small>
        {mode === 'purchase' && <><label>Entrega<select name="delivery_method" value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value as typeof deliveryMethod)}><option value="COORDINATE">A coordinar con la empresa</option><option value="PICKUP">Retiro</option><option value="SHIPPING">Despacho</option></select></label>{deliveryMethod === 'SHIPPING' && <label>Dirección de despacho<input name="delivery_address" maxLength={300} required placeholder="Calle, número, comuna y región" /></label>}</>}
        <label>{mode === 'quote' ? 'Mensaje' : 'Indicaciones para el pedido'}<textarea name={mode === 'quote' ? 'message' : 'notes'} maxLength={1500} /></label>
        <label className="honeypot" aria-hidden="true">Sitio web<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <label className="consent-field"><input name="consent" type="checkbox" required /> {mode === 'quote' ? 'Autorizo que esta empresa me contacte para responder mi solicitud.' : 'Autorizo que esta empresa me contacte para coordinar mi pedido.'}</label>
        {mode === 'purchase' && <p className="checkout-hint">Tu pedido quedará registrado. La empresa confirmará disponibilidad, entrega y forma de pago. El despacho, si aplica, se coordina por separado.</p>}
        {phase === 'error' && <p className="quote-error" role="alert">{error}</p>}
        <button type="submit" disabled={phase === 'submitting' || selectedItems.length === 0}>{phase === 'submitting' ? 'Enviando…' : mode === 'quote' ? 'Enviar solicitud' : 'Confirmar pedido'}</button>
      </div>
    </form>
  )
}

function SelectionPanel({ items, onQuantityChange, onRemove, onQuote, onPurchase }: {
  items: SelectedProduct[]
  onQuantityChange: (productId: string, quantity: number) => void
  onRemove: (productId: string) => void
  onQuote: () => void
  onPurchase: () => void
}) {
  const purchasable = items.length > 0 && items.length <= 50 && items.every(({ product }) => product.price !== null && Number(product.price) > 0 && Number.isInteger(Number(product.price)))
  return <aside className="landing-selection" id="mi-seleccion" aria-labelledby="selection-title">
    <div className="selection-heading"><span className="eyebrow">TU PEDIDO</span><h3 id="selection-title">Mi selección</h3><p aria-live="polite">{items.length} producto{items.length === 1 ? '' : 's'} elegido{items.length === 1 ? '' : 's'}</p></div>
    {items.length === 0 ? <p className="selection-empty">Agrega productos del catálogo para preparar tu solicitud.</p> : <ul className="selection-items">{items.map(({ product, quantity }) => <li key={product.id}><div><strong>{product.name}</strong><small>{product.format || product.category}</small></div><label>Cantidad<input type="number" inputMode="numeric" min="1" max="100000" value={quantity} aria-label={`Cantidad de ${product.name}`} onChange={(event) => onQuantityChange(product.id, Math.min(100000, Math.max(1, Math.trunc(Number(event.target.value)) || 1)))} /></label><button type="button" onClick={() => onRemove(product.id)} aria-label={`Quitar ${product.name}`}>Quitar</button></li>)}</ul>}
    <button className="selection-quote-button" type="button" disabled={items.length === 0} onClick={onQuote}>Solicitar cotización <span aria-hidden="true">→</span></button>
    <button className="selection-purchase-button" type="button" disabled={!purchasable} onClick={onPurchase}>Comprar ahora <span aria-hidden="true">→</span></button>
    <small className="selection-note">{purchasable ? `Total productos: ${formatClp(String(items.reduce((sum, { product, quantity }) => sum + Number(product.price) * quantity, 0)))}. Pago y entrega a coordinar.` : items.length > 50 ? 'Un pedido admite hasta 50 productos distintos. Puedes reducir la selección o solicitar una cotización.' : items.length ? 'Para comprar, todos los productos deben tener precio. Puedes solicitar una cotización.' : 'Elige productos para cotizar o comprar.'}</small>
  </aside>
}

const normalizeProductSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL').trim()

function PublicLanding() {
  const [state, setState] = useState<LoadState<LandingData>>({ phase: 'loading' })
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [visibleCount, setVisibleCount] = useState(12)
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({})
  const [checkoutMode, setCheckoutMode] = useState<'quote' | 'purchase' | null>(null)
  const [completedRequest, setCompletedRequest] = useState<{ mode: 'quote' | 'purchase'; folio?: string } | null>(null)

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

  useEffect(() => {
    if (checkoutMode) document.getElementById('cotizar')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [checkoutMode])

  if (state.phase === 'loading') {
    return <main className="centered-state" role="status">Preparando la experiencia…</main>
  }
  if (state.phase === 'error') {
    return <main className="centered-state error-state">No pudimos cargar esta empresa. Inténtalo nuevamente.</main>
  }

  const tenant = state.data
  const categories = [...new Set(tenant.products.map((product) => product.category))].sort((a, b) => a.localeCompare(b, 'es-CL'))
  const normalizedSearch = normalizeProductSearch(search)
  const filteredProducts = tenant.products.filter((product) => (!category || product.category === category) && (!normalizedSearch || normalizeProductSearch(`${product.name} ${product.sku} ${product.description} ${product.category}`).includes(normalizedSearch)))
  const visibleProducts = filteredProducts.slice(0, visibleCount)
  const selectedItems = tenant.products.filter((product) => selectedQuantities[product.id]).map((product) => ({ product, quantity: selectedQuantities[product.id] }))
  const showcaseProducts = tenant.products.filter((product) => product.image_path).slice(0, 3)

  function addProduct(productId: string) {
    setSelectedQuantities((current) => ({ ...current, [productId]: current[productId] || 1 }))
    setCompletedRequest(null)
  }

  function removeProduct(productId: string) {
    setSelectedQuantities((current) => {
      const next = { ...current }
      delete next[productId]
      return next
    })
  }

  function startCheckout(mode: 'quote' | 'purchase') {
    if (selectedItems.length === 0) return
    setCheckoutMode(mode)
    setCompletedRequest(null)
  }
  const theme = {
    '--tenant-primary': tenant.theme.primary,
    '--tenant-secondary': tenant.theme.secondary,
    '--tenant-primary-on': colorOn(tenant.theme.primary),
    '--tenant-secondary-on': colorOn(tenant.theme.secondary),
    '--tenant-primary-text': colorLuminance(tenant.theme.primary) <= 0.18 ? tenant.theme.primary : '#17242b',
  } as CSSProperties

  return (
    <main className={`tenant-site ${selectedItems.length > 0 && !checkoutMode ? 'has-selection' : ''}`} style={theme}>
      <header className="site-header">
        <nav className="public-nav landing-nav page-width" aria-label="Navegación pública">
          <Brand name={tenant.name} logo={tenant.logo_path} />
          <div className="nav-links"><a href="#productos">Productos</a><a href="#contacto">Contacto</a></div>
          <a className="app-link" href="/app/login/">Acceso equipo <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <div className="landing-hero-wrap"><section className="landing-hero page-width" id="empresa">
        <div className="landing-hero-copy">
          <span className="eyebrow">{tenant.is_demo ? 'SITIO DEMOSTRATIVO' : tenant.name.toLocaleUpperCase('es-CL')}</span>
          <h1>{tenant.headline}</h1>
          {tenant.description && <p>{tenant.description}</p>}
          <div className="landing-hero-actions"><a className="landing-main-action" href="#productos">Ver productos <span aria-hidden="true">→</span></a><a className="landing-text-action" href={tenant.products.length ? '#mi-seleccion' : '#contacto'}>{tenant.products.length ? 'Mi selección' : 'Contáctanos'}</a></div>
          {tenant.products.length > 0 && <p className="landing-hero-count">{tenant.products.length} producto{tenant.products.length === 1 ? '' : 's'} para explorar</p>}
        </div>
        <div className={`landing-showcase ${showcaseProducts.length === 0 ? 'is-logo-only' : ''}`} aria-label={showcaseProducts.length ? 'Productos destacados del catálogo' : `Identidad de ${tenant.name}`}>
          {showcaseProducts.length > 0 ? <div className="landing-showcase-images">{showcaseProducts.map((product) => <div key={product.id} className="landing-showcase-image"><img src={product.image_path!} alt={product.name} /><span>{product.name}</span></div>)}</div> : <div className="landing-showcase-logo"><img src={tenant.logo_path} alt={`Logo de ${tenant.name}`} /></div>}
          <div className="landing-showcase-caption"><span>CATÁLOGO DE {tenant.name.toLocaleUpperCase('es-CL')}</span><strong>Elige lo que necesitas. Nosotros te ayudamos.</strong></div>
        </div>
      </section></div>

      <section className="landing-offers page-width" id="productos" aria-labelledby="offerings-title">
        <div className="landing-section-heading"><div><span className="eyebrow">CATÁLOGO</span><h2 id="offerings-title">Productos</h2></div><p>Busca, compara y agrega productos a tu selección para cotizar o comprar.</p></div>
        {tenant.products.length === 0 && <p className="landing-empty-offer">Estamos preparando nuestro catálogo. Escríbenos y te ayudaremos a encontrar lo que buscas.</p>}
        {tenant.products.length > 0 && <div className="landing-catalog"><div className="landing-catalog-heading"><span>{tenant.products.length} producto{tenant.products.length === 1 ? '' : 's'} disponible{tenant.products.length === 1 ? '' : 's'}</span></div><div className="landing-product-tools"><label>Buscar productos<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(12) }} placeholder="Nombre o código del producto" /></label><label>Categoría<select value={category} onChange={(event) => { setCategory(event.target.value); setVisibleCount(12) }}><option value="">Todas las categorías</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><div className="landing-shop-layout"><div><p className="landing-result-count" role="status">{filteredProducts.length} resultado{filteredProducts.length === 1 ? '' : 's'}</p>{filteredProducts.length === 0 ? <div className="landing-no-results"><p>No encontramos productos con esos filtros.</p><button type="button" onClick={() => { setSearch(''); setCategory(''); setVisibleCount(12) }}>Limpiar búsqueda</button></div> : <><div className="landing-product-grid">{visibleProducts.map((product) => <article key={product.id}><div className="landing-product-image">{product.image_path ? <img src={product.image_path} alt={product.name} loading="lazy" /> : <span>Imagen próximamente</span>}</div><div className="landing-product-detail"><span className="landing-product-category">{product.category}</span><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}<div className="landing-product-footer">{product.format && <span>{product.format}</span>}<strong>{product.price ? formatClp(product.price) : 'Por cotizar'}</strong></div><button type="button" className="landing-add-product" disabled={Boolean(selectedQuantities[product.id])} onClick={() => addProduct(product.id)}>{selectedQuantities[product.id] ? 'Agregado a mi selección ✓' : 'Agregar a mi selección'}</button></div></article>)}</div>{visibleCount < filteredProducts.length && <button type="button" className="landing-show-more" onClick={() => setVisibleCount((count) => count + 12)}>Mostrar más productos</button>}</>}</div><SelectionPanel items={selectedItems} onQuantityChange={(productId, quantity) => setSelectedQuantities((current) => ({ ...current, [productId]: quantity }))} onRemove={removeProduct} onQuote={() => startCheckout('quote')} onPurchase={() => startCheckout('purchase')} /></div></div>}
      </section>

      <section className="landing-contact" id="contacto"><div className="page-width"><div className="landing-contact-heading"><div><span className="eyebrow">HABLEMOS</span><h2>Conversemos sobre lo que necesitas.</h2></div><div className="landing-contact-links">{tenant.contact.email && <a href={`mailto:${tenant.contact.email}`}>{tenant.contact.email}</a>}{tenant.contact.phone && <a href={`tel:${tenant.contact.phone}`}>{tenant.contact.phone}</a>}</div></div>{completedRequest && <p className="quote-success landing-request-success" role="status">{completedRequest.mode === 'quote' ? 'Solicitud enviada. El equipo comercial se pondrá en contacto contigo.' : `Pedido ${completedRequest.folio ?? ''} registrado. La empresa se pondrá en contacto contigo para confirmar entrega y pago.`}</p>}{checkoutMode && selectedItems.length > 0 && <div id="cotizar"><div className="checkout-heading"><h2>{checkoutMode === 'quote' ? 'Solicitar cotización' : 'Finalizar compra'}</h2><button type="button" onClick={() => setCheckoutMode(null)}>Volver a mi selección</button></div><PublicQuoteForm key={checkoutMode} mode={checkoutMode} selectedItems={selectedItems} onSuccess={(folio) => { setSelectedQuantities({}); setCompletedRequest({ mode: checkoutMode, folio }); setCheckoutMode(null) }} /></div>}</div></section>

      {selectedItems.length > 0 && !checkoutMode && <a className="selection-mobile-bar" href="#mi-seleccion">Mi selección · {selectedItems.length} producto{selectedItems.length === 1 ? '' : 's'} <span aria-hidden="true">↑</span></a>}

      <footer className="public-footer page-width"><Brand name={tenant.name} logo={tenant.logo_path} /><span>{tenant.is_demo ? 'Contenido sintético de demostración' : 'Sitio impulsado por MAGAVI'}</span></footer>
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
    <section className="catalog-import" aria-label="Importar productos desde Excel">
      <p>Completa la hoja «Productos» en Excel, guarda el archivo como .xlsx y revísalo antes de aplicar los cambios. Si ya tienes un CSV, también puedes subirlo. Una nueva carga actualiza productos con el mismo SKU sin duplicarlos. Las fotos se agregan después en Marketing.</p>
      <form className="import-form" onSubmit={previewFile}>
        <label>Archivo Excel (.xlsx) o CSV<input name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv" required /></label>
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

function BrandSettingsPanel({ tenant, csrfToken, onSaved }: { tenant: TenantContext; csrfToken: string; onSaved: (tenant: TenantContext) => void }) {
  const [name, setName] = useState(tenant.name)
  const [primary, setPrimary] = useState(tenant.primary_color)
  const [secondary, setSecondary] = useState(tenant.secondary_color)
  const [email, setEmail] = useState(tenant.contact_email)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const colorPattern = /^#[0-9a-fA-F]{6}$/

  async function saveBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!name.trim()) { setError('Escribe el nombre de la empresa.'); return }
    if (!colorPattern.test(primary) || !colorPattern.test(secondary)) { setError('Usa colores hexadecimales de seis dígitos.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/tenant/context/', { method: 'PATCH', credentials: 'same-origin', headers: { ...jsonHeaders, 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken }, body: JSON.stringify({ name: name.trim(), primary_color: primary, secondary_color: secondary, contact_email: email }) })
      if (!response.ok) throw new Error('No fue posible guardar la identidad de la empresa.')
      onSaved(await response.json() as TenantContext)
      setMessage('Identidad de la empresa guardada. Ya puedes verla en la landing.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible guardar los cambios.') }
    finally { setBusy(false) }
  }

  async function uploadLogo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (busy) return
    if (!logoFile || logoFile.size > 2_000_000) { setError('Selecciona una imagen PNG, JPEG o WebP de hasta 2 MB.'); return }
    setBusy(true); setError(''); setMessage('')
    const data = new FormData()
    data.append('logo', logoFile)
    try {
      const response = await fetch('/api/tenant/logo/', { method: 'POST', credentials: 'same-origin', headers: { ...jsonHeaders, 'X-CSRFToken': csrfToken }, body: data })
      if (!response.ok) throw new Error('No fue posible subir el logo. Revisa el formato y tamaño de la imagen.')
      onSaved(await response.json() as TenantContext)
      setLogoFile(null)
      form.reset()
      setMessage('Logo actualizado en la landing y en las cotizaciones.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible subir el logo.') }
    finally { setBusy(false) }
  }

  async function removeLogo() {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/tenant/logo/', { method: 'DELETE', credentials: 'same-origin', headers: { ...jsonHeaders, 'X-CSRFToken': csrfToken } })
      if (!response.ok) throw new Error('No fue posible restaurar el logo predeterminado.')
      onSaved(await response.json() as TenantContext)
      setLogoFile(null)
      setMessage('Se restauró el logo predeterminado.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible restaurar el logo.') }
    finally { setBusy(false) }
  }

  return (
    <section className="brand-settings" aria-labelledby="brand-settings-title">
      <header>
        <span className="eyebrow">IDENTIDAD DE LA EMPRESA</span>
        <h2 id="brand-settings-title">Tu marca en la landing</h2>
        <p>Define el nombre, los colores, el correo de contacto y el logo que verán tus clientes.</p>
      </header>
      <div className="brand-settings-grid">
        <form onSubmit={saveBrand} className="brand-settings-form">
          <h3>Nombre, colores y contacto</h3>
          <label>Nombre de la empresa<input type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required /></label>
          <label>Color principal
            <div className="brand-color-field">
              <input type="color" aria-label="Elegir color principal" value={colorPattern.test(primary) ? primary : '#25364A'} onChange={(event) => setPrimary(event.target.value.toUpperCase())} />
              <input type="text" aria-label="Código del color principal" value={primary} onChange={(event) => setPrimary(event.target.value)} maxLength={7} pattern="#[0-9a-fA-F]{6}" required />
            </div>
          </label>
          <label>Color secundario
            <div className="brand-color-field">
              <input type="color" aria-label="Elegir color secundario" value={colorPattern.test(secondary) ? secondary : '#E88C62'} onChange={(event) => setSecondary(event.target.value.toUpperCase())} />
              <input type="text" aria-label="Código del color secundario" value={secondary} onChange={(event) => setSecondary(event.target.value)} maxLength={7} pattern="#[0-9a-fA-F]{6}" required />
            </div>
          </label>
          <label>Correo de contacto<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ventas@tuempresa.cl" /></label>
          <button type="submit" disabled={busy || !csrfToken}>Guardar identidad</button>
        </form>
        <div className="brand-logo-panel">
          <h3>Logo de la empresa</h3>
          <div className="brand-logo-preview"><img src={tenant.logo_path} alt={`Logo actual de ${tenant.name}`} /></div>
          <form onSubmit={uploadLogo}>
            <label>Seleccionar imagen<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)} /></label>
            <small>PNG, JPEG o WebP. Hasta 2 MB. Se ajusta automáticamente para la web.</small>
            <button type="submit" disabled={busy || !csrfToken || !logoFile}>Subir logo</button>
          </form>
          {tenant.logo_path.startsWith('/api/public/logo/') && <button className="brand-remove-logo" type="button" onClick={removeLogo} disabled={busy}>Restaurar logo predeterminado</button>}
        </div>
      </div>
      {error && <p className="quote-error" role="alert">{error}</p>}
      {message && <p className="quote-success" role="status">{message}</p>}
      <a href="/" target="_blank" rel="noopener noreferrer" className="brand-landing-link">Ver landing pública ↗</a>
    </section>
  )
}

function MarketingProductCard({ product, canEdit, csrfToken, onUpdated, onTogglePublished }: {
  product: Product
  canEdit: boolean
  csrfToken: string
  onUpdated: (product: Product) => void
  onTogglePublished: (product: Product) => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const endpoint = `/api/catalog/products/${product.id}/image/`

  async function updateImage(method: 'POST' | 'DELETE') {
    if (busy) return
    if (method === 'POST' && (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2_000_000)) {
      setError('Selecciona una imagen PNG, JPEG o WebP de hasta 2 MB.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const body = new FormData()
      if (method === 'POST' && file) body.append('image', file)
      const response = await fetch(endpoint, { method, credentials: 'same-origin', headers: { ...jsonHeaders, 'X-CSRFToken': csrfToken }, ...(method === 'POST' ? { body } : {}) })
      if (!response.ok) throw new Error('No fue posible guardar la imagen. Revisa el formato y tamaño e inténtalo de nuevo.')
      onUpdated(await response.json() as Product)
      setFile(null)
      setMessage(method === 'POST' ? 'Imagen actualizada.' : 'Imagen eliminada.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar la imagen.')
    } finally { setBusy(false) }
  }

  return <article className="marketing-product-card">
    <div className="marketing-product-image">{product.image_path ? <img src={product.image_path} alt={`Imagen de ${product.name}`} /> : <span>Sin imagen</span>}</div>
    <div className="marketing-product-body"><span className="landing-product-category">{product.category_name}</span><h3>{product.name}</h3><p>{product.sku} · {product.price ? formatClp(product.price) : 'Por cotizar'}</p>
      <span className={`marketing-publication ${product.is_published && product.is_available && product.category_is_active ? 'is-published' : ''}`}>{!product.is_published ? 'Oculto en la landing' : product.is_available && product.category_is_active ? 'Publicado en la landing' : 'Publicado, pero no disponible'}</span>
      {canEdit && <div className="marketing-product-actions"><label>Imagen del producto<input key={product.image_path ?? 'empty'} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setMessage(''); setError('') }} /><small>PNG, JPEG o WebP · hasta 2 MB</small></label><div><button type="button" onClick={() => updateImage('POST')} disabled={busy || !file || !csrfToken}>{busy ? 'Guardando…' : 'Subir imagen'}</button>{product.image_path && <button type="button" className="marketing-secondary-action" onClick={() => updateImage('DELETE')} disabled={busy || !csrfToken}>Quitar imagen</button>}</div><button type="button" className="marketing-secondary-action" onClick={() => onTogglePublished(product)} disabled={busy || !csrfToken}>{product.is_published ? 'Retirar de la landing' : 'Publicar en la landing'}</button></div>}
      {error && <p className="quote-error" role="alert">{error}</p>}{message && <p className="quote-success" role="status">{message}</p>}
    </div>
  </article>
}

function DiscoveryEvaluationPanel({ rows, total, onLoadMore }: { rows: DiscoveryEvaluation[]; total: number; onLoadMore: () => void }) {
  const labels: Record<DiscoveryEvaluation['decision'], string> = {
    CREATED: 'Prospecto creado', EXISTING: 'Ya existía', REJECTED: 'No seleccionado', NOT_EVALUATED: 'Sin evaluación de IA',
  }
  return <details className="discovery-evaluations">
    <summary>Perfiles evaluados <span>{total}</span></summary>
    {total === 0 ? <p>El historial comienza con la próxima búsqueda completada. Las decisiones de búsquedas anteriores no se guardaron.</p> : <>
      <p>Revisa cada decisión de la búsqueda, incluidas las cuentas no seleccionadas. Los motivos provienen de la evaluación automática y pueden requerir verificación.</p>
      <div className="discovery-evaluation-grid">{rows.map((row) => <article key={row.id}>
        <header><div><strong>{row.name}</strong><small>@{row.username} · {row.search_term} · {new Date(row.evaluated_at).toLocaleDateString('es-CL')}</small></div><span className={`discovery-decision decision-${row.decision.toLowerCase()}`}>{labels[row.decision]}</span></header>
        <p>{row.reason}</p><footer><span>{row.score === null ? 'Sin puntaje' : `Afinidad IA ${row.score}/100`}</span><a href={`https://www.instagram.com/${row.username}/`} target="_blank" rel="noopener noreferrer">Ver Instagram ↗</a></footer>
      </article>)}</div>
      {rows.length < total && <button type="button" onClick={onLoadMore}>Ver más perfiles</button>}
    </>}
  </details>
}

function PrivateApp() {
  const [state, setState] = useState<LoadState<TenantContext>>({ phase: 'loading' })
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [inquiries, setInquiries] = useState<QuoteInquiry[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [discovery, setDiscovery] = useState<DiscoveryStatus | null>(null)
  const [discoveryBusy, setDiscoveryBusy] = useState(false)
  const [discoveryError, setDiscoveryError] = useState('')
  const [discoveryEvaluations, setDiscoveryEvaluations] = useState<DiscoveryEvaluation[]>([])
  const [discoveryEvaluationTotal, setDiscoveryEvaluationTotal] = useState(0)
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [territories, setTerritories] = useState<Territory[]>([])
  const [chileanRegions, setChileanRegions] = useState<ChileanRegionOption[]>([])
  const [territoryRegion, setTerritoryRegion] = useState('')
  const [territoryName, setTerritoryName] = useState('')
  const [territoryLocalities, setTerritoryLocalities] = useState('')
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [industrySegments, setIndustrySegments] = useState<IndustrySegmentOption[]>([])
  const [activeSection, setActiveSection] = useState<'summary' | 'branding' | 'marketing' | 'catalog' | 'prospects' | 'territories' | 'opportunities' | 'inquiries' | 'orders' | 'quoteTracking'>('summary')
  const [catalogSection, setCatalogSection] = useState<'products' | 'categories' | 'import' | 'matching'>('products')
  const [opportunityStatus, setOpportunityStatus] = useState<'ALL' | Opportunity['status']>('ALL')
  const [generatingOpportunities, setGeneratingOpportunities] = useState(false)
  const [prospectSearch, setProspectSearch] = useState('')
  const [openInquiryId, setOpenInquiryId] = useState<string | null>(null)
  const [trackingFilter, setTrackingFilter] = useState<'ALL' | 'ATTENTION' | FormalQuote['tracking_status']>('ALL')
  const [trackingSearch, setTrackingSearch] = useState('')
  const [csrfToken, setCsrfToken] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [orderError, setOrderError] = useState('')
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/tenant/context/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Authentication required')
        const tenant = (await response.json()) as TenantContext
        const [categoryResponse, productResponse, sessionResponse, inquiryResponse, orderResponse, prospectResponse, territoryResponse, opportunityResponse, industryResponse, regionResponse] = await Promise.all([
          fetch('/api/catalog/categories/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/catalog/products/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/auth/session/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/inquiries/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/inquiries/orders/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/prospects/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/prospects/territories/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/prospects/opportunities/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/catalog/industry-segments/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/prospects/territories/regions/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
        ])
        if (!categoryResponse.ok || !productResponse.ok || !sessionResponse.ok || !inquiryResponse.ok || !orderResponse.ok || !prospectResponse.ok || !territoryResponse.ok || !opportunityResponse.ok || !industryResponse.ok || !regionResponse.ok) throw new Error('Private data unavailable')
        const session = (await sessionResponse.json()) as AuthSession
        setCategories((await categoryResponse.json()) as Category[])
        setProducts((await productResponse.json()) as Product[])
        setCsrfToken(session.csrf_token ?? '')
        setInquiries((await inquiryResponse.json()) as QuoteInquiry[])
        setOrders((await orderResponse.json()) as PurchaseOrder[])
        setProspects((await prospectResponse.json()) as Prospect[])
        setTerritories((await territoryResponse.json()) as Territory[])
        setOpportunities((await opportunityResponse.json()) as Opportunity[])
        setIndustrySegments((await industryResponse.json()) as IndustrySegmentOption[])
        setChileanRegions((await regionResponse.json()) as ChileanRegionOption[])
        setState({ phase: 'ready', data: tenant })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ phase: 'error' })
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (state.phase !== 'ready') return
    const controller = new AbortController()
    let polling = false
    const refresh = () => {
      fetch('/api/prospects/discovery/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) return
          const current = await response.json() as DiscoveryStatus
          setDiscovery(current)
          if (activeSection !== 'prospects' || !csrfToken || polling ||
              !['OWNER', 'ADMIN'].includes(state.data.role) || current.status !== 'PENDING' ||
              !current.mindcase_job_id || !current.mindcase_next_poll_at ||
              Date.parse(current.mindcase_next_poll_at) > Date.now()) return
          polling = true
          try {
            await fetch('/api/prospects/discovery/poll/', {
              method: 'POST', credentials: 'same-origin', signal: controller.signal,
              headers: { ...jsonHeaders, 'X-CSRFToken': csrfToken },
            })
            const latest = await fetch('/api/prospects/discovery/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal })
            if (latest.ok) setDiscovery(await latest.json() as DiscoveryStatus)
          } catch { /* The next refresh can retry a transient network failure. */ }
          finally { polling = false }
        })
        .catch(() => {})
      if (activeSection === 'prospects') {
        fetch('/api/prospects/discovery/evaluations/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal })
          .then(async (response) => { if (response.ok) { const page = await response.json() as DiscoveryEvaluationPage; if (Array.isArray(page.results) && typeof page.total === 'number') { setDiscoveryEvaluations(page.results); setDiscoveryEvaluationTotal(page.total) } } })
          .catch(() => {})
      }
    }
    refresh()
    const interval = activeSection === 'prospects' ? window.setInterval(refresh, 60_000) : undefined
    return () => { controller.abort(); if (interval !== undefined) window.clearInterval(interval) }
  }, [state.phase, activeSection, csrfToken])

  async function loadMoreDiscoveryEvaluations() {
    const response = await fetch(`/api/prospects/discovery/evaluations/?offset=${discoveryEvaluations.length}`, { headers: jsonHeaders, credentials: 'same-origin' })
    if (!response.ok) return
    const page = await response.json() as DiscoveryEvaluationPage
    setDiscoveryEvaluations((current) => [...current, ...page.results.filter((row) => !current.some((item) => item.id === row.id))])
    setDiscoveryEvaluationTotal(page.total)
  }

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
  const insights = buildCommercialInsights(inquiries, orders, todayChile)
  const visibleQuotes = issuedInquiries.filter((inquiry) => {
    const quote = inquiry.quote
    if (!quote) return false
    const matchesFilter = trackingFilter === 'ALL' || (trackingFilter === 'ATTENTION' ? needsQuoteAttention(quote, todayChile) : quote.tracking_status === trackingFilter)
    const matchesSearch = `${inquiry.full_name} ${inquiry.company_name} ${quote.folio}`.toLocaleLowerCase('es-CL').includes(trackingSearch.toLocaleLowerCase('es-CL'))
    return matchesFilter && matchesSearch
  })

  function openPriority(priority: CommercialPriority) {
    if (priority.section === 'inquiries') setOpenInquiryId(priority.target)
    if (priority.section === 'quoteTracking') {
      setTrackingFilter('ALL')
      setTrackingSearch(priority.target)
    }
    setActiveSection(priority.section)
    if (priority.section === 'orders') {
      window.setTimeout(() => document.getElementById(`order-${priority.target}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }), 0)
    }
  }

  async function updateDiscovery(enabled: boolean) {
    if (!csrfToken || discoveryBusy) return
    setDiscoveryBusy(true)
    setDiscoveryError('')
    try {
      const response = await fetch('/api/prospects/discovery/', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { ...jsonHeaders, 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify({ enabled }),
      })
      if (!response.ok) {
        const payload = await response.json() as { detail?: string }
        throw new Error(payload.detail || 'No fue posible cambiar la búsqueda automática.')
      }
      setDiscovery(await response.json() as DiscoveryStatus)
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : 'No fue posible cambiar la búsqueda automática.')
    } finally {
      setDiscoveryBusy(false)
    }
  }

  async function testDiscovery() {
    if (!csrfToken || discoveryBusy) return
    setDiscoveryBusy(true)
    setDiscoveryError('')
    try {
      const response = await fetch('/api/prospects/discovery/test/', {
        method: 'POST', credentials: 'same-origin',
        headers: { ...jsonHeaders, 'X-CSRFToken': csrfToken },
      })
      if (!response.ok) {
        const payload = await response.json() as { detail?: string }
        throw new Error(payload.detail || 'No fue posible iniciar la prueba.')
      }
      const statusResponse = await fetch('/api/prospects/discovery/', { headers: jsonHeaders, credentials: 'same-origin' })
      if (statusResponse.ok) setDiscovery(await statusResponse.json() as DiscoveryStatus)
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : 'No fue posible iniciar la prueba.')
    } finally {
      setDiscoveryBusy(false)
    }
  }

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
      name: territoryName.trim(), description: form.get('description'), region: territoryRegion,
      localities: territoryLocalities.split(',').map((item) => item.trim()).filter(Boolean),
      prospect_goal: Number(form.get('prospect_goal') || 0), is_active: true,
    })
    if (response) {
      setTerritories((current) => [...current, response as Territory].sort((a, b) => a.name.localeCompare(b.name)))
      const [prospectResult, opportunityResult] = await Promise.allSettled([
        fetch('/api/prospects/', { headers: jsonHeaders, credentials: 'same-origin' }),
        fetch('/api/prospects/opportunities/', { headers: jsonHeaders, credentials: 'same-origin' }),
      ])
      if (prospectResult.status === 'fulfilled' && prospectResult.value.ok) setProspects(await prospectResult.value.json() as Prospect[])
      if (opportunityResult.status === 'fulfilled' && opportunityResult.value.ok) setOpportunities(await opportunityResult.value.json() as Opportunity[])
      setTerritoryName('')
      setTerritoryRegion('')
      setTerritoryLocalities('')
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

  async function updateOrderStatus(order: PurchaseOrder, nextStatus: PurchaseOrder['status']) {
    if (!csrfToken || busyOrderId) return
    setBusyOrderId(order.id)
    setOrderError('')
    try {
      const response = await fetch(`/api/inquiries/orders/${order.id}/`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { ...jsonHeaders, 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!response.ok) throw new Error('Order update failed')
      const updated = await response.json() as PurchaseOrder
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch {
      setOrderError('No fue posible actualizar el pedido. Inténtalo nuevamente.')
    } finally {
      setBusyOrderId(null)
    }
  }

  async function updateOrderSource(order: PurchaseOrder, sourceRequest: string | null) {
    if (!csrfToken || busyOrderId) return
    setBusyOrderId(order.id)
    setOrderError('')
    try {
      const response = await fetch(`/api/inquiries/orders/${order.id}/`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { ...jsonHeaders, 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify({ source_request: sourceRequest }),
      })
      if (!response.ok) throw new Error('Order attribution failed')
      const updated = await response.json() as PurchaseOrder
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch {
      setOrderError('No fue posible vincular la solicitud. Revisa los datos e inténtalo nuevamente.')
    } finally {
      setBusyOrderId(null)
    }
  }

  return (
    <main className="private-shell admin-shell">
      <aside className="admin-sidebar">
        <Brand name={state.data.name} logo="/static/magavi-mark.svg" />
        <nav aria-label="Administración de la empresa">
          <button className={activeSection === 'summary' ? 'is-active' : ''} onClick={() => setActiveSection('summary')}>Resumen</button>
          {state.data.role === 'OWNER' && <button className={activeSection === 'branding' ? 'is-active' : ''} onClick={() => setActiveSection('branding')}>Mi marca</button>}
          <button className={activeSection === 'marketing' ? 'is-active' : ''} onClick={() => setActiveSection('marketing')}>Marketing</button>
          <button className={activeSection === 'catalog' ? 'is-active' : ''} onClick={() => setActiveSection('catalog')}>Catálogo <span>{products.length}</span></button>
          <button className={activeSection === 'prospects' ? 'is-active' : ''} onClick={() => setActiveSection('prospects')}>Prospectos <span>{prospects.length}</span></button>
          <button className={activeSection === 'territories' ? 'is-active' : ''} onClick={() => setActiveSection('territories')}>Territorios <span>{territories.length}</span></button>
          <button className={activeSection === 'opportunities' ? 'is-active' : ''} onClick={() => setActiveSection('opportunities')}>Oportunidades <span>{opportunities.filter((item) => item.status === 'PENDING').length}</span></button>
          <button className={activeSection === 'inquiries' ? 'is-active' : ''} onClick={() => setActiveSection('inquiries')}>Solicitudes <span>{inquiries.length}</span></button>
          <button className={activeSection === 'orders' ? 'is-active' : ''} onClick={() => setActiveSection('orders')}>Pedidos <span>{orders.filter((order) => order.status === 'NEW').length}</span></button>
          <button className={activeSection === 'quoteTracking' ? 'is-active' : ''} onClick={() => setActiveSection('quoteTracking')}>Seguimiento <span>{attentionCount}</span></button>
        </nav>
        <div className="sidebar-footer"><small>{state.data.role}</small><LogoutButton /></div>
      </aside>
      <div className="admin-content">
        <section className="private-heading">
          <span className="eyebrow">ÁREA PRIVADA</span>
          <h1>{activeSection === 'summary' ? `Hola, equipo de ${state.data.name}` : ({ branding: 'Identidad de la empresa', marketing: 'Marketing y vitrina pública', catalog: 'Catálogo comercial', prospects: 'Prospectos comerciales', territories: 'Territorios', opportunities: 'Oportunidades priorizadas', inquiries: 'Solicitudes comerciales', orders: 'Pedidos de clientes', quoteTracking: 'Seguimiento de cotizaciones' } as const)[activeSection]}</h1>
          <p>{activeSection === 'summary' ? 'Revisa qué necesita atención hoy y cómo avanza tu gestión comercial.' : 'Selecciona una opción del menú para administrar esta empresa.'}</p>
        </section>
        {catalogError && <p className="catalog-error" role="alert">{catalogError}</p>}

        {activeSection === 'summary' && <section className="commercial-dashboard" aria-label="Tablero de prioridades comerciales">
          <div className="dashboard-intro"><div><span className="eyebrow">INTELIGENCIA COMERCIAL</span><h2>Prioridades para hoy</h2><p>Acciones calculadas con solicitudes, cotizaciones y pedidos registrados.</p></div><strong>{insights.priorities.length} pendiente{insights.priorities.length === 1 ? '' : 's'}</strong></div>
          {insights.priorities.length === 0 ? <p className="dashboard-empty">No hay gestiones urgentes por ahora. Revisa las solicitudes y el seguimiento cuando lleguen nuevos contactos.</p> : <div className="dashboard-priorities">{insights.priorities.slice(0, 8).map((priority) => <button key={priority.key} type="button" onClick={() => openPriority(priority)}><span className="dashboard-priority-marker" aria-hidden="true" /><span><strong>{priority.title}</strong><small>{priority.detail}</small></span><span aria-hidden="true">↗</span></button>)}</div>}
          {insights.priorities.length > 8 && <p className="dashboard-more">Se muestran las primeras 8 de {insights.priorities.length} gestiones pendientes.</p>}
          <div className="dashboard-metrics" aria-label="Indicadores comerciales"><div><span>Cotizaciones emitidas</span><strong>{insights.issued}</strong></div><div><span>Aceptadas / emitidas</span><strong>{insights.acceptanceRate === null ? '—' : `${insights.acceptanceRate}%`}</strong><small>{insights.accepted} aceptadas de {insights.issued} emitidas</small></div><div><span>Pedidos completados</span><strong>{insights.completedOrders}</strong></div><div><span>Solicitudes con pedido completado</span><strong>{insights.requestConversionRate === null ? '—' : `${insights.requestConversionRate}%`}</strong><small>{insights.linkedCompletedRequests} de {inquiries.length} solicitudes, solo pedidos vinculados y completados</small></div></div>
          <div className="dashboard-insights"><section><h3>Productos más solicitados</h3><p>Unidades solicitadas en cotizaciones, sin incluir pedidos directos.</p>{insights.topProducts.length ? <ol>{insights.topProducts.map((product) => <li key={product.sku}><span>{product.name}</span><strong>{product.quantity}</strong></li>)}</ol> : <p>Aún no hay productos solicitados.</p>}</section><section><h3>Contactos recurrentes</h3><p>Personas con dos o más solicitudes y sin pedido registrado con el mismo correo o teléfono.</p>{insights.repeatedContacts.length ? <ul>{insights.repeatedContacts.slice(0, 5).map((contact) => <li key={contact.key}><span>{contact.name}</span><strong>{contact.count} solicitudes</strong></li>)}</ul> : <p>Aún no hay contactos recurrentes en esta situación.</p>}</section></div>
          <section className="dashboard-sales"><h3>Pedidos completados por producto</h3><p>Importes en pesos chilenos según el precio guardado al recibir cada pedido. El pago aún se coordina fuera del sistema.</p>{insights.salesByProduct.length ? <div className="dashboard-sales-list">{insights.salesByProduct.map((product) => <div key={product.sku}><span>{product.name}<small>{product.quantity} unidades</small></span><strong>{formatClp(String(product.total))}</strong></div>)}</div> : <p>Aún no hay pedidos completados.</p>}</section>
          <h2 className="dashboard-shortcuts-title">Explorar la empresa</h2>
          <div className="summary-grid" aria-label="Secciones de la empresa">
          {state.data.role === 'OWNER' && <button onClick={() => setActiveSection('branding')}><span>Mi marca</span><strong>↗</strong><small>nombre, colores, correo y logo</small></button>}
          <button onClick={() => setActiveSection('marketing')}><span>Marketing</span><strong>{products.filter((product) => product.is_published).length}</strong><small>productos publicados e imágenes</small></button>
          <button onClick={() => setActiveSection('catalog')}><span>Catálogo</span><strong>{products.length}</strong><small>productos registrados</small></button>
          <button onClick={() => setActiveSection('prospects')}><span>Prospectos</span><strong>{prospects.length}</strong><small>organizaciones potenciales</small></button>
          <button onClick={() => setActiveSection('territories')}><span>Territorios</span><strong>{territories.length}</strong><small>zonas comerciales</small></button>
          <button onClick={() => setActiveSection('opportunities')}><span>Oportunidades</span><strong>{opportunities.filter((item) => item.status === 'PENDING').length}</strong><small>recomendaciones por revisar</small></button>
          <button onClick={() => setActiveSection('inquiries')}><span>Solicitudes</span><strong>{inquiries.length}</strong><small>contactos recibidos</small></button>
          <button onClick={() => setActiveSection('orders')}><span>Pedidos</span><strong>{orders.filter((order) => order.status === 'NEW').length}</strong><small>nuevos por gestionar</small></button>
          <button onClick={() => setActiveSection('quoteTracking')}><span>Seguimiento</span><strong>{attentionCount}</strong><small>cotizaciones que requieren atención</small></button>
          </div>
        </section>}

        {activeSection === 'branding' && state.data.role === 'OWNER' && <BrandSettingsPanel tenant={state.data} csrfToken={csrfToken} onSaved={(tenant) => setState({ phase: 'ready', data: tenant })} />}

        {activeSection === 'marketing' && <section className="marketing-workspace"><div className="marketing-heading"><div><span className="eyebrow">VITRINA PÚBLICA</span><h2>Productos en tu landing</h2><p>Asigna una imagen a cada producto y decide cuáles aparecen para tus clientes. Los productos se crean en Catálogo.</p></div><a href="/" target="_blank" rel="noopener noreferrer">Ver landing pública ↗</a></div>{products.length === 0 ? <div className="marketing-empty"><p>Todavía no hay productos para mostrar.</p><button type="button" onClick={() => setActiveSection('catalog')}>Crear productos en Catálogo</button></div> : <div className="marketing-product-grid">{products.map((product) => <MarketingProductCard key={product.id} product={product} canEdit={canEdit} csrfToken={csrfToken} onUpdated={(updated) => setProducts((current) => current.map((item) => item.id === updated.id ? updated : item))} onTogglePublished={togglePublished} />)}</div>}</section>}

        {activeSection === 'catalog' && <section className="catalog-workspace">
          <div className="catalog-workspace-intro">
            <div><span className="eyebrow">CENTRO DE CATÁLOGO</span><h2>Gestiona la oferta comercial por etapas</h2><p>Separamos productos, categorías, importación y reglas de oportunidad para trabajar con menos ruido.</p></div>
            <div className="catalog-health" aria-label="Estado del catálogo"><strong>{products.length}</strong><span>productos</span><strong>{categories.length}</strong><span>categorías</span></div>
          </div>
          <nav className="catalog-subnav" aria-label="Secciones del catálogo">
            <button className={catalogSection === 'products' ? 'is-active' : ''} onClick={() => setCatalogSection('products')}><span>01</span><strong>Productos</strong><small>Oferta, precios y disponibilidad</small></button>
            <button className={catalogSection === 'categories' ? 'is-active' : ''} onClick={() => setCatalogSection('categories')}><span>02</span><strong>Categorías</strong><small>Organización de la oferta</small></button>
            <button className={catalogSection === 'import' ? 'is-active' : ''} onClick={() => setCatalogSection('import')}><span>03</span><strong>Importación</strong><small>Carga masiva revisable</small></button>
            <button className={catalogSection === 'matching' ? 'is-active' : ''} onClick={() => setCatalogSection('matching')}><span>04</span><strong>Reglas comerciales</strong><small>Segmentos y palabras clave</small></button>
          </nav>

          {catalogSection === 'products' && <div className="catalog-module">
            <header className="module-heading"><div><span className="eyebrow">PRODUCTOS</span><h2>Oferta comercial</h2><p>Crea productos y define sus precios. Las imágenes y la publicación se gestionan en Marketing.</p></div></header>
            {canEdit && <form className="catalog-form product-create-form" onSubmit={createProduct}><div><span className="eyebrow">NUEVO PRODUCTO</span><h3>Datos esenciales</h3></div><label>Categoría<select name="category" required defaultValue=""><option value="" disabled>Selecciona una categoría</option>{categories.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Nombre<input name="name" required maxLength={160} /></label><label>SKU<input name="sku" required maxLength={80} /></label><label>Formato<input name="format" maxLength={120} /></label><label>Precio (CLP)<input name="price" type="number" inputMode="numeric" min="0" step="1" /></label><label className="wide-field">Descripción<textarea name="description" maxLength={1000} /></label><button type="submit" disabled={!csrfToken || categories.length === 0}>Crear producto</button></form>}
            <section className="catalog-list"><div className="catalog-list-heading"><div><span className="eyebrow">INVENTARIO</span><h2>Productos de {state.data.name}</h2></div><strong>{products.length} producto{products.length === 1 ? '' : 's'}</strong></div>{products.length === 0 ? <p className="empty-catalog">Todavía no hay productos.</p> : <div className="catalog-table-wrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Estado</th><th>Publicación</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku}</small></td><td>{product.category_name}</td><td>{product.price ? formatClp(product.price) : 'Por cotizar'}</td><td>{product.is_available ? 'Disponible' : 'No disponible'}</td><td>{product.is_published ? 'Publicado' : 'Borrador'}</td></tr>)}</tbody></table></div>}</section>
          </div>}

          {catalogSection === 'categories' && <div className="catalog-module category-module">
            <header className="module-heading"><div><span className="eyebrow">CATEGORÍAS</span><h2>Taxonomía del catálogo</h2><p>Agrupa la oferta para que clientes, importaciones y reglas comerciales usen una estructura consistente.</p></div></header>
            {canEdit && <form className="catalog-form category-create-form" onSubmit={createCategory}><div><span className="eyebrow">NUEVA CATEGORÍA</span><h3>Crear agrupación</h3></div><label>Nombre<input name="name" required maxLength={120} /></label><label>Descripción<textarea name="description" maxLength={500} /></label><button type="submit" disabled={!csrfToken}>Crear categoría</button></form>}
            <div className="category-grid">{categories.length === 0 ? <p className="empty-catalog">Crea una categoría antes de registrar productos.</p> : categories.map((category) => <article key={category.id}><div><strong>{category.name}</strong><span className={category.is_active ? 'status-active' : ''}>{category.is_active ? 'Activa' : 'Inactiva'}</span></div><p>{category.description || 'Sin descripción.'}</p><small>{products.filter((product) => product.category === category.id).length} productos asociados</small></article>)}</div>
          </div>}

          {catalogSection === 'import' && <div className="catalog-module import-module">
            <header className="module-heading import-module-heading"><div><span className="eyebrow">IMPORTACIÓN</span><h2>Carga masiva de productos</h2><p>Descarga la plantilla Excel, complétala y confirma la importación después de revisar los cambios.</p></div><a className="template-link" href="/api/catalog/import/template/">Descargar plantilla Excel ↓</a></header>
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
          <div className="discovery-panel"><div><span className="eyebrow">BÚSQUEDA AUTOMÁTICA</span><h3>Prospectos desde Instagram</h3><p>La IA toma el catálogo y los territorios para buscar negocios, evaluar señales públicas y agregar prospectos pertinentes sin cargar perfiles a mano.</p>{discoveryError && <p className="quote-error" role="alert">{discoveryError}</p>}{canEdit && discovery?.configured && <div className="discovery-actions"><button type="button" disabled={discoveryBusy || !csrfToken} onClick={() => updateDiscovery(!discovery.enabled)}>{discoveryBusy ? 'Procesando…' : discovery.enabled ? 'Pausar búsqueda automática' : 'Activar búsqueda automática'}</button>{discovery.enabled && <button type="button" className="discovery-test-button" disabled={discoveryBusy || !csrfToken || discovery.status === 'RUNNING' || discovery.status === 'PENDING'} onClick={testDiscovery}>Buscar ahora</button>}</div>}{discovery?.enabled && <p className="discovery-hint">«Buscar ahora» inicia una prueba pagada sin esperar las 20 horas. Solo se permite una búsqueda a la vez y deben pasar cinco minutos entre pruebas.</p>}</div><div className="discovery-panel-status">{!discovery ? <strong>Consultando estado…</strong> : !discovery.configured ? <><strong>Pendiente de conexión</strong><span>Faltan credenciales del extractor de Instagram, IA o tarea programada en Render.</span></> : <><strong>{discovery.enabled ? 'Automática activada' : 'Automática pausada'}</strong><span>{({ NOT_STARTED: 'Aún sin búsquedas', RUNNING: 'Buscando perfiles…', PENDING: 'Esperando resultados de Mindcase', COMPLETED: 'Última búsqueda completada', FAILED: 'Última búsqueda fallida', SKIPPED: 'Faltan productos o territorios para buscar' } as const)[discovery.status]}</span>{discovery.mindcase_job_id && <span>Run ID: {discovery.mindcase_job_id}</span>}{discovery.finished_at && <span>{new Date(discovery.finished_at).toLocaleString('es-CL')} · {discovery.prospects_created} prospectos nuevos de {discovery.profiles_found} perfiles</span>}{discovery.error && <span>{discovery.error}</span>}</>}</div></div>
          <DiscoveryEvaluationPanel rows={discoveryEvaluations} total={discoveryEvaluationTotal} onLoadMore={loadMoreDiscoveryEvaluations} />
          {canEdit && <form className="prospect-form" onSubmit={createProspect}><label>Nombre comercial<input name="name" required /></label><label>Territorio<select name="territory" defaultValue=""><option value="">Sin asignar</option>{territories.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Industria<select name="industry" defaultValue=""><option value="">Sin clasificar</option>{industrySegments.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label><label>Dirección<input name="address" /></label><label>Ciudad o comuna<input name="city" /></label><label>Región<input name="region" /></label><label>Sitio web<input name="website" type="url" /></label><label>Correo<input name="email" type="email" /></label><label>Teléfono<input name="phone" /></label><label>Fuente<input name="source" required /></label><label>Verificado el<input name="verified_at" type="date" /></label><label className="wide-field">Observaciones<textarea name="notes" /></label><button type="submit" disabled={!csrfToken}>Crear prospecto</button></form>}
          <label className="prospect-search">Buscar prospectos<input value={prospectSearch} onChange={(event) => setProspectSearch(event.target.value)} placeholder="Nombre, rubro o ubicación" /></label>
          {prospects.length === 0 ? <p className="empty-catalog">Todavía no hay prospectos.</p> : <div className="prospect-grid">{prospects.filter((prospect) => `${prospect.name} ${prospect.industry_label} ${prospect.city}`.toLowerCase().includes(prospectSearch.toLowerCase())).map((prospect) => <article key={prospect.id}><div className="inquiry-title"><div><strong>{prospect.name}</strong><small>{prospect.industry_label || 'Sin industria'} · {prospect.territory_name || 'Sin territorio'}</small></div>{canEdit ? <select aria-label={`Estado de ${prospect.name}`} value={prospect.status} onChange={(event) => updateProspectStatus(prospect, event.target.value as Prospect['status'])}><option value="NEW">Nuevo</option><option value="REVIEWED">Revisado</option><option value="DISCARDED">Descartado</option></select> : <span>{prospect.status}</span>}</div><p>{prospect.notes || 'Sin observaciones.'}</p><small>Fuente: {prospect.source}{prospect.discovery_score !== null && prospect.discovery_score !== undefined ? ` · Afinidad IA ${prospect.discovery_score}/100` : ''}</small>{prospect.instagram_handle && <p><a href={`https://www.instagram.com/${prospect.instagram_handle}/`} target="_blank" rel="noopener noreferrer">Ver perfil de Instagram ↗</a></p>}{prospect.duplicate_warnings.length > 0 && <p className="duplicate-warning">Posible duplicado: {prospect.duplicate_warnings.map((warning) => warning.name).join(', ')}</p>}</article>)}</div>}
        </section>}

        {activeSection === 'territories' && <section className="catalog-list territory-list">
          <div className="catalog-list-heading"><div><span className="eyebrow">COBERTURA</span><h2>Territorios comerciales</h2></div><strong>{territories.length}</strong></div>
          {canEdit && <form className="territory-form" onSubmit={createTerritory}><label>Región de interés<select name="region" required value={territoryRegion} onChange={(event) => { const region = event.target.value; const selected = chileanRegions.find((item) => item.name === region); setTerritoryName((current) => !current || current === territoryRegion ? region : current); setTerritoryRegion(region); setTerritoryLocalities(selected?.localities.join(', ') ?? '') }}><option value="">Selecciona una región de Chile</option>{chileanRegions.map((region) => <option key={region.name} value={region.name}>{region.name}</option>)}</select></label><label>Nombre del territorio<input name="name" required value={territoryName} onChange={(event) => setTerritoryName(event.target.value)} placeholder="Ej. Santiago Oriente" /></label><label className="wide-field">Ciudades y comunas de interés<textarea name="localities" value={territoryLocalities} onChange={(event) => setTerritoryLocalities(event.target.value)} aria-describedby="territory-localities-help" /></label><p id="territory-localities-help" className="territory-form-help">Sugerimos localidades principales de la región. Puedes quitar o agregar nombres separados por coma para definir dónde buscar.</p><label>Objetivo de prospectos<input name="prospect_goal" type="number" min="0" defaultValue="0" /></label><label className="wide-field">Descripción<textarea name="description" /></label><button type="submit" disabled={!csrfToken || !chileanRegions.length}>Crear territorio</button></form>}
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

        {activeSection === 'orders' && <section className="catalog-list order-list">
          <div className="catalog-list-heading"><div><span className="eyebrow">COMPRAS</span><h2>Pedidos recibidos</h2><p>Confirma cada pedido con el cliente y coordina entrega y pago por tu cuenta.</p></div><strong>{orders.length} pedido{orders.length === 1 ? '' : 's'}</strong></div>
          {orderError && <p className="quote-error" role="alert">{orderError}</p>}
          {orders.length === 0 ? <p className="empty-catalog">Todavía no hay pedidos.</p> : <div className="order-grid">{orders.map((order) => <article className="order-card" id={`order-${order.id}`} key={order.id}>
            <header><div><span className="eyebrow">{order.folio}</span><h3>{order.full_name}</h3><small>{order.company_name || 'Cliente particular'} · {new Date(order.created_at).toLocaleDateString('es-CL')}</small></div><span className={`order-status status-${order.status.toLowerCase()}`}>{({ NEW: 'Nuevo', CONFIRMED: 'Confirmado', COMPLETED: 'Completado', CANCELLED: 'Cancelado' } as const)[order.status]}</span></header>
            <div className="order-contact">{order.email && <a href={`mailto:${order.email}`}>{order.email}</a>}{order.phone && <a href={`tel:${order.phone}`}>{order.phone}</a>}</div>
            <p><strong>Entrega:</strong> {({ COORDINATE: 'Por coordinar', PICKUP: 'Retiro', SHIPPING: 'Despacho' } as const)[order.delivery_method]}{order.delivery_address ? ` · ${order.delivery_address}` : ''}</p>
            {order.notes && <p><strong>Indicaciones:</strong> {order.notes}</p>}
            <ul>{order.items.map((item) => <li key={item.product_sku}><span>{item.product_name} × {item.quantity}</span><strong>{formatClp(item.line_total)}</strong></li>)}</ul>
            <div className="order-total"><span>Total productos</span><strong>{formatClp(order.total)}</strong></div>
            <div className="order-attribution"><label htmlFor={`source-${order.id}`}>Solicitud de origen</label><p>Vincula este pedido solo si proviene de una solicitud previa del mismo contacto.</p><select id={`source-${order.id}`} value={order.source_request ?? ''} disabled={!canEdit || busyOrderId === order.id || !csrfToken} onChange={(event) => updateOrderSource(order, event.target.value || null)}><option value="">Sin vincular · compra directa</option>{inquiries.filter((inquiry) => contactsMatch(order, inquiry) && inquiry.created_at <= order.created_at).map((inquiry) => <option key={inquiry.id} value={inquiry.id}>{inquiry.quote?.folio ?? 'Solicitud sin cotización'} · {inquiry.full_name} · {new Date(inquiry.created_at).toLocaleDateString('es-CL')}</option>)}</select></div>
            {canEdit && <div className="order-actions">{order.status === 'NEW' && <button type="button" disabled={busyOrderId === order.id} onClick={() => updateOrderStatus(order, 'CONFIRMED')}>Marcar confirmado</button>}{order.status === 'CONFIRMED' && <button type="button" disabled={busyOrderId === order.id} onClick={() => updateOrderStatus(order, 'COMPLETED')}>Marcar completado</button>}{(order.status === 'NEW' || order.status === 'CONFIRMED') && <button type="button" className="order-cancel" disabled={busyOrderId === order.id} onClick={() => updateOrderStatus(order, 'CANCELLED')}>Cancelar pedido</button>}</div>}
          </article>)}</div>}
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
