import { type CSSProperties, useEffect, useState } from 'react'

type Offering = { name: string; description: string }
type LandingData = {
  name: string
  description: string
  headline: string
  logo_path: string
  theme: { primary: string; secondary: string }
  contact: { email: string; phone: string }
  featured_offerings: Offering[]
  is_demo: boolean
}

type TenantContext = {
  id: string
  name: string
  role: 'OWNER' | 'ADMIN' | 'STAFF' | 'VIEWER'
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
      <nav className="public-nav" aria-label="Navegación pública">
        <Brand name={tenant.name} logo={tenant.logo_path} />
        <a className="app-link" href="/app/login/">Acceso equipo</a>
      </nav>

      <section className="tenant-hero">
        <div className="hero-copy">
          <span className="eyebrow">{tenant.is_demo ? 'SITIO DEMOSTRATIVO' : 'BIENVENIDOS'}</span>
          <h1>{tenant.headline}</h1>
          <p>{tenant.description}</p>
          {(tenant.contact.email || tenant.contact.phone) && (
            <div className="contact-row" aria-label="Datos de contacto">
              {tenant.contact.email && <a href={`mailto:${tenant.contact.email}`}>{tenant.contact.email}</a>}
              {tenant.contact.phone && <span>{tenant.contact.phone}</span>}
            </div>
          )}
        </div>
        <div className="hero-mark" aria-hidden="true">
          <img src={tenant.logo_path} alt="" />
        </div>
      </section>

      <section className="offerings" aria-labelledby="offerings-title">
        <div className="section-heading">
          <span>LO DESTACADO</span>
          <h2 id="offerings-title">Productos y servicios</h2>
        </div>
        <div className="offering-grid">
          {tenant.featured_offerings.map((offering, index) => (
            <article key={`${offering.name}-${index}`}>
              <span className="offering-number">0{index + 1}</span>
              <h3>{offering.name}</h3>
              <p>{offering.description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="public-footer">
        <span>{tenant.name}</span>
        <span>{tenant.is_demo ? 'Contenido sintético de demostración' : 'Sitio impulsado por MAGAVI'}</span>
      </footer>
    </main>
  )
}

function PrivateApp() {
  const [state, setState] = useState<LoadState<TenantContext>>({ phase: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/tenant/context/', { headers: jsonHeaders, credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Authentication required')
        setState({ phase: 'ready', data: (await response.json()) as TenantContext })
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

  return (
    <main className="private-shell">
      <Brand name={state.data.name} logo="/static/magavi-mark.svg" />
      <section className="access-card">
        <span className="eyebrow">ÁREA PRIVADA</span>
        <h1>Hola, equipo de {state.data.name}</h1>
        <p>Tu rol activo es {state.data.role}. Los módulos comerciales se habilitarán en próximos incrementos.</p>
      </section>
    </main>
  )
}

function LoginPage() {
  return (
    <main className="login-shell">
      <a href="/" className="back-link">← Volver al sitio</a>
      <section className="login-card">
        <Brand name="MAGAVI" logo="/static/magavi-mark.svg" />
        <div>
          <span className="eyebrow">ACCESO SEGURO</span>
          <h1>Ingresa a tu espacio comercial</h1>
          <p>La autenticación de usuarios se conectará en el siguiente incremento.</p>
        </div>
        <form aria-label="Formulario de acceso" onSubmit={(event) => event.preventDefault()}>
          <label>Correo electrónico<input type="email" autoComplete="email" disabled /></label>
          <label>Contraseña<input type="password" autoComplete="current-password" disabled /></label>
          <button type="submit" disabled>Acceso próximamente</button>
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
