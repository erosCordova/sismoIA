import { useContext, useEffect, useState } from "react";
import { Bell, Radio, Clock3 } from "lucide-react";
import { TokenContext, UsuarioContext } from "./AuthGate";

type Fuente = {
  id: string;
  nombre: string;
  estado: string;
  registros: number;
  ultima_sincronizacion_utc: string | null;
};

type DatosFuentes = {
  fuentes: Fuente[];
  total_fuentes: number;
};

type DatosAlertas = {
  alertas: { id: string; estado: string }[];
};

type ResumenAlertas = {
  pendientes: number;
  aprobadas: number;
  limitado: boolean;
};

function fecha(valor: string | null) {
  if (!valor) return "Sin registro";

  const instante = new Date(valor);

  if (Number.isNaN(instante.getTime())) {
    return "Fecha no disponible";
  }

  return instante.toLocaleString("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short"
  });
}

export default function DashboardOperations() {
  const token = useContext(TokenContext);
  const usuario = useContext(UsuarioContext);

  const [fuentes, setFuentes] = useState<DatosFuentes | null>(null);
  const [alertas, setAlertas] = useState<ResumenAlertas | null>(null);

  const [errorFuentes, setErrorFuentes] = useState(false);
  const [errorAlertas, setErrorAlertas] = useState(false);

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

  useEffect(() => {
    if (!token) return;

    let vigente = true;

    async function consultar<T>(ruta: string): Promise<T> {
      const respuesta = await fetch(`/api/v1${ruta}`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        cache: "no-store"
      });

      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status}`);
      }

      return respuesta.json() as Promise<T>;
    }

    async function actualizar() {
      const [respuestaFuentes, respuestaAlertas] =
        await Promise.allSettled([
          puedeFuentes
            ? consultar<DatosFuentes>("/sources")
            : Promise.resolve(null),

          puedeAlertas
            ? Promise.all([
                consultar<DatosAlertas>(
                  "/alerts?estado=pending&limite=500"
                ),
                consultar<DatosAlertas>(
                  "/alerts?estado=approved&limite=500"
                )
              ])
            : Promise.resolve(null)
        ]);

      if (!vigente) return;

      if (respuestaFuentes.status === "fulfilled") {
        setFuentes(respuestaFuentes.value);
        setErrorFuentes(false);
      } else {
        setFuentes(null);
        setErrorFuentes(true);
      }

      if (
        respuestaAlertas.status === "fulfilled" &&
        respuestaAlertas.value !== null
      ) {
        const [pendientes, aprobadas] = respuestaAlertas.value;

        setAlertas({
          pendientes: pendientes.alertas.length,
          aprobadas: aprobadas.alertas.length,
          limitado:
            pendientes.alertas.length === 500 ||
            aprobadas.alertas.length === 500
        });

        setErrorAlertas(false);
      } else if (respuestaAlertas.status === "rejected") {
        setAlertas(null);
        setErrorAlertas(true);
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

  const fuentesActivas = fuentes?.fuentes.filter(
    f => f.estado.toLowerCase() === "active"
  ).length;

  const valorFuentes = !puedeFuentes
    ? "Sin acceso"
    : errorFuentes
      ? "No disponible"
      : fuentesActivas === undefined
        ? "Consultando..."
        : `${fuentesActivas} de ${fuentes?.total_fuentes ?? 0}`;

  const valorAlertas = !puedeAlertas
    ? "Sin acceso"
    : errorAlertas
      ? "No disponible"
      : !alertas
        ? "Consultando..."
        : `${alertas.limitado ? "≥" : ""}${
            alertas.pendientes + alertas.aprobadas
          }`;

  const valorPendientes = !puedeAlertas
    ? "Sin acceso"
    : errorAlertas
      ? "No disponible"
      : !alertas
        ? "Consultando..."
        : `${alertas.pendientes}${
            alertas.pendientes === 500 ? "+" : ""
          }`;

  return (
    <>
      <div className="dash-status-row">
        <span>
          <Bell size={16} />
          Alertas activas
        </span>
        <strong>{valorAlertas}</strong>
      </div>

      <div className="dash-status-row">
        <span>
          <Bell size={16} />
          Pendientes de revisión
        </span>
        <strong>{valorPendientes}</strong>
      </div>

      <div className="dash-status-row">
        <span>
          <Radio size={16} />
          Fuentes configuradas activas
        </span>
        <strong>{valorFuentes}</strong>
      </div>

      {fuentes?.fuentes.map(f => (
        <div className="dash-source-detail" key={f.id}>
          <div className="dash-source-heading">
            <strong>{f.nombre}</strong>

            <span
              className={
                f.estado.toLowerCase() === "active"
                  ? "dash-source-active"
                  : "dash-source-inactive"
              }
            >
              {f.estado.toLowerCase() === "active"
                ? "Activa en configuración"
                : f.estado}
            </span>
          </div>

          <div className="dash-source-meta">
            <span>
              {f.registros.toLocaleString("es-PE")} registros
            </span>

            <span>
              Última sincronización:{" "}
              {fecha(f.ultima_sincronizacion_utc)}
            </span>
          </div>
        </div>
      ))}

      <div className="dash-status-row">
        <span>
          <Clock3 size={16} />
          Latencia de recepción
        </span>

        <strong>Sin medición disponible</strong>
      </div>
    </>
  );
}
