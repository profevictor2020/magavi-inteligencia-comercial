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

function Brand({ name, logo }: { name: string; logo: string }) {
  return (
    <a className="brand" href="/" aria-label={`${name}, inicio`}>
      <img src={logo} alt="" width="44" height="44" />
      <span>{name}</span>
    </a>
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
      </section>

      <footer className="public-footer page-width">
        <Brand name={tenant.name} logo={tenant.logo_path} />
        <span>{tenant.is_demo ? 'Contenido sintético de demostración' : 'Sitio impulsado por MAGAVI'}</span>
      </footer>
    </main>
  )
}

function PrivateApp() {
  const [state, setState] = useState<LoadState<TenantContext>>({ phase: 'loading' })
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [csrfToken, setCsrfToken] = useState('')
  const [catalogError, setCatalogError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/tenant/context/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Authentication required')
        const tenant = (await response.json()) as TenantContext
        const [categoryResponse, productResponse, sessionResponse] = await Promise.all([
          fetch('/api/catalog/categories/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/catalog/products/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
          fetch('/api/auth/session/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal }),
        ])
        if (!categoryResponse.ok || !productResponse.ok || !sessionResponse.ok) throw new Error('Catalog unavailable')
        const session = (await sessionResponse.json()) as AuthSession
        setCategories((await categoryResponse.json()) as Category[])
        setProducts((await productResponse.json()) as Product[])
        setCsrfToken(session.csrf_token ?? '')
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

  return (
    <main className="private-shell">
      <div className="private-nav">
        <Brand name={state.data.name} logo="/static/magavi-mark.svg" />
        <LogoutButton />
      </div>
      <section className="private-heading">
        <span className="eyebrow">ÁREA PRIVADA</span>
        <h1>Hola, equipo de {state.data.name}</h1>
        <p>Tu rol activo es {state.data.role}. Administra el catálogo comercial de esta empresa.</p>
      </section>
      {catalogError && <p className="catalog-error" role="alert">{catalogError}</p>}
      {canEdit && (
        <section className="catalog-forms" aria-label="Crear elementos del catálogo">
          <form className="catalog-form" onSubmit={createCategory}>
            <div><span className="eyebrow">PASO 1</span><h2>Nueva categoría</h2></div>
            <label>Nombre<input name="name" required maxLength={120} /></label>
            <label>Descripción<textarea name="description" maxLength={500} /></label>
            <button type="submit" disabled={!csrfToken}>Crear categoría</button>
          </form>
          <form className="catalog-form" onSubmit={createProduct}>
            <div><span className="eyebrow">PASO 2</span><h2>Nuevo producto</h2></div>
            <label>Categoría<select name="category" required defaultValue=""><option value="" disabled>Selecciona una categoría</option>{categories.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Nombre<input name="name" required maxLength={160} /></label>
            <div className="form-row"><label>SKU<input name="sku" required maxLength={80} /></label><label>Formato<input name="format" maxLength={120} placeholder="Ej. Caja 12 unidades" /></label></div>
            <label>Descripción<textarea name="description" maxLength={1000} /></label>
            <label>Precio<input name="price" type="number" min="0" step="0.01" /></label>
            <button type="submit" disabled={!csrfToken || categories.length === 0}>Crear producto</button>
          </form>
        </section>
      )}
      <section className="catalog-list" aria-labelledby="catalog-title">
        <div className="catalog-list-heading"><div><span className="eyebrow">CATÁLOGO</span><h2 id="catalog-title">Productos de {state.data.name}</h2></div><strong>{products.length} producto{products.length === 1 ? '' : 's'}</strong></div>
        {products.length === 0 ? <p className="empty-catalog">Todavía no hay productos. Crea una categoría y luego agrega el primero.</p> : (
          <div className="catalog-table-wrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Estado</th><th>Publicación</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku}{product.format ? ` · ${product.format}` : ''}</small></td><td>{product.category_name}</td><td>{product.price ? `$${Number(product.price).toLocaleString('es-CL')}` : 'Por cotizar'}</td><td>{product.is_available ? 'Disponible' : 'No disponible'}</td><td>{canEdit ? <button className={`publish-button ${product.is_published ? 'is-published' : ''}`} type="button" onClick={() => togglePublished(product)}>{product.is_published ? 'Publicado' : 'Publicar'}</button> : product.is_published ? 'Publicado' : 'Borrador'}</td></tr>)}</tbody></table></div>
        )}
      </section>
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
