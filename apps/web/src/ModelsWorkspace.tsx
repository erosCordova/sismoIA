import { useContext, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip, ScatterChart, Scatter } from "recharts";
import { BrainCircuit, RefreshCw } from "lucide-react";
import { TokenContext } from "./AuthGate";
import "./preparation.css";
import "./models.css";

type Metricas = {
  entrenamiento: number; evaluacion: number; variables: string[];
  kmeans: { grupos: number; silhouette_train: number; silhouette_evaluacion: number | null; distribucion: Record<string, number> };
  dbscan: { eps: number; grupos: number; cobertura: number; silhouette_sin_ruido: number; ruido: number; distribucion: Record<string, number> };
  advertencia: string;
};
type Punto = { id: string; fuente: string; latitud: number; longitud: number; magnitud: number; grupo: number };
type Resultado = { conjunto: string; total: number; puntos: Punto[] };
const colores = ["#087f99", "#18a78e", "#e2a23a", "#8757b5", "#d15e58", "#5277cc"];

export default function ModelsWorkspace() {
  const token = useContext(TokenContext);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [conjunto, setConjunto] = useState("evaluacion");
  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    async function cargar() {
      setCargando(true); setError("");
      try {
        const opciones = { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal };
        const [a, b] = await Promise.all([
          fetch("/api/v1/ml/overview", opciones),
          fetch(`/api/v1/ml/clusters?conjunto=${conjunto}&limite=400`, opciones)
        ]);
        if (!a.ok || !b.ok) throw new Error(`Consulta de modelos: HTTP ${a.status}/${b.status}`);
        const m: Metricas = await a.json();
        const r: Resultado = await b.json();
        if (!ctrl.signal.aborted) { setMetricas(m); setResultado(r); }
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "No se pudo consultar ML");
      } finally { if (!ctrl.signal.aborted) setCargando(false); }
    }
    void cargar();
    return () => ctrl.abort();
  }, [token, conjunto, revision]);

  const distribucion = Object.entries(metricas?.kmeans.distribucion ?? {}).map(([grupo, cantidad]) => ({ grupo: `Grupo ${Number(grupo) + 1}`, cantidad }));
  const grupos = [...new Set(resultado?.puntos.map(p => p.grupo) ?? [])].sort((a, b) => a - b);
  const numero = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("es-PE", { maximumFractionDigits: 4 });

  return <section className="prep-root">
    <header className="prep-header">
      <div><h2><BrainCircuit size={24}/> Modelos de Machine Learning</h2>
        <p>Agrupamiento experimental de registros sísmicos · K-Means y DBSCAN</p></div>
      <div className="prep-actions">
        <select aria-label="Conjunto de datos" value={conjunto} onChange={e => setConjunto(e.target.value)}>
          <option value="evaluacion">Evaluación</option><option value="entrenamiento">Entrenamiento</option>
        </select>
        <button disabled={cargando} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16}/> Actualizar</button>
      </div>
    </header>
    {cargando && <p className="prep-loading">Cargando modelos entrenados...</p>}
    {error && <p className="prep-error" role="alert">{error}</p>}
    <div className="prep-metrics">
      <article><span>Registros entrenamiento</span><strong>{numero(metricas?.entrenamiento)}</strong></article>
      <article><span>Registros evaluación</span><strong>{numero(metricas?.evaluacion)}</strong></article>
      <article><span>Grupos K-Means</span><strong>{numero(metricas?.kmeans.grupos)}</strong></article>
      <article><span>Silhouette K-Means entrenamiento</span><strong>{numero(metricas?.kmeans.silhouette_train)}</strong></article>
      <article><span>Silhouette K-Means evaluación</span><strong>{numero(metricas?.kmeans.silhouette_evaluacion)}</strong></article>
      <article><span>Cobertura DBSCAN entrenamiento</span><strong>{metricas ? `${(metricas.dbscan.cobertura * 100).toFixed(2)}%` : "—"}</strong></article>
    </div>
    <div className="prep-grid">
      <article className="prep-card">
        <h3>Distribución de grupos K-Means</h3>
        <p>Cantidad de observaciones del conjunto de entrenamiento en cada grupo.</p>
        <div className="prep-chart"><ResponsiveContainer width="100%" height={260}>
          <BarChart data={distribucion} margin={{ left: -15, right: 15 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="grupo"/><YAxis allowDecimals={false}/><Tooltip/>
            <Bar dataKey="cantidad" fill="#087f99" name="Observaciones" radius={[6,6,0,0]}/>
          </BarChart>
        </ResponsiveContainer></div>
      </article>
      <article className="prep-card">
        <h3>DBSCAN — análisis de densidad</h3>
        <div className="prep-detail"><span>Grupos identificados</span><strong>{numero(metricas?.dbscan.grupos)}</strong></div>
        <div className="prep-detail"><span>Radio epsilon</span><strong>{numero(metricas?.dbscan.eps)}</strong></div>
        <div className="prep-detail"><span>Registros clasificados como ruido</span><strong>{numero(metricas?.dbscan.ruido)}</strong></div>
        <div className="prep-detail"><span>Silhouette sin ruido</span><strong>{numero(metricas?.dbscan.silhouette_sin_ruido)}</strong></div>
        <p className="ml-note">La evaluación DBSCAN excluye el ruido. No es comparable directamente con K-Means.</p>
      </article>
    </div>
    <article className="prep-card">
      <h3>Ubicación de grupos K-Means</h3>
      <p>Latitud y longitud de hasta 400 registros recientes del conjunto seleccionado. Cada color representa un grupo; no indica riesgo ni probabilidad sísmica.</p>
      <div className="ml-graph"><ResponsiveContainer width="100%" height={350}>
        <ScatterChart margin={{ top: 15, right: 18, bottom: 12, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3"/>
          <XAxis type="number" dataKey="longitud" name="Longitud" unit="°" domain={["dataMin", "dataMax"]}/>
          <YAxis type="number" dataKey="latitud" name="Latitud" unit="°" domain={["dataMin", "dataMax"]}/>
          <Tooltip cursor={{ strokeDasharray: "3 3" }}/>
          {grupos.map(g => <Scatter key={g} name={`Grupo ${g + 1}`} data={resultado?.puntos.filter(p => p.grupo === g) ?? []} fill={colores[g % colores.length]}/>)}
        </ScatterChart>
      </ResponsiveContainer></div>
      <p className="ml-note">Conjunto: {conjunto}. Registros disponibles: {numero(resultado?.total)}. Muestra visualizada: {numero(resultado?.puntos.length)}.</p>
    </article>
    <p className="ml-note">{metricas?.advertencia ?? "Los modelos son exploratorios y no permiten predecir cuándo ocurrirá un terremoto."}</p>
  </section>;
}
