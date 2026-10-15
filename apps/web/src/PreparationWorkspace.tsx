import { useContext, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Database, Download, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { TokenContext } from "./AuthGate";
import "./preparation.css";

type Perfil = {
  total_analizados: number; limite_alcanzado: boolean;
  por_fuente: Record<string, number>;
  estados_calidad: Record<string, number>;
  banderas: Record<string, number>;
  magnitud: { media: number | null; mediana: number | null; q1: number | null; q3: number | null; iqr: number | null; atipicos_iqr: number };
  profundidad: { mediana: number | null; faltantes: number };
  distribucion_magnitudes: { intervalo: string; cantidad: number }[];
};
type Registro = {
  id: string; fuente: string; fecha_utc: string;
  latitud: number; longitud: number; magnitud: number;
  profundidad_km: number | null; estado_calidad: string; banderas: string[];
};
type Vista = { total: number; registros: Registro[] };

export default function PreparationWorkspace({ peru }: { peru: boolean }) {
  const token = useContext(TokenContext);
  const [fuente, setFuente] = useState("");
  const [soloValidos, setSoloValidos] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    const controlador = new AbortController();
    async function cargar() {
      setCargando(true);
      setError("");
      try {
        const filtros = new URLSearchParams({ peru: String(peru) });
        if (fuente) filtros.set("fuente", fuente);
        const consulta = new URLSearchParams(filtros);
        consulta.set("solo_validos", String(soloValidos));
        consulta.set("limite", "80");
        const opciones = { headers: { Authorization: `Bearer ${token}` }, signal: controlador.signal };
        const [rp, rv] = await Promise.all([
          fetch(`/api/v1/preparation/profile?${filtros}`, opciones),
          fetch(`/api/v1/preparation/preview?${consulta}`, opciones)
        ]);
        if (!rp.ok || !rv.ok) throw new Error(`Error consultando PostgreSQL: ${rp.status}/${rv.status}`);
        const p: Perfil = await rp.json();
        const v: Vista = await rv.json();
        if (!controlador.signal.aborted) { setPerfil(p); setVista(v); }
      } catch (e) {
        if (!controlador.signal.aborted) setError(e instanceof Error ? e.message : "Error de consulta");
      } finally {
        if (!controlador.signal.aborted) setCargando(false);
      }
    }
    void cargar();
    return () => controlador.abort();
  }, [token, fuente, peru, soloValidos, revision]);

  async function exportar() {
    if (!token) return;
    setExportando(true);
    setError("");
    try {
      const filtros = new URLSearchParams({ peru: String(peru), solo_validos: String(soloValidos) });
      if (fuente) filtros.set("fuente", fuente);
      const respuesta = await fetch(`/api/v1/preparation/export?${filtros}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!respuesta.ok) throw new Error(`No se pudo exportar: HTTP ${respuesta.status}`);
      const archivo = await respuesta.blob();
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `SISMOIA_${fuente || "Todas"}_${peru ? "Peru" : "Mundo"}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setExportando(false);
    }
  }

  const fuentes = Object.entries(perfil?.por_fuente || {}).map(([nombre, cantidad]) => ({ nombre, cantidad }));
  const validos = perfil?.estados_calidad.VALIDO ?? 0;
  const revisionNecesaria = perfil?.estados_calidad.REVISAR ?? 0;
  const faltantes = Object.values(perfil?.banderas || {}).reduce((a, b) => a + b, 0);
  const numero = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
  const fecha = (v: string) => new Date(v).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" });

  return (
    <section className="prep-root">
      <header className="prep-header">
        <div>
          <h2><Database size={24}/> Preparación y calidad de datos</h2>
          <p>Análisis estadístico de registros sísmicos reales · USGS + IGP · {peru ? "Perú" : "Mundo"}</p>
        </div>
        <div className="prep-actions">
          <select aria-label="Filtrar institución" value={fuente} onChange={e => setFuente(e.target.value)}>
            <option value="">Todas las fuentes</option>
            <option value="USGS">USGS</option>
            <option value="IGP">IGP</option>
          </select>
          <label className="prep-check">
            <input type="checkbox" checked={soloValidos} onChange={e => setSoloValidos(e.target.checked)}/>
            Solo válidos
          </label>
          <button disabled={cargando} onClick={() => setRevision(n => n + 1)}><RefreshCw size={16}/> Actualizar</button>
          <button className="prep-download" disabled={exportando} onClick={() => void exportar()}>
            <Download size={16}/> {exportando ? "Exportando..." : "Exportar CSV"}
          </button>
        </div>
      </header>

      {error && <p className="prep-error" role="alert">{error}</p>}
      {cargando && <p className="prep-loading">Analizando registros de PostgreSQL...</p>}
      {perfil?.limite_alcanzado && <p className="prep-loading">Perfil calculado sobre una muestra limitada a 10.000 registros.</p>}

      <div className="prep-metrics">
        <article><span>Registros analizados</span><strong>{numero(perfil?.total_analizados)}</strong></article>
        <article><span>Registros válidos</span><strong>{numero(validos)}</strong></article>
        <article><span>Requieren revisión</span><strong>{numero(revisionNecesaria)}</strong></article>
        <article><span>Magnitud mediana</span><strong>{numero(perfil?.magnitud.mediana)}</strong></article>
        <article><span>Atípicos por IQR</span><strong>{numero(perfil?.magnitud.atipicos_iqr)}</strong></article>
        <article><span>Advertencias de calidad</span><strong>{numero(faltantes)}</strong></article>
      </div>

      <div className="prep-grid">
        <article className="prep-card">
          <h3>Distribución de magnitudes</h3>
          <p>Cantidad de observaciones por intervalo de magnitud</p>
          <div className="prep-chart">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={perfil?.distribucion_magnitudes || []} margin={{ top: 12, right: 12, left: -18, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="intervalo" tick={{ fontSize: 11 }}/>
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }}/>
                <Tooltip/>
                <Bar dataKey="cantidad" name="Eventos" fill="#087e98" radius={[6, 6, 0, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="prep-card">
          <h3>Registros por institución</h3>
          <p>Procedencia de las observaciones analizadas</p>
          <div className="prep-chart">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={fuentes} layout="vertical" margin={{ top: 12, right: 30, left: 6, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false}/>
                <XAxis type="number" allowDecimals={false}/>
                <YAxis dataKey="nombre" type="category" width={55}/>
                <Tooltip/>
                <Bar dataKey="cantidad" name="Registros" fill="#18a99b" radius={[0, 6, 6, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      <div className="prep-grid">
        <article className="prep-card">
          <h3>Resumen estadístico</h3>
          <div className="prep-detail"><span>Media de magnitud</span><strong>{numero(perfil?.magnitud.media)}</strong></div>
          <div className="prep-detail"><span>Mediana de magnitud</span><strong>{numero(perfil?.magnitud.mediana)}</strong></div>
          <div className="prep-detail"><span>Primer cuartil (Q1)</span><strong>{numero(perfil?.magnitud.q1)}</strong></div>
          <div className="prep-detail"><span>Tercer cuartil (Q3)</span><strong>{numero(perfil?.magnitud.q3)}</strong></div>
          <div className="prep-detail"><span>Rango intercuartílico (IQR)</span><strong>{numero(perfil?.magnitud.iqr)}</strong></div>
          <div className="prep-detail"><span>Mediana de profundidad</span><strong>{numero(perfil?.profundidad.mediana)} km</strong></div>
        </article>
        <article className="prep-card">
          <h3><ShieldCheck size={18}/> Diagnóstico de calidad</h3>
          <p>Clasificación de los datos registrados, sin modificar el catálogo original.</p>
          <div className="prep-detail"><span>Válidos</span><strong>{numero(validos)}</strong></div>
          <div className="prep-detail"><span>Incompletos</span><strong>{numero(perfil?.estados_calidad.INCOMPLETO ?? 0)}</strong></div>
          <div className="prep-detail"><span>Revisar</span><strong>{numero(revisionNecesaria)}</strong></div>
          <div className="prep-detail"><span>Profundidades faltantes</span><strong>{numero(perfil?.profundidad.faltantes)}</strong></div>
          <p className="prep-note"><AlertTriangle size={16}/> Los valores atípicos detectados mediante IQR no se eliminan automáticamente.</p>
        </article>
      </div>

      <article className="prep-card">
        <h3>Vista previa de datos preparados</h3>
        <p>{numero(vista?.total)} registros coinciden con los filtros. Se muestran hasta 80 observaciones.</p>
        <div className="prep-table-wrap"><table className="prep-table">
          <thead><tr><th>Fecha (Perú)</th><th>Fuente</th><th>Magnitud</th><th>Profundidad</th><th>Latitud</th><th>Longitud</th><th>Calidad</th></tr></thead>
          <tbody>
            {vista?.registros.map(r => <tr key={r.id}>
              <td>{fecha(r.fecha_utc)}</td>
              <td>{r.fuente}</td>
              <td><strong>{numero(r.magnitud)}</strong></td>
              <td>{r.profundidad_km === null ? "—" : `${numero(r.profundidad_km)} km`}</td>
              <td>{r.latitud.toFixed(4)}</td>
              <td>{r.longitud.toFixed(4)}</td>
              <td title={r.banderas.join(", ")}>{r.estado_calidad}</td>
            </tr>)}
            {!cargando && !vista?.registros.length && <tr><td colSpan={7}>No hay registros para estos filtros.</td></tr>}
          </tbody>
        </table></div>
      </article>
      <p className="prep-footer">Se mantienen los registros originales de USGS e IGP. Los análisis estadísticos no constituyen predicciones de terremotos.</p>
    </section>
  );
}
