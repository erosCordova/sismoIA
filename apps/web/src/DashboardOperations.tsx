import { useContext, useEffect, useState } from "react";
import { Bell, Radio, Clock3 } from "lucide-react";
import { TokenContext, UsuarioContext } from "./AuthGate";

type Fuente = {
  id: string;
  nombre: string;
  estado_configuracion: string;
  registros: number;
  recibidos_24h: number;
  ultima_sincronizacion_utc: string | null;
  latencia_media_horas: number | null;
  frescura: string;
};

type FuentesResponse = {
  fuentes: Fuente[];
};

type AlertasResponse = {
  pendientes: number;
  aprobadas: number;
  descartadas: number;
};

function fecha(valor: string | null) {
  if (!valor) return "No registrada";

  const d = new Date(valor);

  if (Number.isNaN(d.getTime())) {
    return "Fecha no disponible";
  }

  return d.toLocaleString("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short"
  });
}

function numero(valor: number) {
  return valor.toLocaleString("es-PE", {
    maximumFractionDigits: 2
  });
}

export default function DashboardOperations() {
  const token = useContext(TokenContext);
  const usuario = useContext(UsuarioContext);

  const permitido = (permiso: string) =>
    Boolean(
      usuario &&
      (
        usuario.permisos.includes("*") ||
        usuario.permisos.includes(permiso)
      )
    );

  const puedeFuentes = permitido("sources:read");
  const puedeAlertas = permitido("alerts:read");

  const [fuentes, setFuentes] =
    useState<FuentesResponse | null>(null);

  const [alertas, setAlertas] =
    useState<AlertasResponse | null>(null);

  const [errorFuentes, setErrorFuentes] = useState(false);
  const [errorAlertas, setErrorAlertas] = useState(false);

  useEffect(() => {
    if (!token) return;

    let vigente = true;

    async function consultar<T>(ruta: string): Promise<T> {
      const r = await fetch(`/api/v1${ruta}`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        cache: "no-store"
      });

      if (!r.ok) throw Error(`HTTP ${r.status}`);

      return r.json() as Promise<T>;
    }

    async function actualizar() {
      if (puedeFuentes) {
        try {
          const d = await consultar<FuentesResponse>(
            "/sources/diagnostics"
          );

          if (vigente) {
            setFuentes(d);
            setErrorFuentes(false);
          }
        } catch {
          if (vigente) {
            setFuentes(null);
            setErrorFuentes(true);
          }
        }
      }

      if (puedeAlertas) {
        try {
          const d = await consultar<AlertasResponse>(
            "/alerts/summary"
          );

          if (vigente) {
            setAlertas(d);
            setErrorAlertas(false);
          }
        } catch {
          if (vigente) {
            setAlertas(null);
            setErrorAlertas(true);
          }
        }
      }
    }

    void actualizar();

    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void actualizar();
      }
    }, 60000);

    return () => {
      vigente = false;
      window.clearInterval(intervalo);
    };
  }, [token, puedeFuentes, puedeAlertas]);

  const recientes = fuentes?.fuentes.filter(
    f => f.frescura === "Recepción reciente"
  ).length;

  const pendientes = !puedeAlertas
    ? "Sin acceso"
    : errorAlertas
      ? "No disponible"
      : !alertas
        ? "Consultando..."
        : numero(alertas.pendientes);

  const aprobadas = !puedeAlertas
    ? "Sin acceso"
    : errorAlertas
      ? "No disponible"
      : !alertas
        ? "Consultando..."
        : numero(alertas.aprobadas);

  const estadoFuentes = !puedeFuentes
    ? "Sin acceso"
    : errorFuentes
      ? "No disponible"
      : recientes === undefined
        ? "Consultando..."
        : `${recientes} / ${fuentes?.fuentes.length ?? 0}`;

  return (
    <>
      <div className="dash-status-row">
        <span>
          <Bell size={16} />
          Alertas pendientes de revisión
        </span>
        <strong>{pendientes}</strong>
      </div>

      <div className="dash-status-row">
        <span>
          <Bell size={16} />
          Alertas aprobadas internamente
        </span>
        <strong>{aprobadas}</strong>
      </div>

      <div className="dash-status-row">
        <span>
          <Radio size={16} />
          Fuentes con recepción reciente
        </span>
        <strong>{estadoFuentes}</strong>
      </div>

      {puedeFuentes && fuentes?.fuentes.map(f => (
        <div className="dash-source-detail" key={f.id}>
          <div className="dash-source-heading">
            <strong>{f.nombre}</strong>

            <span
              className={
                f.frescura === "Recepción reciente"
                  ? "dash-source-active"
                  : "dash-source-inactive"
              }
            >
              {f.frescura}
            </span>
          </div>

          <div className="dash-source-meta">
            <span>
              {numero(f.registros)} registros
            </span>

            <span>
              Recibidos en 24 h: {numero(f.recibidos_24h)}
            </span>

            <span>
              Última sincronización:{" "}
              {fecha(f.ultima_sincronizacion_utc)}
            </span>
          </div>

          <div className="dash-status-row">
            <span>
              <Clock3 size={14} />
              Latencia media registrada
            </span>

            <strong>
              {f.latencia_media_horas === null
                ? "Sin medición"
                : `${numero(f.latencia_media_horas)} h`}
            </strong>
          </div>
        </div>
      ))}

      <p className="dash-operations-note">
        Los conteos de alertas proceden de PostgreSQL.
        La recepción reciente no garantiza disponibilidad
        en vivo del proveedor. La aprobación no implica envío.
      </p>
    </>
  );
}
