import { useEffect, useState, type FormEvent } from 'react'

type TerritoryOption = { id: string; name: string; region: string; localities: string[]; is_active: boolean }
type PlaceJob = {
  id: string; status: string; keywords: string; location: string; results_count: number
  estimated_cost_usd: string | null; actual_cost_usd: string | null
  submission_uncertain: boolean; error: string; submitted_at: string | null
  observations: { decision: string; business_name: string; reason: string }[]
}
type PlaceState = {
  configured: boolean; daily_limit: number; searches_today: number
  categories: { code: string; label: string }[]; jobs: PlaceJob[]
}

const headers = { Accept: 'application/json' }

export function PlacesSearchPanel({ territories, canEdit, csrfToken, onUpdated }: {
  territories: TerritoryOption[]; canEdit: boolean; csrfToken: string; onUpdated: () => void
}) {
  const [data, setData] = useState<PlaceState | null>(null)
  const [territoryId, setTerritoryId] = useState('')
  const [locality, setLocality] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const territory = territories.find((item) => item.id === territoryId)

  async function refresh() {
    const response = await fetch('/api/prospects/places/', { headers, credentials: 'same-origin' })
    if (response.ok) {
      const value = await response.json() as PlaceState
      if (Array.isArray(value.jobs) && Array.isArray(value.categories)) setData(value)
    }
  }

  useEffect(() => { void refresh().catch(() => setError('No se pudo consultar el historial de Maps.')) }, [])

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit || !csrfToken || busy || !territory || !locality || !category) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const choice = data?.categories.find((item) => item.code === category)
      if (!choice) return
      const response = await fetch('/api/prospects/places/', {
        method: 'POST', credentials: 'same-origin',
        headers: { ...headers, 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify({ territory: territory.id, locality, keywords: choice.label, category_families: [category] }),
      })
      const result = await response.json() as { detail?: string; cached?: boolean; job?: PlaceJob }
      if (!response.ok) throw new Error(result.detail || result.job?.error || 'No se pudo completar la búsqueda.')
      setMessage(result.cached ? 'Resultado reciente reutilizado; no se hizo otra extracción.' :
        `Búsqueda completada: ${result.job?.results_count ?? 0} establecimiento(s) evaluado(s).`)
      await refresh()
      onUpdated()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo completar la búsqueda.')
      await refresh().catch(() => {})
    } finally { setBusy(false) }
  }

  return <section className="places-panel" aria-label="Búsqueda de negocios en Maps">
    <div className="places-panel-heading"><div><span className="eyebrow">DESCUBRIMIENTO LOCAL</span><h3>Negocios desde Google Maps</h3><p>Busca por rubro y ciudad dentro de un territorio. Los negocios válidos se guardan como prospectos aunque no tengan Instagram.</p></div>
      <span>{data ? `${data.searches_today}/${data.daily_limit} consultas hoy` : 'Consultando límite…'}</span></div>
    {data && !data.configured && <p className="quote-error">Falta configurar Mindcase en el servidor.</p>}
    {canEdit && <form className="places-search-form" onSubmit={search}>
      <label>Territorio<select value={territoryId} required onChange={(event) => { setTerritoryId(event.target.value); setLocality('') }}><option value="">Selecciona un territorio</option>{territories.filter((item) => item.is_active && item.region).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.region}</option>)}</select></label>
      <label>Ciudad o comuna<select value={locality} required disabled={!territory} onChange={(event) => setLocality(event.target.value)}><option value="">Selecciona una localidad</option>{territory?.localities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label>Rubro<select value={category} required onChange={(event) => setCategory(event.target.value)}><option value="">Selecciona un rubro</option>{data?.categories.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
      <button type="submit" disabled={busy || !csrfToken || !data?.configured || !locality || !category || data.searches_today >= data.daily_limit || data.jobs.some((job) => job.submission_uncertain || ['RUNNING', 'PENDING'].includes(job.status))}>{busy ? 'Buscando…' : 'Buscar un negocio'}</button>
    </form>}
    <p className="places-hint">Límite temporal: 1 lugar y 0 imágenes por consulta. Costo estimado: US$0,004 si devuelve un lugar facturable; el cargo real debe revisarse en Mindcase.</p>
    {error && <p className="quote-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {data?.jobs.length ? <details className="places-history"><summary>Historial Maps ({data.jobs.length})</summary><div>{data.jobs.map((job) => <article key={job.id}><strong>{job.keywords} · {job.location}</strong><small>{job.status === 'COMPLETED' ? 'Completada' : job.status === 'FAILED' ? 'Fallida' : 'En curso'} · {job.results_count} evaluado(s){job.submitted_at ? ` · ${new Date(job.submitted_at).toLocaleString('es-CL')}` : ''}</small>{job.submission_uncertain && <p>Resultado incierto: revisar Run History antes de otra búsqueda.</p>}{job.error && <p>{job.error}</p>}{job.observations.map((row, index) => <p key={`${job.id}-${index}`}>{row.business_name || 'Resultado sin nombre'} · {row.decision === 'REJECTED' ? 'Descartado' : row.decision === 'EXISTING' ? 'Ya registrado' : 'Prospecto creado'} · {row.reason}</p>)}</article>)}</div></details> : null}
  </section>
}
