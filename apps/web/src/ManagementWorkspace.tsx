import { useCallback, useContext, useEffect, useState } from "react";
import { Activity, RefreshCw, Save, ShieldCheck, Users } from "lucide-react";
import { TokenContext, UsuarioContext } from "./AuthGate";
import "./preparation.css";
import "./management.css";
import "./operations-enterprise.css";
import UserCreateForm from "./UserCreateForm";
import {apiError} from "./apiErrors";

type Usuario = { id: string; nombre: string; email: string; estado: string; roles: string[]; creado_utc: string | null; ultimo_acceso_utc: string | null };
type Rol = { id: string; nombre: string; descripcion: string | null; usuarios: number; permisos: string[] };
type Auditoria = { id: string; accion: string; entidad: string; entidad_id: string | null; actor: string; fecha_utc: string; correlacion: string | null };
type Sistema = { base_datos: string; usuarios: number; roles: number; fuentes: number; eventos: number; reglas: number; alertas_pendientes: number; entradas_auditoria: number; sincronizaciones: { nombre: string; fecha_utc: string | null }[]; fecha_consulta_utc: string; aviso: string };

export default function ManagementWorkspace({ seccion }: { seccion: "usuarios" | "auditoria" }) {
  const token = useContext(TokenContext);
  const sesion = useContext(UsuarioContext);
  const administrador = Boolean(sesion?.permisos.includes("*"));
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [historial, setHistorial] = useState<Auditoria[]>([]);
  const [totalAuditoria, setTotalAuditoria] = useState(0);
  const [paginaAuditoria, setPaginaAuditoria] = useState(1);
  const [sistema, setSistema] = useState<Sistema | null>(null);
  const [buscarUsuario, setBuscarUsuario] = useState("");
  const [buscarAuditoria, setBuscarAuditoria] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const consultar = useCallback(async (ruta: string, opciones: RequestInit = {}) => {
    const r = await fetch(`/api/v1/management${ruta}`, {
      ...opciones, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    });
    const resultado = await r.json();
    if (!r.ok) throw new Error(typeof resultado.detail === "string" ? resultado.detail : `HTTP ${r.status}`);
    return resultado;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let vigente = true;
    async function cargar() {
      setCargando(true); setError("");
      try {
        if (seccion === "usuarios") {
          const [a, b] = await Promise.all([consultar("/users"), consultar("/roles")]);
          if (vigente) { setUsuarios(a.usuarios); setRoles(b.roles); }
        } else {
          const filtro = new URLSearchParams({ busqueda: buscarAuditoria, limite: "50", offset: String((paginaAuditoria - 1) * 50) });
          const [a, b] = await Promise.all([consultar(`/audit?${filtro}`), consultar("/system")]);
          if (vigente) { setHistorial(a.registros); setTotalAuditoria(a.total); setSistema(b); }
        }
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : "Error de administración");
      } finally { if (vigente) setCargando(false); }
    }
    void cargar();
    return () => { vigente = false; };
  }, [token, seccion, buscarAuditoria, paginaAuditoria, revision, consultar]);

  function alternarRol(nombre: string, marcado: boolean) {
    setSeleccion(actual => marcado ? [...actual, nombre] : actual.filter(r => r !== nombre));
  }

  async function guardarRoles(id: string) {
    if (!seleccion.length) { setError("Selecciona al menos un rol"); return; }
    setGuardando(true); setError(""); setMensaje("");
    try {
      await consultar(`/users/${id}/roles`, { method: "PATCH", body: JSON.stringify({ roles: seleccion }) });
      setEditando(null);
      setMensaje("Roles actualizados y operación auditada. Los permisos se verifican en cada solicitud.");
      setRevision(n => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron actualizar los roles");
    } finally { setGuardando(false); }
  }

  const numero = (n: number | undefined) => n === undefined ? "—" : n.toLocaleString("es-PE");

  async function cambiarEstado(user:Usuario) {
    setGuardando(true); setError(""); setMensaje("");
    try {
      await consultar(`/users/${user.id}/status`, {method:"PATCH", body:JSON.stringify({estado:user.estado === "active" ? "inactive" : "active"})});
      setRevision(n => n+1); setMensaje("Estado actualizado y auditado. Las cuentas inactivas no pueden acceder a la API.");
    } catch(e) { setError(e instanceof Error ? e.message : "No se pudo cambiar el estado"); }
    finally { setGuardando(false); }
  }

  async function exportarAuditoria() {
    setGuardando(true); setError("");
    try {
      const query = new URLSearchParams({busqueda:buscarAuditoria, dias:"365"});
      const response = await fetch(`/api/v1/management/audit/export?${query}`, {headers:{Authorization:`Bearer ${token}`}});
      if (!response.ok) throw Error(await apiError(response,"No se pudo exportar la auditoría"));
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href=url; anchor.download="SISMOIA_auditoria.csv"; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url),1000);
      setMensaje("Auditoría exportada: hasta 10 000 operaciones del último año, con el filtro de búsqueda actual.");
      setRevision(n => n+1);
    } catch(e) { setError(e instanceof Error ? e.message : "No se pudo exportar"); }
    finally { setGuardando(false); }
  }
  const fecha = (v: string | null) => v ? new Date(v).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "Sin registro";
  const filtrados = usuarios.filter(u => `${u.nombre} ${u.email} ${u.roles.join(" ")}`.toLowerCase().includes(buscarUsuario.toLowerCase()));

  return <section className="prep-root">
    <header className="prep-header">
      <div><h2>{seccion === "usuarios" ? <Users size={23}/> : <ShieldCheck size={23}/>} {seccion === "usuarios" ? "Usuarios y roles" : "Auditoría y configuración"}</h2>
        <p>{seccion === "usuarios" ? "Administración de accesos y permisos por rol" : "Trazabilidad de operaciones y estado técnico de SISMOIA"}</p></div>
      <div className="prep-actions"><button disabled={cargando} onClick={() => setRevision(n => n + 1)}><RefreshCw size={16}/> Actualizar</button>
        {seccion === "auditoria" && <button disabled={guardando} onClick={() => void exportarAuditoria()}>Exportar auditoría CSV</button>}</div>
    </header>
    {cargando && <p className="prep-loading">Consultando PostgreSQL...</p>}
    {error && <p className="prep-error" role="alert">{error}</p>}
    {mensaje && <p className="management-ok" role="status">{mensaje}</p>}
    {seccion === "usuarios" ? <>
      <div className="prep-metrics">
        <article><span>Usuarios registrados</span><strong>{numero(usuarios.length)}</strong></article>
        <article><span>Cuentas activas</span><strong>{numero(usuarios.filter(u => u.estado === "active").length)}</strong></article>
        <article><span>Roles disponibles</span><strong>{numero(roles.length)}</strong></article>
      </div>
      <UserCreateForm roles={roles} onCreated={() => setRevision(n => n + 1)} />
      <article className="prep-card">
        <div className="management-heading"><h3>Cuentas de usuario</h3>
          <input aria-label="Buscar usuarios" placeholder="Buscar por nombre, correo o rol..." value={buscarUsuario} onChange={e => setBuscarUsuario(e.target.value)}/>
        </div>
        <div className="prep-table-wrap"><table className="prep-table">
          <thead><tr><th>Usuario</th><th>Estado</th><th>Roles</th><th>Último acceso</th><th>Administración</th></tr></thead>
          <tbody>{filtrados.map(u => <tr key={u.id}>
            <td><strong>{u.nombre}</strong><small className="management-small">{u.email}</small></td>
            <td>{u.estado === "active" ? "Activo" : u.estado === "inactive" ? "Inactivo" : u.estado}</td>
            <td>{u.roles.join(", ") || "Sin rol"}</td>
            <td>{fecha(u.ultimo_acceso_utc)}</td>
            <td>{administrador && u.id !== sesion?.id && <button disabled={guardando} onClick={() => { setEditando(u.id === editando ? null : u.id); setSeleccion(u.roles); }}>
              {editando === u.id ? "Cerrar" : "Editar roles"}</button>}
              {administrador && u.id !== sesion?.id && <button disabled={guardando} onClick={() => void cambiarEstado(u)}>{u.estado === "active" ? "Desactivar cuenta" : "Activar cuenta"}</button>}</td>
          </tr>)}</tbody>
        </table></div>
        {editando && <div className="management-editor">
          <h4>Asignar roles a {usuarios.find(u => u.id === editando)?.nombre}</h4>
          <div className="management-options">{roles.map(r => <label key={r.id}>
            <input type="checkbox" checked={seleccion.includes(r.nombre)} onChange={e => alternarRol(r.nombre, e.target.checked)}/>{r.nombre}
          </label>)}</div>
          <button disabled={guardando || !seleccion.length} onClick={() => void guardarRoles(editando)}><Save size={15}/> Guardar permisos</button>
          <p>Los permisos y el estado de la cuenta se verifican en cada solicitud.</p>
        </div>}
      </article>
      <article className="prep-card"><h3>Roles y permisos configurados</h3>
        <div className="management-roles">{roles.map(r => <details key={r.id}>
          <summary><strong>{r.nombre}</strong><span>{r.usuarios} usuarios · {r.permisos.includes("*") ? "Acceso administrativo" : `${r.permisos.length} permisos`}</span></summary>
          <p>{r.descripcion || "Rol registrado en PostgreSQL"}</p>
          <div>{r.permisos.includes("*") ? "Todos los permisos" : r.permisos.join(" · ")}</div>
        </details>)}</div>
      </article>
    </> : <>
      <div className="prep-metrics">
        <article><span>Base de datos</span><strong>{sistema?.base_datos ?? "—"}</strong></article>
        <article><span>Registros sísmicos</span><strong>{numero(sistema?.eventos)}</strong></article>
        <article><span>Fuentes de datos</span><strong>{numero(sistema?.fuentes)}</strong></article>
        <article><span>Alertas pendientes</span><strong>{numero(sistema?.alertas_pendientes)}</strong></article>
        <article><span>Entradas de auditoría</span><strong>{numero(sistema?.entradas_auditoria)}</strong></article>
        <article><span>Reglas registradas</span><strong>{numero(sistema?.reglas)}</strong></article>
      </div>
      <article className="prep-card"><h3><Activity size={18}/> Estado y configuración visible</h3>
        <div className="management-status"><span>Zona horaria de visualización</span><strong>America/Lima</strong></div>
        <div className="management-status"><span>Última consulta</span><strong>{fecha(sistema?.fecha_consulta_utc ?? null)}</strong></div>
        {sistema?.sincronizaciones.map(f => <div className="management-status" key={f.nombre}>
          <span>Sincronización registrada · {f.nombre}</span><strong>{fecha(f.fecha_utc)}</strong>
        </div>)}
        <p className="management-small">{sistema?.aviso}</p>
      </article>
      <article className="prep-card">
        <div className="management-heading"><h3>Historial de auditoría ({numero(totalAuditoria)})</h3>
          <input aria-label="Filtrar auditoría" placeholder="Filtrar acción o entidad..." value={buscarAuditoria} onChange={e => { setBuscarAuditoria(e.target.value); setPaginaAuditoria(1); }}/>
        </div>
        <div className="prep-table-wrap"><table className="prep-table">
          <thead><tr><th>Fecha</th><th>Acción</th><th>Usuario responsable</th><th>Entidad</th><th>ID entidad</th></tr></thead>
          <tbody>{historial.map(a => <tr key={a.id}>
            <td>{fecha(a.fecha_utc)}</td><td>{a.accion}</td><td>{a.actor}</td><td>{a.entidad}</td>
            <td className="management-identifier">{a.entidad_id || "—"}<small>Correlación: {a.correlacion || "Sin identificador"}</small></td>
          </tr>)}</tbody>
        </table></div>
        <div className="ops-audit-pagination">
          <button
            disabled={paginaAuditoria <= 1 || cargando}
            onClick={() => setPaginaAuditoria(p => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span>
            Página {paginaAuditoria} de {Math.max(1, Math.ceil(totalAuditoria / 50))}
          </span>
          <button
            disabled={cargando || paginaAuditoria >= Math.ceil(totalAuditoria / 50)}
            onClick={() => setPaginaAuditoria(p => p + 1)}
          >
            Siguiente
          </button>
        </div>
        <p className="management-small">
          Se muestran 50 operaciones por página.
          No se exponen secretos ni contraseñas.
        </p>
      </article>
    </>}
  </section>;
}
