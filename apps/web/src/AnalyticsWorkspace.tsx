import { useContext, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, RefreshCw } from "lucide-react";
import { TokenContext } from "./AuthGate";
import "./preparation.css";

type Serie = { etiqueta: string; cantidad: number };
type Datos = {
  total: number; validos: number; limitado: boolean;
  fuentes: { nombre: string; cantidad: number }[];
  calidad: Record<string, number>;
  magnitud_media: number | null;
  magnitud_mediana: number | null;
  profundidad_mediana: number | null;
  correlacion_magnitud_profundidad: number | null;
  pares_comparables: number;
  mensual: Serie[]; magnitudes: Serie[]; profundidades: Serie[]; nota: string;
};

export default function AnalyticsWorkspace({ peru }: { peru: boolean }) {
  const token = useContext(TokenContext);
  const [fuente, setFuente] = useState("");
  const [revision, setRevision] = useState(0);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    async function cargar() {
      setCargando(true); setError("");
      try {
        const parametros = new URLSearchParams({ peru: String(peru) });
        if (fuente) parametros.set("fuente", fuente);
        const r = await fetch(`/api/v1/analytics/overview?${parametros}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal
        });
        if (!r.ok) throw new Error(`No se pudo obtener el análisis: HTTP ${r.status}`);
        const resultado: Datos = await r.json();
        if (!ctrl.signal.aborted) setDatos(resultado);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Error de consulta");
      } finally {
        if (!ctrl.signal.aborted) setCargando(false);
      }
    }
    void cargar();
    return () => ctrl.abort();
  }, [token, fuente, peru, revision]);

  const numero = (n: number | null | undefined) =>
    n == null ? "—" : n.toLocaleString("es-PE", { maximumFractionDigits: 3 });

  return <section className="prep-root">
    <header className="prep-header">
      <div><h2><BarChart3 size={23}/> Análisis estadístico sísmico</h2>
        <p>Observaciones de PostgreSQL · {peru ? "Zona de Perú" : "Cobertura mundial"}</p></div>
      <div className="prep-actions">
        <select aria-label="Fuente de datos" value={fuente} onChange={e => setFuente(e.target.value)}>
          <option value="">USGS + IGP</option><option value="USGS">USGS</option><option value="IGP">IGP</option>
        </select>
        <button disabled={cargando} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16}/> Actualizar</button>
      </div>
    </header>
    {error && <p className="prep-error" role="alert">{error}</p>}
    {cargando && <p className="prep-loading">Calculando estadísticas...</p>}
    {datos?.limitado && <p className="prep-loading">Resultados limitados a 10.000 observaciones.</p>}
    <div className="prep-metrics">
      <article><span>Registros analizados</span><strong>{numero(datos?.total)}</strong></article>
      <article><span>Registros válidos</span><strong>{numero(datos?.validos)}</strong></article>
      <article><span>Magnitud media</span><strong>{numero(datos?.magnitud_media)}</strong></article>
      <article><span>Magnitud mediana</span><strong>{numero(datos?.magnitud_mediana)}</strong></article>
      <article><span>Profundidad mediana</span><strong>{numero(datos?.profundidad_mediana)} km</strong></article>
      <article><span>Correlación magnitud–profundidad</span><strong>{numero(datos?.correlacion_magnitud_profundidad)}</strong></article>
    </div>
    <div className="prep-grid">
      <article className="prep-card"><h3>Distribución de magnitudes</h3>
        <div className="prep-chart"><ResponsiveContainer width="100%" height={260}>
          <BarChart data={datos?.magnitudes ?? []} margin={{ left: -15, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }}/><YAxis allowDecimals={false}/>
            <Tooltip/><Bar dataKey="cantidad" name="Registros" fill="#087e98" radius={[6,6,0,0]}/>
          </BarChart>
        </ResponsiveContainer></div>
      </article>
      <article className="prep-card"><h3>Distribución por profundidad</h3>
        <div className="prep-chart"><ResponsiveContainer width="100%" height={260}>
          <BarChart data={datos?.profundidades ?? []} margin={{ left: -15, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }}/><YAxis allowDecimals={false}/>
            <Tooltip/><Bar dataKey="cantidad" name="Registros" fill="#18a99b" radius={[6,6,0,0]}/>
          </BarChart>
        </ResponsiveContainer></div>
      </article>
    </div>
    <article className="prep-card"><h3>Registros sísmicos por mes</h3>
      <p>Conteos mensuales del catálogo disponible; no representan predicciones.</p>
      <div className="prep-chart"><ResponsiveContainer width="100%" height={260}>
        <LineChart data={datos?.mensual ?? []} margin={{ left: -12, right: 18 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false}/>
          <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }}/><YAxis allowDecimals={false}/>
          <Tooltip/><Line dataKey="cantidad" name="Registros" stroke="#087e98" strokeWidth={2} dot={false}/>
        </LineChart>
      </ResponsiveContainer></div>
    </article>
    <article className="prep-card"><h3>Procedencia y calidad de los datos</h3>
      {datos?.fuentes.map(f => <div className="prep-detail" key={f.nombre}>
        <span>{f.nombre}</span><strong>{numero(f.cantidad)} registros</strong>
      </div>)}
      <div className="prep-detail"><span>Observaciones para correlación</span><strong>{numero(datos?.pares_comparables)}</strong></div>
      <p>{datos?.nota ?? "Cargando información..."}</p>
    </article>
  </section>;
}
