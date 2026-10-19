import EmailNotificationsPanel from "./EmailNotificationsPanel";
import {
  useContext, useEffect, useState,
  type FormEvent
} from "react";
import {
  Bell, ShieldAlert, RefreshCw, Plus,
  Search, Eye, X, CheckCircle2,
  AlertTriangle, ExternalLink
} from "lucide-react";
import {
  TokenContext, UsuarioContext
} from "./AuthGate";
import "./preparation.css";
import "./alerts.css";
import "./alerts-enterprise.css";
import DeliveriesPanel from "./DeliveriesPanel";

type Regla = {
  id: string;
  nombre: string;
  magnitud_minima: number;
  profundidad_maxima: number | null;
  solo_peru: boolean;
  habilitada: boolean;
  fuente_permitida: string | null;
};

type Alerta = {
  id: string;
  regla_id: string;
  evento_id: string;
  regla: string;
  estado: string;
  severidad: string;
  fuente: string;
  titulo?: string;
  mensaje?: string;
  magnitud: number;
  profundidad_km: number | null;
  lugar: string | null;
  url_fuente: string | null;
  fecha_evento_utc: string;
  creada_utc: string;
  revisada_utc: string | null;
  revisor_id: string | null;
};

type Accion = {
  id?: string;
  accion: string;
  detalle: string | null;
  fecha_utc: string;
};

type Detalle = Alerta & {
  id_externo: string;
  latitud: number;
  longitud: number;
  tipo_magnitud: string | null;
  fecha_recepcion_utc: string | null;
  regla_configuracion: Regla;
  historial: Accion[];
  entrega: {
    estado: string;
    canal: string | null;
    destinatarios: string[] | null;
    entregada_utc: string | null;
    intentos?: number;
    ultimo_intento_utc?: string | null;
    error?: string | null;
    acuse?: string | null;
  };
};

type Resumen = {
  total: number;
  pendientes: number;
  aprobadas: number;
  descartadas: number;
  reglas_activas: number;
  reglas_totales: number;
  envio_externo: boolean;
  por_severidad?: Record<string, number>;
};

type Bandeja = {
  total: number;
  pagina: number;
  paginas: number;
  limite: number;
  alertas: Alerta[];
};

type Simulacion = {
  nombre: string;
  periodo_dias: number;
  eventos_examinados: number;
  coincidencias: number;
  consulta_limitada: boolean;
  por_fuente: Record<string, number>;
  por_severidad?: Record<string, number>;
  fuente_permitida?: string | null;
  muestra: {
    id: string;
    fecha_utc: string;
    fuente: string;
    magnitud: number;
    profundidad_km: number | null;
    lugar: string | null;
  }[];
  advertencia: string;
};

type Formulario = {
  nombre: string;
  magnitud_minima: string;
  profundidad_maxima: string;
  solo_peru: boolean;
  dias: string;
};

const inicial: Formulario = {
  nombre: "",
  magnitud_minima: "4",
  profundidad_maxima: "",
  solo_peru: true,
  dias: "7"
};

const numero = (n: number) =>
  n.toLocaleString("es-PE");

function fecha(v: string | null | undefined) {
  if (!v) return "No registrada";

  return new Date(v).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short"
  });
}

function estadoNombre(valor: string) {
  const nombres: Record<string, string> = {
    pending: "Pendiente",
    approved: "Aprobada",
    dismissed: "Descartada",
    critical: "Crítica",
    warning: "Advertencia"
  };

  return nombres[valor] ?? valor;
}

export default function AlertsWorkspace({
  seccion
}: {
  seccion: "reglas" | "centro"
}) {
  const token = useContext(TokenContext);
  const usuario = useContext(UsuarioContext);

  const permisos = usuario?.permisos ?? [];

  const permite = (permiso: string) =>
    permisos.includes("*") ||
    permisos.includes(permiso);

  const administrar = permite("rules:manage");
  const aprobar = permite("alerts:approve");
  const auditar = permite("audit:read");

  const [reglas, setReglas] = useState<Regla[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const [formulario, setFormulario] =
    useState<Formulario>(inicial);

  const [simulacion, setSimulacion] =
    useState<Simulacion | null>(null);

  const [estado, setEstado] = useState("");
  const [severidad, setSeveridad] = useState("");
  const [fuente, setFuente] = useState("");

  const [fuenteSimulacion, setFuenteSimulacion] =
    useState("");

  const [buscar, setBuscar] = useState("");
  const [magnitudBusqueda, setMagnitudBusqueda] =
    useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [consulta, setConsulta] = useState({
    q: "",
    magnitud_min: "",
    desde: "",
    hasta: ""
  });
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [totalFiltrado, setTotalFiltrado] = useState(0);

  const [seleccionado, setSeleccionado] =
    useState<string | null>(null);

  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [errorDetalle, setErrorDetalle] = useState("");

  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [operando, setOperando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  async function api(
    ruta: string,
    opciones: RequestInit = {}
  ) {
    if (!token) {
      throw new Error("Sesión no disponible");
    }

    const r = await fetch(
      `/api/v1/alerts${ruta}`,
      {
        ...opciones,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...opciones.headers
        }
      }
    );

    const resultado = await r.json();

    if (!r.ok) {
      throw new Error(
        typeof resultado.detail === "string"
          ? resultado.detail
          : `HTTP ${r.status}`
      );
    }

    return resultado;
  }

  useEffect(() => {
    if (!token) return;

    let vigente = true;

    async function cargar() {
      setCargando(true);
      setError("");

      try {
        if (seccion === "reglas") {
          const [r, s] = await Promise.all([
            api("/rules"),
            api("/summary")
          ]);

          if (vigente) {
            setReglas(r.reglas);
            setResumen(s);
          }
        } else {
          const params = new URLSearchParams({
            pagina: String(pagina),
            limite: "25"
          });

          if (estado) params.set("estado", estado);
          if (severidad) params.set("severidad", severidad);
          if (fuente) {
            params.set("fuente", fuente);
          }

          Object.entries(consulta).forEach(
            ([clave, valor]) => {
              if (valor) params.set(clave, valor);
            }
          );

          const [r, s] = await Promise.all([
            api(`/inbox?${params}`),
            api("/summary")
          ]);

          if (!vigente) return;

          const bandeja: Bandeja = r;

          setAlertas(bandeja.alertas);
          setTotalFiltrado(bandeja.total);
          setPaginas(bandeja.paginas);
          setResumen(s);

          if (auditar) {
            try {
              const historial = await api("/history");

              if (vigente) {
                setAcciones(historial.acciones);
              }
            } catch {
              if (vigente) setAcciones([]);
            }
          }
        }
      } catch (e) {
        if (vigente) {
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron consultar las alertas"
          );
        }
      } finally {
        if (vigente) setCargando(false);
      }
    }

    void cargar();

    return () => {
      vigente = false;
    };

  }, [
    token, seccion, estado, severidad,
    fuente, pagina, revision, auditar, consulta
  ]);

  useEffect(() => {
    if (!token || !seleccionado) return;

    let vigente = true;

    async function consultarDetalle() {
      setDetalle(null);
      setErrorDetalle("");

      try {
        const resultado: Detalle = await api(
          `/inbox/${seleccionado}`
        );

        if (vigente) setDetalle(resultado);
      } catch (e) {
        if (vigente) {
          setErrorDetalle(
            e instanceof Error
              ? e.message
              : "No se pudo consultar la alerta"
          );
        }
      }
    }

    void consultarDetalle();

    return () => {
      vigente = false;
    };

  }, [token, seleccionado, revision]);

  async function ejecutar(
    accion: () => Promise<unknown>,
    exito: string
  ) {
    setOperando(true);
    setError("");
    setMensaje("");

    try {
      await accion();
      setMensaje(exito);
      setRevision(v => v + 1);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Error en la operación"
      );
    } finally {
      setOperando(false);
    }
  }

  function payload(f: Formulario) {
    return {
      nombre: f.nombre.trim(),
      magnitud_minima: Number(f.magnitud_minima),
      profundidad_maxima:
        f.profundidad_maxima === ""
          ? null
          : Number(f.profundidad_maxima),
      solo_peru: f.solo_peru
    };
  }

  function validarFormulario(f: Formulario) {
    if (f.nombre.trim().length < 3) {
      setError("El nombre debe tener al menos 3 caracteres.");
      return false;
    }

    if (
      !Number.isFinite(Number(f.magnitud_minima)) ||
      Number(f.magnitud_minima) < 0 ||
      Number(f.magnitud_minima) > 9.9
    ) {
      setError("Magnitud fuera de rango.");
      return false;
    }

    if (
      f.profundidad_maxima !== "" &&
      (
        Number(f.profundidad_maxima) < 0 ||
        Number(f.profundidad_maxima) > 750
      )
    ) {
      setError("Profundidad fuera de rango.");
      return false;
    }

    return true;
  }

  function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!validarFormulario(formulario)) return;

    void ejecutar(
      () => api("/rules", {
        method: "POST",
        body: JSON.stringify({...payload(formulario), fuente_permitida: fuenteSimulacion || null})
      }),
      "Regla creada. Revisa su estado antes de evaluar eventos."
    );

    setSimulacion(null);
  }

  function simular(f: Formulario, fuentePermitida = fuenteSimulacion) {
    if (!validarFormulario(f)) return;

    setSimulacion(null);

    void ejecutar(
      async () => {
        const resultado: Simulacion = await api(
          "/simulate",
          {
            method: "POST",
            body: JSON.stringify({
              ...payload(f),
              dias: Number(f.dias),
              fuente_permitida: fuentePermitida || null
            })
          }
        );

        setSimulacion(resultado);
      },
      "Simulación completada sin crear alertas."
    );
  }

  function revisar(
    alerta: Alerta,
    decision: "approved" | "dismissed"
  ) {
    const nombre = decision === "approved"
      ? "aprobar"
      : "descartar";

    if (!window.confirm(
      `¿Confirmas que deseas ${nombre} esta alerta interna?`
    )) return;

    void ejecutar(
      () => api(
        `/${alerta.id}/review`,
        {
          method: "POST",
          body: JSON.stringify({decision})
        }
      ),
      decision === "approved"
        ? "Alerta aprobada internamente. No se ha enviado."
        : "Alerta descartada."
    );
  }

  function evaluar() {
    if (!window.confirm(
      "¿Evaluar los eventos de las últimas 3 horas y crear alertas internas " +
      "pendientes de revisión para las coincidencias nuevas? " +
      "No se enviarán mensajes externos."
    )) return;

    void ejecutar(
      () => api(
        "/evaluate?dias=7",
        {method: "POST"}
      ),
      "Evaluación terminada. Consulta la bandeja de pendientes."
    );
  }

  return (
    <section className="prep-root alrt-root">
      <header className="prep-header">
        <div>
          <h2>
            {seccion === "reglas"
              ? <ShieldAlert size={23}/>
              : <Bell size={23}/>}
            {seccion === "reglas"
              ? "Reglas de alertas"
              : "Centro de alertas"}
          </h2>

          <p>
            Monitoreo interno sobre eventos registrados
            por USGS e IGP
          </p>
        </div>

        <div className="prep-actions">
          <button
            disabled={cargando}
            onClick={() => setRevision(v => v + 1)}
          >
            <RefreshCw size={16}/>
            Actualizar
          </button>

          {administrar && (
            <button
              disabled={operando}
              onClick={evaluar}
            >
              <Search size={16}/>
              Evaluar eventos
            </button>
          )}
        </div>
      </header>

      <div className="alrt-notice">
        <AlertTriangle size={19}/>
        <div>
          <strong>Alertas internas sujetas a revisión</strong>
          <p>
            Las reglas detectan condiciones en sismos
            registrados. No predicen terremotos.
            Aprobar una alerta no implica enviarla.
          </p>
        </div>
      </div>

      {error && (
        <p className="prep-error" role="alert">
          {error}
        </p>
      )}

      {mensaje && (
        <p className="alert-message" role="status">
          {mensaje}
        </p>
      )}

      {cargando && (
        <p className="prep-loading">
          Consultando alertas...
        </p>
      )}

      <div className="prep-metrics">
        <article>
          <span>Reglas activas</span>
          <strong>
            {resumen
              ? numero(resumen.reglas_activas)
              : "—"}
          </strong>
        </article>

        <article>
          <span>Alertas pendientes</span>
          <strong>
            {resumen
              ? numero(resumen.pendientes)
              : "—"}
          </strong>
        </article>

        <article>
          <span>Alertas aprobadas</span>
          <strong>
            {resumen
              ? numero(resumen.aprobadas)
              : "—"}
          </strong>
        </article>

        <article>
          <span>Alertas descartadas</span>
          <strong>
            {resumen
              ? numero(resumen.descartadas)
              : "—"}
          </strong>
        </article>
      </div>

      <div className="ops-alert-strip" role="status">
        <span>
          <b>Envío externo:</b>{" "}
          {resumen?.envio_externo
            ? "Integración disponible"
            : "No implementado"}
        </span>

        <span>
          <b>Alertas críticas:</b>{" "}
          {numero(resumen?.por_severidad?.critical ?? 0)}
        </span>

        <span>
          <b>Advertencias:</b>{" "}
          {numero(resumen?.por_severidad?.warning ?? 0)}
        </span>

        <span>
          <b>Deduplicación:</b> evento y regla
        </span>
      </div>

      {seccion === "reglas" ? (
        <>
          {administrar && (
            <article className="prep-card">
              <h3>
                <Plus size={18}/>
                Constructor de reglas
              </h3>

              <p>
                Define una condición y pruébala con
                registros históricos antes de guardarla.
              </p>

              <form
                className="alrt-form"
                onSubmit={crear}
              >
                <label>
                  Nombre de la regla
                  <input
                    required
                    minLength={3}
                    maxLength={120}
                    value={formulario.nombre}
                    placeholder="Ej. Sismos mayores a M 5"
                    onChange={e => setFormulario(f => ({
                      ...f,
                      nombre: e.target.value
                    }))}
                  />
                </label>

                <label>
                  Magnitud mínima
                  <input
                    required
                    type="number"
                    min="0"
                    max="9.9"
                    step="0.1"
                    value={formulario.magnitud_minima}
                    onChange={e => setFormulario(f => ({
                      ...f,
                      magnitud_minima: e.target.value
                    }))}
                  />
                </label>

                <label>
                  Profundidad máxima (km)
                  <input
                    type="number"
                    min="0"
                    max="750"
                    step="0.1"
                    value={formulario.profundidad_maxima}
                    placeholder="Sin límite"
                    onChange={e => setFormulario(f => ({
                      ...f,
                      profundidad_maxima: e.target.value
                    }))}
                  />
                </label>

                <label>
                  Periodo de simulación
                  <select
                    value={formulario.dias}
                    onChange={e => setFormulario(f => ({
                      ...f,
                      dias: e.target.value
                    }))}
                  >
                    <option value="1">Últimas 24 horas</option>
                    <option value="7">Últimos 7 días</option>
                    <option value="30">Últimos 30 días</option>
                  </select>
                </label>

                <label>
                  Fuente permitida de la regla y simulación
                  <select
                    value={fuenteSimulacion}
                    onChange={e =>
                      setFuenteSimulacion(e.target.value)
                    }
                  >
                    <option value="">
                      Todas las fuentes
                    </option>
                    <option value="IGP">IGP</option>
                    <option value="USGS">USGS</option>
                  </select>
                  <small>
                    La misma fuente se usa al simular y al guardar la regla.
                  </small>
                </label>

                <label className="alrt-check">
                  <input
                    type="checkbox"
                    checked={formulario.solo_peru}
                    onChange={e => setFormulario(f => ({
                      ...f,
                      solo_peru: e.target.checked
                    }))}
                  />
                  Solo Perú
                </label>

                <div className="alrt-form-actions">
                  <button
                    type="button"
                    disabled={operando}
                    onClick={() => simular(formulario)}
                  >
                    <Search size={16}/>
                    Simular regla
                  </button>

                  <button
                    className="alrt-primary"
                    type="submit"
                    disabled={operando}
                  >
                    <Plus size={16}/>
                    Guardar regla
                  </button>
                </div>
              </form>
            </article>
          )}

          {simulacion && (
            <article className="prep-card">
              <h3>Resultado de la simulación</h3>

              <div className="prep-metrics">
                <article>
                  <span>Eventos examinados</span>
                  <strong>
                    {numero(simulacion.eventos_examinados)}
                  </strong>
                </article>

                <article>
                  <span>Coincidencias</span>
                  <strong>
                    {numero(simulacion.coincidencias)}
                  </strong>
                </article>

                <article>
                  <span>Ventana</span>
                  <strong>
                    {simulacion.periodo_dias} días
                  </strong>
                </article>
              </div>

              <p className="ops-chart-foot">
                Fuente permitida:{" "}
                {simulacion.fuente_permitida ||
                  "Todas las fuentes"}
                {" · "}
                Críticas (M 6+):{" "}
                {simulacion.por_severidad?.critical ?? 0}
                {" · "}
                Advertencias:{" "}
                {simulacion.por_severidad?.warning ?? 0}.
                Al guardar la regla se conserva esta condición.
              </p>

              {simulacion.consulta_limitada && (
                <p className="prep-loading">
                  La simulación examinó una muestra
                  limitada de registros.
                </p>
              )}

              <div className="prep-table-wrap">
                <table className="prep-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Fuente</th>
                      <th>Magnitud</th>
                      <th>Profundidad</th>
                      <th>Ubicación</th>
                    </tr>
                  </thead>

                  <tbody>
                    {simulacion.muestra.map(e => (
                      <tr key={e.id}>
                        <td>{fecha(e.fecha_utc)}</td>
                        <td>{e.fuente}</td>
                        <td>{e.magnitud}</td>
                        <td>
                          {e.profundidad_km === null
                            ? "—"
                            : `${e.profundidad_km} km`}
                        </td>
                        <td>
                          {e.lugar || "No informada"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="alrt-help">
                {simulacion.advertencia}
              </p>
            </article>
          )}

          <article className="prep-card">
            <h3>
              Reglas registradas ({reglas.length})
            </h3>

            <div className="prep-table-wrap">
              <table className="prep-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Magnitud</th>
                    <th>Profundidad</th>
                    <th>Zona</th>
                    <th>Fuente</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {reglas.map(r => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.nombre}</strong>
                      </td>

                      <td>
                        M ≥ {r.magnitud_minima}
                      </td>

                      <td>
                        {r.profundidad_maxima === null
                          ? "Sin límite"
                          : `${r.profundidad_maxima} km`}
                      </td>

                      <td>
                        {r.solo_peru
                          ? "Perú"
                          : "Mundo"}
                      </td>

                      <td>{r.fuente_permitida || "Todas"}</td>

                      <td>
                        <span className={
                          r.habilitada
                            ? "alrt-pill alrt-active"
                            : "alrt-pill"
                        }>
                          {r.habilitada
                            ? "Activa"
                            : "Desactivada"}
                        </span>
                      </td>

                      <td>
                        <div className="alrt-row-actions">
                          {administrar && (
                            <button
                              disabled={operando}
                              onClick={() => simular({
                                nombre: r.nombre,
                                magnitud_minima:
                                  String(r.magnitud_minima),
                                profundidad_maxima:
                                  r.profundidad_maxima === null
                                    ? ""
                                    : String(r.profundidad_maxima),
                                solo_peru: r.solo_peru,
                                dias: formulario.dias
                              }, r.fuente_permitida || "")}
                            >
                              Simular
                            </button>
                          )}

                          {administrar && (
                            <button
                              disabled={operando}
                              onClick={() => {
                                if (!window.confirm(
                                  r.habilitada
                                    ? "¿Desactivar esta regla?"
                                    : "¿Activar esta regla?"
                                )) return;

                                void ejecutar(
                                  () => api(
                                    `/rules/${r.id}`,
                                    {
                                      method: "PATCH",
                                      body: JSON.stringify({
                                        habilitada: !r.habilitada
                                      })
                                    }
                                  ),
                                  "Estado de regla actualizado."
                                );
                              }}
                            >
                              {r.habilitada
                                ? "Desactivar"
                                : "Activar"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {!reglas.length && !cargando && (
                    <tr>
                      <td colSpan={6}>
                        No existen reglas registradas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : (
        <>
          <article className="prep-card">
            <div className="alrt-filter-head">
              <h3>
                Bandeja priorizada de alertas
              </h3>

              <span>
                {numero(totalFiltrado)}
                {" "}coincidencias
              </span>
            </div>

            <form
              className="alrt-filters ops-alert-filters"
              onSubmit={e => {
                e.preventDefault();

                if (desde && hasta && desde > hasta) {
                  setError(
                    "La fecha inicial supera la final."
                  );
                  return;
                }

                setError("");

                setConsulta({
                  q: buscar.trim(),
                  magnitud_min: magnitudBusqueda,
                  desde,
                  hasta
                });

                setPagina(1);
              }}
            >
              <label>
                Estado
                <select
                  value={estado}
                  onChange={e => {
                    setEstado(e.target.value);
                    setPagina(1);
                  }}
                >
                  <option value="">Todos</option>
                  <option value="pending">
                    Pendientes
                  </option>
                  <option value="approved">
                    Aprobadas
                  </option>
                  <option value="dismissed">
                    Descartadas
                  </option>
                </select>
              </label>

              <label>
                Severidad
                <select
                  value={severidad}
                  onChange={e => {
                    setSeveridad(e.target.value);
                    setPagina(1);
                  }}
                >
                  <option value="">Todas</option>
                  <option value="critical">
                    Crítica
                  </option>
                  <option value="warning">
                    Advertencia
                  </option>
                </select>
              </label>

              <label>
                Fuente
                <select
                  value={fuente}
                  onChange={e => {
                    setFuente(e.target.value);
                    setPagina(1);
                  }}
                >
                  <option value="">Todas</option>
                  <option value="USGS">USGS</option>
                  <option value="IGP">IGP</option>
                </select>
              </label>

              <label>
                Buscar regla, localidad o ID
                <input
                  type="search"
                  maxLength={100}
                  value={buscar}
                  onChange={e => setBuscar(e.target.value)}
                  placeholder="Ej. Lima"
                />
              </label>

              <label>
                Magnitud mínima
                <input
                  type="number"
                  min="0"
                  max="9.9"
                  step="0.1"
                  value={magnitudBusqueda}
                  onChange={e =>
                    setMagnitudBusqueda(e.target.value)
                  }
                  placeholder="Cualquiera"
                />
              </label>

              <label>
                Desde (UTC)
                <input
                  type="date"
                  value={desde}
                  onChange={e => setDesde(e.target.value)}
                />
              </label>

              <label>
                Hasta (UTC)
                <input
                  type="date"
                  value={hasta}
                  onChange={e => setHasta(e.target.value)}
                />
              </label>

              <button
                type="submit"
                disabled={cargando}
              >
                Buscar en PostgreSQL
              </button>

              <button
                type="button"
                onClick={() => {
                  setBuscar("");
                  setMagnitudBusqueda("");
                  setDesde("");
                  setHasta("");

                  setConsulta({
                    q: "",
                    magnitud_min: "",
                    desde: "",
                    hasta: ""
                  });

                  setPagina(1);
                }}
              >
                Limpiar búsqueda
              </button>
            </form>

            <div className="prep-table-wrap">
              <table className="prep-table">
                <thead>
                  <tr>
                    <th>Severidad</th>
                    <th>Fecha del sismo</th>
                    <th>Ubicación</th>
                    <th>Magnitud</th>
                    <th>Fuente</th>
                    <th>Regla</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {alertas.map(a => (
                    <tr key={a.id}>
                      <td>
                        <span className={
                          a.severidad === "critical"
                            ? "alrt-pill alrt-critical"
                            : "alrt-pill alrt-warning"
                        }>
                          {estadoNombre(a.severidad)}
                        </span>
                      </td>

                      <td>
                        {fecha(a.fecha_evento_utc)}
                      </td>

                      <td>
                        {a.lugar || "No informada"}
                      </td>

                      <td>
                        <strong>
                          {a.magnitud.toFixed(1)}
                        </strong>
                      </td>

                      <td>{a.fuente}</td>
                      <td>{a.regla}</td>

                      <td>
                        <span className="alrt-pill">
                          {estadoNombre(a.estado)}
                        </span>
                      </td>

                      <td>
                        <div className="alrt-row-actions">
                          <button
                            onClick={() => setSeleccionado(a.id)}
                          >
                            <Eye size={14}/>
                            Ver
                          </button>

                          {aprobar &&
                            a.estado === "pending" && (
                              <>
                                <button
                                  disabled={operando}
                                  onClick={() => revisar(
                                    a, "approved"
                                  )}
                                >
                                  Aprobar
                                </button>

                                <button
                                  disabled={operando}
                                  onClick={() => revisar(
                                    a, "dismissed"
                                  )}
                                >
                                  Descartar
                                </button>
                              </>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {!alertas.length && !cargando && (
                    <tr>
                      <td colSpan={8}>
                        No se encontraron alertas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="alrt-pagination">
              <button
                disabled={cargando || pagina <= 1}
                onClick={() => setPagina(
                  p => Math.max(1, p - 1)
                )}
              >
                Anterior
              </button>

              <span>
                Página {pagina} de {paginas}
              </span>

              <button
                disabled={cargando || pagina >= paginas}
                onClick={() => setPagina(p => p + 1)}
              >
                Siguiente
              </button>
            </div>
          </article>

          {auditar && (
            <article className="prep-card">
              <h3>
                Historial de operaciones
              </h3>

              <div className="prep-table-wrap">
                <table className="prep-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Acción</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>

                  <tbody>
                    {acciones.map(a => (
                      <tr key={a.id ?? `${a.fecha_utc}-${a.accion}`}>
                        <td>{fecha(a.fecha_utc)}</td>
                        <td>{a.accion}</td>
                        <td>{a.detalle || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}
        </>
      )}

      {seccion === "centro" && <DeliveriesPanel />}

      {seleccionado && (
        <div
          className="alrt-overlay"
          onClick={() => setSeleccionado(null)}
        >
          <section
            className="alrt-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de alerta"
            onClick={e => e.stopPropagation()}
          >
            <header className="alrt-dialog-head">
              <div>
                <small>
                  TRAZABILIDAD DE ALERTA
                </small>
                <h2>Ficha de la alerta interna</h2>
              </div>

              <button
                aria-label="Cerrar"
                onClick={() => setSeleccionado(null)}
              >
                <X size={21}/>
              </button>
            </header>

            {errorDetalle && (
              <p className="prep-error">
                {errorDetalle}
              </p>
            )}

            {!detalle && !errorDetalle && (
              <p className="prep-loading">
                Cargando detalle...
              </p>
            )}

            {detalle && (
              <>
                <div className="alrt-detail-grid">
                  {[
                    ["ID de alerta", detalle.id],
                    ["Regla aplicada", detalle.regla],
                    [
                      "Título del aviso interno",
                      detalle.titulo || "Evento observado"
                    ],
                    [
                      "Mensaje interno",
                      detalle.mensaje ||
                        "Sin plantilla de mensaje"
                    ],
                    ["Severidad", estadoNombre(detalle.severidad)],
                    ["Estado", estadoNombre(detalle.estado)],
                    ["Fuente", detalle.fuente],
                    ["ID externo", detalle.id_externo],
                    ["Magnitud", String(detalle.magnitud)],
                    [
                      "Profundidad",
                      detalle.profundidad_km === null
                        ? "No informada"
                        : `${detalle.profundidad_km} km`
                    ],
                    ["Localidad", detalle.lugar || "No informada"],
                    [
                      "Fecha del sismo",
                      fecha(detalle.fecha_evento_utc)
                    ],
                    ["Creación", fecha(detalle.creada_utc)],
                    [
                      "Revisión",
                      fecha(detalle.revisada_utc)
                    ],
                    ["Latitud", String(detalle.latitud)],
                    ["Longitud", String(detalle.longitud)],
                    [
                      "Canal de entrega",
                      detalle.entrega.canal || "No configurado"
                    ],
                    [
                      "Estado de envío",
                        detalle.entrega.estado
                    ],
                    [
                      "Destinatarios",
                      detalle.entrega.destinatarios?.join(", ")
                        || "No configurados"
                    ],
                    [
                      "Intentos de entrega",
                      String(detalle.entrega.intentos ?? 0)
                    ],
                    [
                      "Último intento",
                      fecha(detalle.entrega.ultimo_intento_utc)
                    ],
                    [
                      "Fecha de entrega",
                      fecha(detalle.entrega.entregada_utc)
                    ],
                    [
                      "Error",
                      detalle.entrega.error || "Sin intentos"
                    ],
                    [
                      "Acuse",
                      detalle.entrega.acuse || "No disponible"
                    ]
                  ].map(([nombre, valor]) => (
                    <div
                      key={nombre}
                      className="alrt-detail-item"
                    >
                      <small>{nombre}</small>
                      <strong>{valor}</strong>
                    </div>
                  ))}
                </div>

                {detalle.url_fuente && (
                  <a
                    className="alrt-source-link"
                    href={detalle.url_fuente}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={16}/>
                    Consultar registro del proveedor de origen
                  </a>
                )}

                <h3>Historial de esta alerta</h3>

                {detalle.historial.map((a, i) => (
                  <div className="prep-detail" key={i}>
                    <span>
                      {fecha(a.fecha_utc)}
                      {" · "}{a.accion}
                    </span>

                    <strong>
                      {a.detalle || "—"}
                    </strong>
                  </div>
                ))}

                {!detalle.historial.length && (
                  <p>
                    No hay acciones individuales
                    registradas para esta alerta.
                  </p>
                )}

                <p className="alrt-help">
                  <CheckCircle2 size={15}/>
                  La aprobación es una decisión interna.
                  No implica que se haya entregado
                  ninguna notificación.
                </p>
              </>
            )}
          </section>
        </div>
      )}

      {seccion === "centro" && aprobar && token && (
        <EmailNotificationsPanel token={token} />
      )}
      </section>
  );
}
