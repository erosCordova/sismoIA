import { useContext, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp, RefreshCw } from "lucide-react";
import { TokenContext } from "./AuthGate";
import "./preparation.css";

type Serie = { etiqueta: string; cantidad: number };
type Estimacion = {
  fuente: string; peru: boolean; magnitud_umbral: number;
  registros_analizados: number; registros_validos: number;
  registros_superiores_umbral: number; porcentaje_observado: number | null;
  intervalo_wilson_95: { inferior: number; superior: number } | null;
  magnitud_mediana: number | null;
  primera_fecha_utc: string | null; ultima_fecha_utc: string | null;
  limite_alcanzado: boolean; distribucion: Serie[]; mensual: Serie[];
  advertencia: string;
};

export default function EstimatesWorkspace({ peru }: { peru: boolean }) {
  const token = useContext(TokenContext);
  const [fuente, setFuente] = useState(peru ? "IGP" : "USGS");
  const [umbral, setUmbral] = useState("4");
  const [revision, setRevision] = useState(0);
  const [datos, setDatos] = useState<Estimacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setFuente(peru ? "IGP" : "USGS"); }, [peru]);
  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    async function cargar() {
      setCargando(true); setError(""); setDatos(null);
      try {
        const params = new URLSearchParams({
          fuente, peru: String(peru), magnitud_umbral: umbral
        });
        const r = await fetch(`/api/v1/estimates/historical?${params}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal
        });
        if (!r.ok) throw new Error(`No se pudieron obtener estimaciones: HTTP ${r.status}`);
        const resultado: Estimacion = await r.json();
        if (!ctrl.signal.aborted) setDatos(resultado);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Error de consulta");
      } finally { if (!ctrl.signal.aborted) setCargando(false); }
    }
    void cargar();
    return () => ctrl.abort();
  }, [token, fuente, peru, umbral, revision]);

  const numero = (v: number | null | undefined) =>
    v == null ? "—" : v.toLocaleString("es-PE", { maximumFractionDigits: 2 });
  const fecha = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleDateString("es-PE", { timeZone: "UTC" }) : "—";

  return <section className="prep-root">
    <header className="prep-header">
      <div><h2><TrendingUp size={23}/> Estimaciones históricas</h2>
        <p>Estadísticas descriptivas de registros sísmicos · {peru ? "Zona de Perú" : "Mundo"}</p></div>
      <div className="prep-actions">
        <select aria-label="Fuente sísmica" value={fuente} onChange={e => setFuente(e.target.value)}>
          <option value="IGP">IGP</option><option value="USGS">USGS</option>
        </select>
        <select aria-label="Magnitud umbral" value={umbral} onChange={e => setUmbral(e.target.value)}>
          <option value="3">Magnitud 3+</option><option value="4">Magnitud 4+</option>
          <option value="5">Magnitud 5+</option><option value="6">Magnitud 6+</option>
        </select>
        <button disabled={cargando} onClick={() => setRevision(v => v+1)}><RefreshCw size={16}/> Actualizar</button>
      </div>
    </header>
    {cargando && <p className="prep-loading">Calculando estadísticas históricas...</p>}
    {error && <p role="alert" className="prep-error">{error}</p>}
    {datos?.limite_alcanzado && <p className="prep-loading">Consulta limitada a 10.000 observaciones recientes.</p>}
    <div className="prep-metrics">
      <article><span>Registros válidos</span><strong>{numero(datos?.registros_validos)}</strong></article>
      <article><span>Magnitud igual o superior a {umbral}</span><strong>{numero(datos?.registros_superiores_umbral)}</strong></article>
      <article><span>Porcentaje observado</span><strong>{datos?.porcentaje_observado == null ? "—" : `${numero(datos.porcentaje_observado)}%`}</strong></article>
      <article><span>Magnitud mediana</span><strong>{numero(datos?.magnitud_mediana)}</strong></article>
      <article><span>Intervalo Wilson 95%</span><strong>{datos?.intervalo_wilson_95 ? `${numero(datos.intervalo_wilson_95.inferior)}%–${numero(datos.intervalo_wilson_95.superior)}%` : "Muestra insuficiente"}</strong></article>
      <article><span>Periodo de registros</span><strong style={{ fontSize: 16 }}>{fecha(datos?.primera_fecha_utc)} – {fecha(datos?.ultima_fecha_utc)}</strong></article>
    </div>
    <div className="prep-grid">
      <article className="prep-card"><h3>Distribución histórica de magnitudes</h3>
        <p>Frecuencia de magnitudes en el catálogo seleccionado</p>
        <div className="prep-chart"><ResponsiveContainer width="100%" height={260}>
          <BarChart data={datos?.distribucion ?? []} margin={{ left: -18, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }}/><YAxis allowDecimals={false}/>
            <Tooltip/><Bar dataKey="cantidad" name="Registros" fill="#087f99" radius={[6,6,0,0]}/>
          </BarChart>
        </ResponsiveContainer></div>
      </article>
      <article className="prep-card"><h3>Registros observados por mes</h3>
        <p>Conteos del catálogo disponible; los periodos pueden estar incompletos</p>
        <div className="prep-chart"><ResponsiveContainer width="100%" height={260}>
          <LineChart data={datos?.mensual ?? []} margin={{ left: -18, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }}/><YAxis allowDecimals={false}/>
            <Tooltip/><Line dataKey="cantidad" name="Registros" stroke="#18a78e" strokeWidth={2} dot={false}/>
          </LineChart>
        </ResponsiveContainer></div>
      </article>
    </div>
    <article className="prep-card"><h3>Interpretación de resultados</h3>
      <p>{datos?.advertencia ?? "Esperando datos históricos."}</p>
      <p>El porcentaje describe la composición de los registros consultados. No representa la probabilidad de que ocurra un sismo futuro.</p>
    </article>
  </section>;
}
