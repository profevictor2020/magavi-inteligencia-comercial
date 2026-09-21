import { useEffect, useState } from 'react'

type Health = {
  status: 'ok' | 'unavailable'
  database: 'ok' | 'unavailable'
}

type HealthState =
  | { phase: 'loading' }
  | { phase: 'ready'; health: Health }
  | { phase: 'error' }

export default function App() {
  const [healthState, setHealthState] = useState<HealthState>({ phase: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    async function checkHealth() {
      try {
        const response = await fetch('/api/health/', {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Health check unavailable')
        setHealthState({ phase: 'ready', health: (await response.json()) as Health })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setHealthState({ phase: 'error' })
      }
    }

    void checkHealth()
    return () => controller.abort()
  }, [])

  const isReady = healthState.phase === 'ready' && healthState.health.database === 'ok'

  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Navegación principal">
        <a className="brand" href="/" aria-label="MAGAVI inicio">
          <img src="/static/magavi-mark.svg" alt="" width="38" height="38" />
          <span>MAGAVI</span>
        </a>
        <span className="phase-pill">Fundaciones · MVP</span>
      </nav>

      <section className="hero">
        <div className="eyebrow">INTELIGENCIA COMERCIAL TERRITORIAL</div>
        <h1>Una base sólida para descubrir mejores oportunidades.</h1>
        <p className="intro">
          El núcleo técnico de MAGAVI ya conecta la experiencia web, la API y la base de datos en una sola
          aplicación preparada para crecer de forma segura.
        </p>

        <div className="status-card" role="status" aria-live="polite">
          <div className={`status-icon ${isReady ? 'is-ready' : ''}`} aria-hidden="true">
            {healthState.phase === 'loading' ? '…' : isReady ? '✓' : '!'}
          </div>
          <div>
            <span className="status-label">Estado de la plataforma</span>
            <strong>
              {healthState.phase === 'loading' && 'Comprobando servicios…'}
              {isReady && 'Aplicación y base de datos disponibles'}
              {healthState.phase === 'ready' && !isReady && 'Base de datos no disponible'}
              {healthState.phase === 'error' && 'No fue posible consultar la plataforma'}
            </strong>
          </div>
          <span className={`signal ${isReady ? 'is-ready' : ''}`} aria-hidden="true" />
        </div>
      </section>

      <section className="foundation" aria-labelledby="foundation-title">
        <div>
          <span className="section-number">01</span>
          <h2 id="foundation-title">Fundaciones verificables</h2>
        </div>
        <div className="foundation-grid">
          <article>
            <span>Experiencia</span>
            <h3>React PWA</h3>
            <p>Interfaz responsive, instalable y preparada para evolucionar sin fragmentar el producto.</p>
          </article>
          <article>
            <span>Núcleo</span>
            <h3>Django + DRF</h3>
            <p>Un monolito modular para mantener contratos, permisos y trazabilidad en un solo lugar.</p>
          </article>
          <article>
            <span>Persistencia</span>
            <h3>PostgreSQL</h3>
            <p>Datos relacionales y migraciones versionadas desde el primer incremento.</p>
          </article>
        </div>
      </section>

      <footer>
        <span>MAGAVI SpA</span>
        <span>Entorno demostrativo · Sin datos reales</span>
      </footer>
    </main>
  )
}
