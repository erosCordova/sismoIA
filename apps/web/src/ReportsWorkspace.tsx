import { useContext, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, FileText, RefreshCw } from "lucide-react";
import { TokenContext, UsuarioContext } from "./AuthGate";
import "./preparation.css";
import "./reporting.css";

type Serie = { etiqueta: string; cantidad: number };
type Origen = { nombre: string; cantidad: number };
type Resumen = {
  dias: number; peru: boolean; fuente: string | null; total: number;
  magnitud_promedio: number | null; magnitud_maxima: number | null;
  primera_fecha_utc: string | null; ultima_fecha_utc: string | null;
  por_fuente: Origen[]; por_mes: Serie[]; por_magnitud: Serie[];
  advertencia: string;
};

export default function ReportsWorkspace({ peru }: { peru: boolean }) {
  const token = useContext(TokenContext);
  const usuario = useContext(UsuarioContext);
  const [dias, setDias] = useState("30");
  const [fuente, setFuente] = useState("");
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");
  const puedeExportar = Boolean(usuario?.permisos.includes("*") || usuario?.permisos.includes("reports:create"));
  const parametros = () => new URLSearchParams({
    dias, peru: String(peru), ...(fuente ? { fuente } : {})
  });

  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    async function consultar() {
      setCargando(true); setError("");
      try {
        const r = await fetch(`/api/v1/reports/summary?${parametros()}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal
        });
        if (!r.ok) throw new Error(`Consulta de reportes: HTTP ${r.status}`);
        const resultado: Resumen = await r.json();
        if (!ctrl.signal.aborted) setDatos(resultado);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Error consultando reporte");
      } finally { if (!ctrl.signal.aborted) setCargando(false); }
    }
    void consultar();
    return () => ctrl.abort();
  }, [token, dias, peru, fuente, revision]);

  async function descargar() {
    if (!token || !puedeExportar) return;
    setExportando(true); setError("");
    try {
      const r = await fetch(`/api/v1/reports/export.csv?${parametros()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error(`Descarga CSV: HTTP ${r.status}`);
      const archivo = await r.blob();
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `sismoia_reporte_${dias}dias.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error exportando CSV");
    } finally { setExportando(false); }
  }

  const numero = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
  const fecha = (v: string | null | undefined) => v ? new Date(v).toLocaleDateString("es-PE", { timeZone: "UTC" }) : "—";

  return <section className="prep-root">
    <header className="prep-header">
      <div><h2><FileText size={23}/> Reportes sísmicos</h2>
        <p>Informes históricos basados en PostgreSQL · {peru ? "Zona aproximada de Perú" : "Mundo"}</p></div>
      <div className="prep-actions">
        <select aria-label="Periodo del informe" value={dias} onChange={e => setDias(e.target.value)}>
          <option value="7">7 días</option><option value="30">30 días</option>
          <option value="90">90 días</option><option value="365">365 días</option>
        </select>
        <select aria-label="Fuente del informe" value={fuente} onChange={e => setFuente(e.target.value)}>
          <option value="">Todas las fuentes</option><option value="IGP">IGP</option><option value="USGS">USGS</option>
        </select>
        <button disabled={cargando} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16}/> Actualizar</button>
        {puedeExportar && <button disabled={exportando} onClick={() => void descargar()}><Download size={16}/> Exportar CSV</button>}
      </div>
    </header>
    {cargando && <p className="prep-loading">Generando resumen estadístico...</p>}
    {error && <p className="prep-error" role="alert">{error}</p>}
    <div className="prep-metrics">
      <article><span>Registros del periodo</span><strong>{numero(datos?.total)}</strong></article>
      <article><span>Magnitud promedio</span><strong>{numero(datos?.magnitud_promedio)}</strong></article>
      <article><span>Magnitud máxima registrada</span><strong>{numero(datos?.magnitud_maxima)}</strong></article>
      <article><span>Primera observación</span><strong className="rep-date">{fecha(datos?.primera_fecha_utc)}</strong></article>
      <article><span>Última observación</span><strong className="rep-date">{fecha(datos?.ultima_fecha_utc)}</strong></article>
    </div>
    <div className="prep-grid">
      <article className="prep-card"><h3>Distribución por magnitud</h3>
        <div className="prep-chart"><ResponsiveContainer width="100%" height={260}>
          <BarChart data={datos?.por_magnitud ?? []} margin={{ left: -18, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }}/><YAxis allowDecimals={false}/>
            <Tooltip/><Bar dataKey="cantidad" name="Registros" fill="#087f99" radius={[6,6,0,0]}/>
          </BarChart>
        </ResponsiveContainer></div>
      </article>
      <article className="prep-card"><h3>Evolución mensual observada</h3>
        <div className="prep-chart"><ResponsiveContainer width="100%" height={260}>
          <LineChart data={datos?.por_mes ?? []} margin={{ left: -18, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }}/><YAxis allowDecimals={false}/>
            <Tooltip/><Line dataKey="cantidad" name="Registros" stroke="#18a78e" strokeWidth={2} dot={false}/>
          </LineChart>
        </ResponsiveContainer></div>
      </article>
    </div>
    <article className="prep-card"><h3>Comparación por fuente</h3>
      <div className="rep-source-list">{datos?.por_fuente.map(f => <div key={f.nombre} className="rep-source-row">
        <span>{f.nombre}</span><strong>{numero(f.cantidad)} registros</strong>
      </div>)}</div>
      {datos?.total === 0 && <p>No se encontraron registros para los filtros seleccionados.</p>}
    </article>
    <p className="rep-note">{datos?.advertencia ?? "Esperando datos históricos."} La exportación CSV está limitada a los 10.000 registros más recientes que cumplan los filtros.</p>
  </section>;
}
