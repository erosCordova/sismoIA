import { useContext, useEffect, useState, type FormEvent } from "react";
import { Bell, ShieldAlert, RefreshCw, Plus } from "lucide-react";
import { TokenContext, UsuarioContext } from "./AuthGate";
import "./preparation.css";
import "./alerts.css";

type Regla = { id: string; nombre: string; magnitud_minima: number; profundidad_maxima: number | null; solo_peru: boolean; habilitada: boolean };
type Alerta = { id: string; regla: string; estado: string; severidad: string; fuente: string; magnitud: number; lugar: string | null; fecha_evento_utc: string };
type Accion = { id: string; accion: string; detalle: string | null; fecha_utc: string };
type Seccion = "reglas" | "centro";

export default function AlertsWorkspace({ seccion }: { seccion: Seccion }) {
  const token = useContext(TokenContext);
  const usuario = useContext(UsuarioContext);
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [nombre, setNombre] = useState("");
  const [magnitud, setMagnitud] = useState("4");
  const [profundidad, setProfundidad] = useState("");
  const [soloPeru, setSoloPeru] = useState(true);
  const [estado, setEstado] = useState("");
  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const permite = (p: string) => Boolean(usuario?.permisos.includes("*") || usuario?.permisos.includes(p));
  const administrar = permite("rules:manage");
  const aprobar = permite("alerts:approve");
  const auditar = permite("audit:read");

  async function api(ruta: string, opciones: RequestInit = {}) {
    if (!token) throw new Error("Sesión no disponible");
    const r = await fetch(`/api/v1/alerts${ruta}`, {
      ...opciones,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    });
    const datos = await r.json();
    if (!r.ok) throw new Error(typeof datos.detail === "string" ? datos.detail : `HTTP ${r.status}`);
    return datos;
  }

  useEffect(() => {
    if (!token) return;
    let vigente = true;
    async function consultar() {
      setError("");
      try {
        if (seccion === "reglas") {
          const d = await api("/rules");
          if (vigente) setReglas(d.reglas);
        } else {
          const filtro = estado ? `?estado=${estado}` : "";
          const resultados = await Promise.all([
            api(filtro),
            auditar ? api("/history") : Promise.resolve({ acciones: [] })
          ]);
          if (vigente) { setAlertas(resultados[0].alertas); setAcciones(resultados[1].acciones); }
        }
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : "Error consultando alertas");
      }
    }
    void consultar();
    return () => { vigente = false; };
  }, [token, seccion, estado, revision]);

  async function ejecutar(accion: () => Promise<unknown>, mensajeExito: string) {
    setCargando(true); setError(""); setMensaje("");
    try {
      await accion();
      setMensaje(mensajeExito);
      setRevision(v => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error en la operación");
    } finally { setCargando(false); }
  }

  function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ejecutar(async () => {
      await api("/rules", { method: "POST", body: JSON.stringify({
        nombre, magnitud_minima: Number(magnitud),
        profundidad_maxima: profundidad === "" ? null : Number(profundidad),
        solo_peru: soloPeru
      }) });
      setNombre("");
    }, "Regla creada correctamente");
  }

  const fecha = (v: string) => new Date(v).toLocaleString("es-PE", { timeZone: "America/Lima" });
  return <section className="prep-root">
    <header className="prep-header">
      <div><h2>{seccion === "reglas" ? <ShieldAlert size={23}/> : <Bell size={23}/>} {seccion === "reglas" ? "Reglas de alertas" : "Centro de alertas"}</h2>
        <p>Alertas internas sobre eventos sísmicos observados de USGS e IGP</p></div>
      <div className="prep-actions">
        <button disabled={cargando} onClick={() => setRevision(v => v + 1)}><RefreshCw size={16}/> Actualizar</button>
        {administrar && <button disabled={cargando} onClick={() => void ejecutar(() => api("/evaluate?dias=7", { method: "POST" }), "Eventos evaluados. Consulta las alertas pendientes.")}>Evaluar eventos</button>}
      </div>
    </header>
    {error && <p className="prep-error" role="alert">{error}</p>}
    {mensaje && <p className="alert-message" role="status">{mensaje}</p>}
    <p className="alert-disclaimer">Avisos internos sujetos a revisión. No son predicciones ni alertas tempranas oficiales.</p>
    {seccion === "reglas" ? <>
      {administrar && <article className="prep-card">
        <h3><Plus size={18}/> Crear nueva regla</h3>
        <form className="alert-form" onSubmit={crear}>
          <label>Nombre<input required minLength={3} maxLength={120} value={nombre} onChange={e => setNombre(e.target.value)}/></label>
          <label>Magnitud mínima<input type="number" required min={0} max={9.9} step={0.1} value={magnitud} onChange={e => setMagnitud(e.target.value)}/></label>
          <label>Profundidad máxima (opcional)<input type="number" min={0} max={750} step={1} value={profundidad} onChange={e => setProfundidad(e.target.value)}/></label>
          <label className="alert-check"><input type="checkbox" checked={soloPeru} onChange={e => setSoloPeru(e.target.checked)}/> Solo zona de Perú</label>
          <button type="submit" disabled={cargando}>Guardar regla</button>
        </form>
      </article>}
      <article className="prep-card"><h3>Reglas registradas ({reglas.length})</h3>
        <div className="prep-table-wrap"><table className="prep-table">
          <thead><tr><th>Nombre</th><th>Magnitud</th><th>Profundidad</th><th>Cobertura</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody>{reglas.map(r => <tr key={r.id}>
            <td>{r.nombre}</td><td>M ≥ {r.magnitud_minima}</td><td>{r.profundidad_maxima ?? "Sin límite"}</td>
            <td>{r.solo_peru ? "Perú" : "Mundo"}</td><td>{r.habilitada ? "Activa" : "Desactivada"}</td>
            <td>{administrar && <button disabled={cargando} onClick={() => void ejecutar(() => api(`/rules/${r.id}`, { method: "PATCH", body: JSON.stringify({ habilitada: !r.habilitada }) }), "Regla actualizada")}>{r.habilitada ? "Desactivar" : "Activar"}</button>}</td>
          </tr>)}</tbody>
        </table></div>
      </article>
    </> : <>
      <div className="prep-actions"><select aria-label="Estado de alerta" value={estado} onChange={e => setEstado(e.target.value)}>
        <option value="">Todas</option><option value="pending">Pendientes</option><option value="approved">Aprobadas</option><option value="dismissed">Descartadas</option>
      </select></div>
      <article className="prep-card"><h3>Alertas registradas ({alertas.length})</h3>
        <div className="prep-table-wrap"><table className="prep-table">
          <thead><tr><th>Fecha</th><th>Fuente</th><th>Ubicación</th><th>Magnitud</th><th>Regla</th><th>Estado</th><th>Revisión</th></tr></thead>
          <tbody>{alertas.map(a => <tr key={a.id}>
            <td>{fecha(a.fecha_evento_utc)}</td><td>{a.fuente}</td><td>{a.lugar || "Sin descripción"}</td>
            <td>{a.magnitud}</td><td>{a.regla}</td><td>{a.estado}</td>
            <td>{aprobar && a.estado === "pending" && <div className="alert-buttons">
              <button disabled={cargando} onClick={() => void ejecutar(() => api(`/${a.id}/review`, { method: "POST", body: JSON.stringify({ decision: "approved" }) }), "Alerta aprobada")}>Aprobar</button>
              <button disabled={cargando} onClick={() => void ejecutar(() => api(`/${a.id}/review`, { method: "POST", body: JSON.stringify({ decision: "dismissed" }) }), "Alerta descartada")}>Descartar</button>
            </div>}</td>
          </tr>)}</tbody>
        </table></div>
      </article>
      {auditar && <article className="prep-card"><h3>Historial de operaciones</h3>
        <div className="prep-table-wrap"><table className="prep-table">
          <thead><tr><th>Fecha</th><th>Acción</th><th>Detalle</th></tr></thead>
          <tbody>{acciones.map(a => <tr key={a.id}><td>{fecha(a.fecha_utc)}</td><td>{a.accion}</td><td>{a.detalle || "—"}</td></tr>)}</tbody>
        </table></div>
      </article>}
    </>}
  </section>;
}
