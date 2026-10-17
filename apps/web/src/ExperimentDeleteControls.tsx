
import {useContext, useState} from "react";
import {TokenContext} from "./AuthGate";
import "./experiment-delete-controls.css";

// SISMOIA_EXPERIMENT_DELETE_UI_V2

type Experimento = {
  id: string;
  estado: string;
  algoritmo: string;
  resultados: {
    modelo_seleccionado: string;
  };
};

type Props = {
  experimentos: Experimento[];
  puedeAdministrar: boolean;
  onDeleted: () => void;
};

export default function ExperimentDeleteControls({
  experimentos,
  puedeAdministrar,
  onDeleted
}: Props) {
  const token = useContext(TokenContext);

  const [seleccionados, setSeleccionados] =
    useState<string[]>([]);

  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const eliminables = experimentos.filter(e =>
    e.estado === "pending" ||
    e.estado === "rejected"
  );

  const protegidos = experimentos.filter(e =>
    e.estado !== "pending" &&
    e.estado !== "rejected"
  );

  const idsValidos = seleccionados.filter(id =>
    eliminables.some(e => e.id === id)
  );

  const todosSeleccionados =
    eliminables.length > 0 &&
    eliminables.every(e => idsValidos.includes(e.id));

  function cambiarSeleccion(id: string, marcado: boolean) {
    setSeleccionados(actual =>
      marcado
        ? [...new Set([...actual, id])]
        : actual.filter(x => x !== id)
    );
  }

  async function eliminar(ids: string[]) {
    if (!puedeAdministrar || !token || ocupado) return;

    const unicos = [...new Set(ids)];

    if (!unicos.length || unicos.length > 100) {
      setError("Selecciona entre 1 y 100 experimentos.");
      return;
    }

    if (!unicos.every(id =>
      eliminables.some(e => e.id === id)
    )) {
      setError("La seleccion incluye experimentos protegidos.");
      return;
    }

    const confirmacion = window.prompt(
      `Se eliminaran ${unicos.length} experimento(s) ` +
      "y sus artefactos. Esta accion no se puede deshacer. " +
      "Escribe ELIMINAR para confirmar."
    );

    if (confirmacion !== "ELIMINAR") return;

    setOcupado(true);
    setError("");
    setMensaje("");

    try {
      const individual = unicos.length === 1;

      const ruta = individual
        ? "/api/v1/governance/experiments/" +
          encodeURIComponent(unicos[0])
        : "/api/v1/governance/experiments/bulk-delete";

      const respuesta = await fetch(ruta, {
        method: individual ? "DELETE" : "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(!individual
            ? {"Content-Type": "application/json"}
            : {})
        },
        ...(!individual
          ? {body: JSON.stringify(unicos)}
          : {})
      });

      const resultado = await respuesta.json().catch(() => null);

      if (!respuesta.ok) {
        throw new Error(
          typeof resultado?.detail === "string"
            ? resultado.detail
            : `Error HTTP ${respuesta.status}`
        );
      }

      setSeleccionados([]);
      setMensaje(
        `${unicos.length} experimento(s) eliminado(s).`
      );

      onDeleted();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudieron eliminar los experimentos."
      );
    } finally {
      setOcupado(false);
    }
  }

  if (!puedeAdministrar) return null;

  return (
    <details className="sismo-experiment-delete">
      <summary>
        Administrar historial de experimentos
        <span>
          {eliminables.length} eliminables
        </span>
      </summary>

      <div className="sismo-experiment-delete-body">
        <p>
          Selecciona entrenamientos pendientes o rechazados
          que ya no necesites.
        </p>

        {protegidos.length > 0 && (
          <p className="sismo-experiment-protected">
            {protegidos.length} experimento(s) protegido(s).
            Los aprobados no se pueden eliminar.
          </p>
        )}

        {eliminables.length > 0 ? (
          <>
            <div className="sismo-experiment-actions">
              <label>
                <input
                  type="checkbox"
                  checked={todosSeleccionados}
                  disabled={ocupado}
                  onChange={e =>
                    setSeleccionados(
                      e.target.checked
                        ? eliminables.slice(0, 100).map(x => x.id)
                        : []
                    )
                  }
                />
                Seleccionar eliminables
              </label>

              <button
                type="button"
                className="sismo-delete-danger"
                disabled={ocupado || idsValidos.length === 0}
                onClick={() => void eliminar(idsValidos)}
              >
                Eliminar seleccionados ({idsValidos.length})
              </button>
            </div>

            <div className="sismo-experiment-delete-list">
              {eliminables.map(e => (
                <div className="sismo-experiment-delete-row" key={e.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={idsValidos.includes(e.id)}
                      disabled={ocupado}
                      onChange={evento =>
                        cambiarSeleccion(
                          e.id,
                          evento.target.checked
                        )
                      }
                    />

                    <span>
                      <strong>
                        {e.resultados?.modelo_seleccionado ||
                         e.algoritmo}
                      </strong>
                      <small>
                        {e.estado === "pending"
                          ? "Pendiente"
                          : "Rechazado"}
                        {" · "}
                        {e.id.slice(0, 8)}
                      </small>
                    </span>
                  </label>

                  <button
                    type="button"
                    className="sismo-delete-danger"
                    disabled={ocupado}
                    onClick={() => void eliminar([e.id])}
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p>No hay experimentos disponibles para eliminar.</p>
        )}

        {mensaje && <p role="status">{mensaje}</p>}
        {error && (
          <p role="alert" className="sismo-delete-error">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
