import { useContext, useEffect, useState } from "react";
import { Database, RefreshCw, Radio } from "lucide-react";
import { TokenContext } from "./AuthGate";
import "./preparation.css";
import "./reporting.css";

type Fuente = {
  id: string; nombre: string; organizacion: string | null;
  tipo: string | null; estado: string; licencia: string | null;
  ultima_sincronizacion_utc: string | null;
  ultima_recepcion_utc: string | null;
  ultimo_evento_utc: string | null; registros: number;
};
type Datos = { total_fuentes: number; total_registros: number; fuentes: Fuente[]; observacion: string };

export default function SourcesWorkspace() {
  const token = useContext(TokenContext);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    async function consultar() {
      setCargando(true); setError("");
      try {
        const r = await fetch("/api/v1/sources", {
          headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal
        });
        if (!r.ok) throw new Error(`Consulta de fuentes: HTTP ${r.status}`);
        const resultado: Datos = await r.json();
        if (!ctrl.signal.aborted) setDatos(resultado);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Error consultando fuentes");
      } finally { if (!ctrl.signal.aborted) setCargando(false); }
    }
    void consultar();
    return () => ctrl.abort();
  }, [token, revision]);

  const numero = (n: number | undefined) => n == null ? "—" : n.toLocaleString("es-PE");
  const fecha = (v: string | null) => v ? new Date(v).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "No registrada";

  return <section className="prep-root">
    <header className="prep-header">
      <div><h2><Radio size={23}/> Fuentes de datos</h2>
        <p>Procedencia, cobertura y seguimiento de los catálogos sísmicos integrados.</p></div>
      <div className="prep-actions"><button disabled={cargando} onClick={() => setRevision(v => v + 1)}>
        <RefreshCw size={16}/> Actualizar
      </button></div>
    </header>
    {cargando && <p className="prep-loading">Consultando proveedores...</p>}
    {error && <p role="alert" className="prep-error">{error}</p>}
    <div className="prep-metrics">
      <article><span>Fuentes registradas</span><strong>{numero(datos?.total_fuentes)}</strong></article>
      <article><span>Registros almacenados</span><strong>{numero(datos?.total_registros)}</strong></article>
      <article><span>Fuentes con observaciones</span><strong>{datos ? numero(datos.fuentes.filter(f => f.registros > 0).length) : "—"}</strong></article>
    </div>
    <article className="prep-card"><h3><Database size={18}/> Catálogos conectados</h3>
      <div className="prep-table-wrap"><table className="prep-table">
        <thead><tr><th>Fuente</th><th>Organización</th><th>Estado</th><th>Registros</th><th>Último evento</th><th>Última recepción</th><th>Sincronización registrada</th></tr></thead>
        <tbody>{datos?.fuentes.map(f => <tr key={f.id}>
          <td><strong>{f.nombre}</strong><small className="rep-small">{f.tipo || "Catálogo"} · {f.licencia || "Licencia no informada"}</small></td>
          <td>{f.organizacion || "No indicada"}</td><td>{f.estado}</td>
          <td>{numero(f.registros)}</td><td>{fecha(f.ultimo_evento_utc)}</td>
          <td>{fecha(f.ultima_recepcion_utc)}</td><td>{fecha(f.ultima_sincronizacion_utc)}</td>
        </tr>)}</tbody>
      </table></div>
      {datos && datos.fuentes.length === 0 && <p>No hay fuentes registradas.</p>}
    </article>
    <p className="rep-note">{datos?.observacion ?? "Los conteos corresponden a registros almacenados, no necesariamente a terremotos únicos."} La fecha del último evento no siempre coincide con la fecha de recepción.</p>
  </section>;
}
