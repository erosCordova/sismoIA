import {
  useContext, useEffect, useState
} from "react";

import {
  TokenContext, UsuarioContext
} from "./AuthGate";

import "./deliveries.css";

type Destinatario = {
  id: string;
  nombre: string;
};

type Alerta = {
  id: string;
  regla: string;
  magnitud: number;
  lugar: string | null;
};

type Entrega = {
  id: string;
  alerta_id: string;
  destinatario: string | null;
  estado: string;
  magnitud: number;
  severidad: string;
  lugar: string | null;
  fuente: string;
  url_fuente: string | null;
  creada_utc: string;
  acuse_utc: string | null;
  envio_externo: boolean;
};

export default function DeliveriesPanel() {
  const token = useContext(TokenContext);
  const usuario = useContext(UsuarioContext);

  const permisos = usuario?.permisos ?? [];

  const operador =
    permisos.includes("*") ||
    permisos.includes("alerts:approve");

  const [destinatarios, setDestinatarios] =
    useState<Destinatario[]>([]);

  const [alertas, setAlertas] =
    useState<Alerta[]>([]);

  const [salidas, setSalidas] =
    useState<Entrega[]>([]);

  const [recibidas, setRecibidas] =
    useState<Entrega[]>([]);

  const [alertaId, setAlertaId] = useState("");
  const [destinatarioId, setDestinatarioId] =
    useState("");

  const [revision, setRevision] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  async function api<T>(
    ruta: string,
    metodo = "GET",
    body?: unknown
  ): Promise<T> {
    if (!token) throw Error("Sesión no disponible");

    const r = await fetch(
      `/api/v1/deliveries${ruta}`,
      {
        method: metodo,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body
            ? {"Content-Type": "application/json"}
            : {})
        },
        ...(body
          ? {body: JSON.stringify(body)}
          : {})
      }
    );

    const data = await r.json();

    if (!r.ok) {
      throw Error(
        typeof data.detail === "string"
          ? data.detail
          : `HTTP ${r.status}`
      );
    }

    return data as T;
  }

  useEffect(() => {
    if (!token) return;

    let vigente = true;

    async function cargar() {
      try {
        const m = await api<{
          entregas: Entrega[]
        }>("/mine");

        if (vigente) setRecibidas(m.entregas);

        if (!operador) return;

        const [d, s, a] = await Promise.all([
          api<{usuarios: Destinatario[]}>(
            "/recipients"
          ),
          api<{entregas: Entrega[]}>(
            "/outbox"
          ),
          fetch(
            "/api/v1/alerts/inbox?" +
            "estado=approved&limite=100",
            {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          ).then(async r => {
            if (!r.ok) {
              throw Error(`Alertas: HTTP ${r.status}`);
            }

            return r.json() as Promise<{
              alertas: Alerta[]
            }>;
          })
        ]);

        if (!vigente) return;

        setDestinatarios(d.usuarios);
        setSalidas(s.entregas);
        setAlertas(a.alertas);

        setDestinatarioId(actual =>
          actual || d.usuarios[0]?.id || ""
        );

        setAlertaId(actual =>
          actual || a.alertas[0]?.id || ""
        );
      } catch (e) {
        if (vigente) {
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron cargar las entregas"
          );
        }
      }
    }

    void cargar();

    return () => {
      vigente = false;
    };
  }, [token, operador, revision]);

  async function ejecutar(
    accion: () => Promise<unknown>,
    exito: string
  ) {
    setOcupado(true);
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
          : "Operación fallida"
      );
    } finally {
      setOcupado(false);
    }
  }

  const fecha = (valor: string | null) =>
    valor
      ? new Date(valor).toLocaleString(
          "es-PE", {
            timeZone: "America/Lima"
          }
        )
      : "Sin registro";

  return (
    <article className="prep-card deliveries-panel">
      <h3>Entregas internas verificables</h3>

      <p>
        Los avisos se asignan a usuarios de SISMOIA.
        Solo se registra la recepción cuando el
        destinatario la confirma. No hay envío
        externo automático.
      </p>

      {error && (
        <p role="alert" className="prep-error">
          {error}
        </p>
      )}

      {mensaje && (
        <p role="status" className="deliveries-ok">
          {mensaje}
        </p>
      )}

      {operador && (
        <>
          <h4>Asignar alerta aprobada</h4>

          <div className="deliveries-form">
            <label>
              Alerta
              <select
                value={alertaId}
                onChange={e =>
                  setAlertaId(e.target.value)
                }
              >
                {!alertas.length && (
                  <option value="">
                    Sin alertas aprobadas
                  </option>
                )}

                {alertas.map(a => (
                  <option key={a.id} value={a.id}>
                    M {a.magnitud} · {a.regla} ·{" "}
                    {a.lugar || "Sin localidad"}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Destinatario interno
              <select
                value={destinatarioId}
                onChange={e =>
                  setDestinatarioId(e.target.value)
                }
              >
                {!destinatarios.length && (
                  <option value="">
                    Sin destinatarios habilitados
                  </option>
                )}

                {destinatarios.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </label>

            <button
              disabled={
                ocupado ||
                !alertaId ||
                !destinatarioId
              }
              onClick={() => {
                if (!window.confirm(
                  "¿Asignar esta alerta al usuario?"
                )) return;

                void ejecutar(
                  () => api(
                    "/assign",
                    "POST",
                    {
                      alerta_id: alertaId,
                      destinatario_id:
                        destinatarioId
                    }
                  ),
                  "Asignación interna registrada"
                );
              }}
            >
              Asignar aviso
            </button>
          </div>

          <h4>Historial de asignaciones</h4>

          <div className="prep-table-wrap">
            <table className="prep-table">
              <thead>
                <tr>
                  <th>Destinatario</th>
                  <th>Evento</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Acción</th>
                </tr>
              </thead>

              <tbody>
                {salidas.map(d => (
                  <tr key={d.id}>
                    <td>{d.destinatario}</td>
                    <td>
                      M {d.magnitud} ·{" "}
                      {d.lugar || "Sin localidad"}
                    </td>
                    <td>{d.estado}</td>
                    <td>{fecha(d.creada_utc)}</td>
                    <td>
                      {d.estado === "assigned" && (
                        <button
                          disabled={ocupado}
                          onClick={() => {
                            if (!window.confirm(
                              "¿Cancelar la asignación?"
                            )) return;

                            void ejecutar(
                              () => api(
                                `/${d.id}/cancel`,
                                "POST"
                              ),
                              "Asignación cancelada"
                            );
                          }}
                        >
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

                {!salidas.length && (
                  <tr>
                    <td colSpan={5}>
                      No hay asignaciones registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h4>Mis avisos recibidos</h4>

      <div className="prep-table-wrap">
        <table className="prep-table">
          <thead>
            <tr>
              <th>Evento</th>
              <th>Fuente</th>
              <th>Estado</th>
              <th>Acuse</th>
              <th>Acción</th>
            </tr>
          </thead>

          <tbody>
            {recibidas.map(d => (
              <tr key={d.id}>
                <td>
                  M {d.magnitud} ·{" "}
                  {d.lugar || "Sin localidad"}
                </td>

                <td>
                  {d.url_fuente ? (
                    <a
                      href={d.url_fuente}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {d.fuente}
                    </a>
                  ) : d.fuente}
                </td>

                <td>{d.estado}</td>
                <td>{fecha(d.acuse_utc)}</td>

                <td>
                  {d.estado === "assigned" && (
                    <button
                      disabled={ocupado}
                      onClick={() => void ejecutar(
                        () => api(
                          `/${d.id}/ack`,
                          "POST"
                        ),
                        "Recepción confirmada"
                      )}
                    >
                      Confirmar recepción
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {!recibidas.length && (
              <tr>
                <td colSpan={5}>
                  No tienes avisos asignados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
