import {
  useContext, useEffect, useState
} from "react";
import {
  Database, RefreshCw, Radio,
  Clock3, Activity, ShieldCheck
} from "lucide-react";
import {
  TokenContext, UsuarioContext
} from "./AuthGate";
import "./preparation.css";
import "./reporting.css";
import "./operations-enterprise.css";

type Fuente = {
  id: string;
  nombre: string;
  organizacion: string;
  tipo: string;
  estado_configuracion: string;
  licencia: string | null;
  registros: number;
  recibidos_24h: number;
  ultima_recepcion_utc: string | null;
  ultimo_evento_utc: string | null;
  ultima_sincronizacion_utc: string | null;
  antiguedad_recepcion_horas: number | null;
  latencia_media_horas: number | null;
  profundidades_faltantes: number;
  frescura: string;
};

type Datos = {
  fuentes: Fuente[];
  total_fuentes: number;
  total_registros: number;
  calculado_utc: string;
  nota: string;
};

const numero = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-PE", {
    maximumFractionDigits: 2
  });

function fecha(v: string | null) {
  return v
    ? new Date(v).toLocaleString("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "short",
        timeStyle: "short"
      })
    : "No registrada";
}

export default function SourcesWorkspace() {
  const token = useContext(TokenContext);
  const usuario = useContext(UsuarioContext);

  const administrador = Boolean(
    usuario?.roles?.includes("Administrador") ||
    usuario?.permisos.includes("*")
  );

  const [datos, setDatos] = useState<Datos | null>(null);
  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (!token) return;

    const ctrl = new AbortController();

    async function cargar() {
      setCargando(true);
      setError("");
      setDatos(null);

      try {
        const r = await fetch(
          "/api/v1/sources/diagnostics",
          {
            signal: ctrl.signal,
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!r.ok) {
          throw Error(`Error de fuentes: HTTP ${r.status}`);
        }

        const resultado: Datos = await r.json();

        if (!ctrl.signal.aborted) {
          setDatos(resultado);
        }
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setError(
            e instanceof Error
              ? e.message : "Error consultando fuentes"
          );
        }
      } finally {
        if (!ctrl.signal.aborted) {
          setCargando(false);
        }
      }
    }

    void cargar();
    return () => ctrl.abort();
  }, [token, revision]);

  async function sincronizar() {
    if (!token || !administrador) return;

    if (!window.confirm(
      "¿Ejecutar la sincronización manual de las fuentes? " +
      "Esta operación consultará los proveedores externos " +
      "y podrá almacenar registros nuevos."
    )) return;

    setSincronizando(true);
    setError("");
    setMensaje("");

    try {
      const r = await fetch(
        "/api/v1/seismic/sync-all",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!r.ok) {
        throw Error(
          `Sincronización no completada: HTTP ${r.status}`
        );
      }

      setMensaje(
        "La API finalizó la sincronización. " +
        "Actualizando los indicadores..."
      );

      setRevision(v => v + 1);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo sincronizar"
      );
    } finally {
      setSincronizando(false);
    }
  }

  return (
    <section className="prep-root">
      <header className="prep-header">
        <div>
          <h2>
            <Radio size={23}/>
            Fuentes de datos
          </h2>
          <p>
            Conectores, recepción y calidad de los
            registros sísmicos
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

          {administrador && (
            <button
              disabled={sincronizando}
              onClick={() => void sincronizar()}
            >
              <Database size={16}/>
              {sincronizando
                ? "Sincronizando..."
                : "Sincronizar fuentes"}
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="prep-error" role="alert">{error}</p>
      )}

      {mensaje && (
        <p className="prep-loading" role="status">
          {mensaje}
        </p>
      )}

      {cargando && (
        <p className="prep-loading">
          Consultando diagnósticos...
        </p>
      )}

      {datos && (
        <>
          <div className="prep-metrics">
            <article>
              <span>Fuentes registradas</span>
              <strong>
                {numero(datos.total_fuentes)}
              </strong>
            </article>

            <article>
              <span>Registros almacenados</span>
              <strong>
                {numero(datos.total_registros)}
              </strong>
            </article>

            <article>
              <span>Recepciones últimas 24 h</span>
              <strong>
                {numero(datos.fuentes.reduce(
                  (s, f) => s + f.recibidos_24h, 0
                ))}
              </strong>
            </article>

            <article>
              <span>Fuentes con recepción reciente</span>
              <strong>
                {numero(datos.fuentes.filter(
                  f => f.antiguedad_recepcion_horas !== null &&
                    f.antiguedad_recepcion_horas <= 24
                ).length)}
              </strong>
            </article>
          </div>

          <div className="ops-grid">
            {datos.fuentes.map(f => (
              <article className="prep-card ops-source" key={f.id}>
                <div className="ops-source-head">
                  <div>
                    <small>PROVEEDOR</small>
                    <h3>{f.nombre}</h3>
                    <p>{f.organizacion}</p>
                  </div>
                  <Radio size={22}/>
                </div>

                <div className="prep-detail">
                  <span>Estado de configuración</span>
                  <strong>{f.estado_configuracion}</strong>
                </div>

                <div className="prep-detail">
                  <span>Frescura de los registros</span>
                  <strong>{f.frescura}</strong>
                </div>

                <div className="prep-detail">
                  <span>Eventos registrados</span>
                  <strong>{numero(f.registros)}</strong>
                </div>

                <div className="prep-detail">
                  <span>Recibidos en 24 h</span>
                  <strong>{numero(f.recibidos_24h)}</strong>
                </div>

                <div className="prep-detail">
                  <span>
                    <Clock3 size={14}/>
                    Última sincronización
                  </span>
                  <strong>
                    {fecha(f.ultima_sincronizacion_utc)}
                  </strong>
                </div>

                <div className="prep-detail">
                  <span>Última recepción</span>
                  <strong>
                    {fecha(f.ultima_recepcion_utc)}
                  </strong>
                </div>

                <div className="prep-detail">
                  <span>Último sismo registrado</span>
                  <strong>
                    {fecha(f.ultimo_evento_utc)}
                  </strong>
                </div>

                <div className="prep-detail">
                  <span>Latencia media de recepción</span>
                  <strong>
                    {numero(f.latencia_media_horas)} h
                  </strong>
                </div>

                <div className="prep-detail">
                  <span>
                    Profundidades faltantes
                  </span>
                  <strong>
                    {numero(f.profundidades_faltantes)}
                  </strong>
                </div>

                <div className="prep-detail">
                  <span>
                    <ShieldCheck size={14}/>
                    Licencia
                  </span>
                  <strong>
                    {f.licencia || "No informada"}
                  </strong>
                </div>
              </article>
            ))}
          </div>

          <p className="rep-note">
            <Activity size={14}/>
            {datos.nota}
            {" "}Actualizado: {fecha(datos.calculado_utc)}.
          </p>
        </>
      )}
    </section>
  );
}
