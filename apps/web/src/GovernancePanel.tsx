import {
  useContext, useEffect, useState
} from "react";

import {
  TokenContext, UsuarioContext
} from "./AuthGate";

import "./governance.css";

type Version = {
  id: string;
  nombre: string;
  firma_sha256: string;
  estado: string;
  total: number;
  creada_utc: string;
  revisada_utc: string | null;
  motivo: string | null;
  manifest: {
    objetivo: string;
    entrenamiento: number;
    validacion: number;
    muestra_limitada: boolean;
  };
};

type Experimento = {
  id: string;
  dataset_id: string;
  algoritmo: string;
  estado: string;
  artefacto_sha256: string;
  artefacto_bytes: number;
  motivo: string | null;
  resultados: {
    modelo_seleccionado: string;
    entrenamiento: number;
    validacion: number;
    limitacion: string;
    comparacion: {
      modelo: string;
      mae?: number;
      rmse?: number;
      r2?: number;
      precision?: number;
      recall?: number;
      f1?: number;
      matriz?: number[][];
    }[];
  };
};

export default function GovernancePanel({
  seccion,
  peru,
  onDataUpdated
}: {
  seccion: "datasets" | "experiments";
  peru: boolean;
  onDataUpdated?: () => void;
}) {
  const token = useContext(TokenContext);
  const usuario = useContext(UsuarioContext);

  const permisos = usuario?.permisos ?? [];

  const permite = (p: string) =>
    permisos.includes("*") ||
    permisos.includes(p);

  const puedeCrear = permite("models:train");
  const puedeRevisar = permite("users:manage");

  const [datasets, setDatasets] =
    useState<Version[]>([]);

  const [experimentos, setExperimentos] =
    useState<Experimento[]>([]);

  const [nombre, setNombre] =
    useState("Muestra sísmica reproducible");

  const [fuente, setFuente] = useState("");
  const [objetivo, setObjetivo] =
    useState("magnitud");

  const [limite, setLimite] =
    useState("1000");

  const [soloValidos, setSoloValidos] =
    useState(false);

  const [imputar, setImputar] =
    useState(true);

  const [datasetId, setDatasetId] =
    useState("");

  const [algoritmo, setAlgoritmo] =
    useState("regresion");

  const [motivo, setMotivo] = useState(
    "Revisión técnica documentada de los resultados"
  );

  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [revision, setRevision] = useState(0);

  async function api<T>(
    ruta: string,
    metodo = "GET",
    datos?: unknown
  ): Promise<T> {
    if (!token) {
      throw Error("Sesión no disponible");
    }

    const respuesta = await fetch(
      `/api/v1/governance${ruta}`,
      {
        method: metodo,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(datos
            ? {
                "Content-Type":
                  "application/json"
              }
            : {})
        },
        ...(datos
          ? {body: JSON.stringify(datos)}
          : {})
      }
    );

    const resultado = await respuesta
      .json()
      .catch(() => null);

    if (!respuesta.ok) {
      throw Error(
        typeof resultado?.detail === "string"
          ? resultado.detail
          : `HTTP ${respuesta.status}`
      );
    }

    return resultado as T;
  }

  useEffect(() => {
    if (!token) return;

    let activo = true;

    Promise.all([
      api<{datasets: Version[]}>("/datasets"),
      api<{experimentos: Experimento[]}>(
        "/experiments"
      )
    ])
      .then(([d, e]) => {
        if (!activo) return;

        setDatasets(d.datasets);
        setExperimentos(e.experimentos);

        setDatasetId(actual =>
          actual || d.datasets[0]?.id || ""
        );
      })
      .catch(e => {
        if (activo) setError(String(e));
      });

    return () => {
      activo = false;
    };
  }, [token, revision]);

  async function ejecutar(
    accion: () => Promise<unknown>,
    confirmacion: string
  ) {
    setOcupado(true);
    setError("");
    setMensaje("");

    try {
      await accion();
      setMensaje(confirmacion);
      setRevision(v => v + 1);
      onDataUpdated?.();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : String(e)
      );
    } finally {
      setOcupado(false);
    }
  }

  function revisar(
    tipo: "datasets" | "experiments",
    id: string,
    decision: "approved" | "rejected"
  ) {
    if (motivo.trim().length < 8) {
      setError(
        "El motivo necesita al menos 8 caracteres."
      );
      return;
    }

    if (!window.confirm(
      `¿Confirmar revisión: ${decision}?`
    )) {
      return;
    }

    void ejecutar(
      () => api(
        `/${tipo}/${id}/review`,
        "POST",
        {
          decision,
          motivo: motivo.trim()
        }
      ),
      "Revisión guardada y auditada"
    );
  }

  return (
    <section className="gov-panel">
      <header>
        <h2>Gobierno científico persistente</h2>
        <p>
          Datasets inmutables, experimentos,
          aprobación y auditoría.
        </p>
      </header>

      <div className="gov-banner">
        El registro se conserva en PostgreSQL.
        La aprobación no despliega modelos
        ni emite avisos oficiales.
      </div>

      {error && (
        <p role="alert" className="gov-error">
          {error}
        </p>
      )}

      {mensaje && (
        <p role="status" className="gov-success">
          {mensaje}
        </p>
      )}



      {seccion === "datasets" ? (
        <>
          <h3>Registrar versión de dataset</h3>

          <div className="gov-form">
            <label>
              Nombre
              <input
                value={nombre}
                maxLength={120}
                onChange={e =>
                  setNombre(e.target.value)
                }
              />
            </label>

            <label>
              Fuente
              <select
                value={fuente}
                onChange={e =>
                  setFuente(e.target.value)
                }
              >
                <option value="">
                  IGP y USGS
                </option>
                <option value="IGP">IGP</option>
                <option value="USGS">USGS</option>
              </select>
            </label>

            <label>
              Variable objetivo
              <select
                value={objetivo}
                onChange={e =>
                  setObjetivo(e.target.value)
                }
              >
                <option value="magnitud">
                  Magnitud
                </option>
                <option value="profundidad_km">
                  Profundidad
                </option>
              </select>
            </label>

            <label>
              Número máximo de registros
              <select
                value={limite}
                onChange={e =>
                  setLimite(e.target.value)
                }
              >
                <option value="200">200</option>
                <option value="500">500</option>
                <option value="1000">1000</option>
                <option value="2000">2000</option>
              </select>
            </label>

            <label className="gov-check">
              <input
                type="checkbox"
                checked={soloValidos}
                onChange={e =>
                  setSoloValidos(e.target.checked)
                }
              />
              Solo válidos
            </label>

            <label className="gov-check">
              <input
                type="checkbox"
                checked={imputar}
                disabled={
                  objetivo === "profundidad_km"
                }
                onChange={e =>
                  setImputar(e.target.checked)
                }
              />
              Imputar profundidad
            </label>

            <button
              disabled={
                !puedeCrear ||
                ocupado ||
                nombre.trim().length < 3
              }
              onClick={() => void ejecutar(
                () => api(
                  "/datasets",
                  "POST",
                  {
                    nombre: nombre.trim(),
                    fuente: fuente || null,
                    peru,
                    objetivo,
                    limite: Number(limite),
                    solo_validos: soloValidos,
                    imputar_profundidad: imputar
                  }
                ),
                "Versión y firma SHA-256 guardadas"
              )}
            >
              Registrar dataset
            </button>
          </div>

          <p className="gov-foot">
            Ámbito: {peru ? "Perú" : "Mundo"}.
            Se conserva una copia preparada,
            ordenada y dividida temporalmente
            en entrenamiento (80 %) y validación
            (20 %).
          </p>

      {puedeRevisar && (
        <label className="gov-motivo">
          Motivo de revisión administrativa
          <input
            value={motivo}
            maxLength={500}
            onChange={e =>
              setMotivo(e.target.value)
            }
          />
        </label>
      )}

          <h3>Versiones existentes</h3>

          <div className="gov-items">
            {datasets.map(d => (
              <article key={d.id}>
                <div className="gov-itemtop">
                  <strong>{d.nombre}</strong>
                  <span>{d.estado}</span>
                </div>

                <p>
                  {d.total} registros ·
                  Objetivo: {d.manifest.objetivo} ·
                  Entrenamiento:{" "}
                  {d.manifest.entrenamiento} ·
                  Validación:{" "}
                  {d.manifest.validacion}
                </p>

                <small>
                  SHA-256: {d.firma_sha256}
                </small>

                {d.motivo && (
                  <p>Revisión: {d.motivo}</p>
                )}

                {d.manifest.muestra_limitada && (
                  <p>
                    Muestra limitada a la cantidad
                    solicitada.
                  </p>
                )}

                {puedeRevisar &&
                  d.estado === "pending" && (
                    <div className="gov-buttons">
                      <button
                        disabled={ocupado}
                        onClick={() => revisar(
                          "datasets",
                          d.id,
                          "approved"
                        )}
                      >
                        Aprobar
                      </button>

                      <button
                        disabled={ocupado}
                        onClick={() => revisar(
                          "datasets",
                          d.id,
                          "rejected"
                        )}
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
              </article>
            ))}
          </div>

          {!datasets.length && (
            <p>No hay datasets registrados.</p>
          )}
        </>
      ) : (
        <>
          <h3>Entrenar y registrar experimento</h3>

          <div className="gov-form">
            <label>
              Dataset
              <select
                value={datasetId}
                onChange={e =>
                  setDatasetId(e.target.value)
                }
              >
                {!datasets.length && (
                  <option value="">
                    Sin datasets
                  </option>
                )}

                {datasets
                  .filter(d =>
                    d.estado !== "rejected"
                  )
                  .map(d => (
                    <option
                      key={d.id}
                      value={d.id}
                    >
                      {d.nombre} · {d.total} filas
                    </option>
                  ))}
              </select>
            </label>

            <label>
              Algoritmo
              <select
                value={algoritmo}
                onChange={e =>
                  setAlgoritmo(e.target.value)
                }
              >
                <option value="regresion">
                  Regresión
                </option>
                <option value="clasificacion">
                  Clasificación M ≥ 4
                </option>
              </select>
            </label>

            <button
              disabled={
                !puedeCrear ||
                ocupado ||
                !datasetId
              }
              onClick={() => void ejecutar(
                () => api(
                  "/experiments",
                  "POST",
                  {
                    dataset_id: datasetId,
                    algoritmo
                  }
                ),
                "Experimento y artefacto guardados"
              )}
            >
              Entrenar y guardar
            </button>
          </div>

          <p className="gov-foot">
            La clasificación requiere un dataset
            cuya variable objetivo sea magnitud.
            Los resultados son retrospectivos.
          </p>

      {puedeRevisar && (
        <label className="gov-motivo">
          Motivo de revisión administrativa
          <input
            value={motivo}
            maxLength={500}
            onChange={e =>
              setMotivo(e.target.value)
            }
          />
        </label>
      )}

          <h3>Experimentos registrados</h3>

          <div className="gov-items">
            {experimentos.map(e => (
              <article key={e.id}>
                <div className="gov-itemtop">
                  <strong>
                    {e.resultados.modelo_seleccionado}
                  </strong>
                  <span>{e.estado}</span>
                </div>

                <p>
                  {e.algoritmo} ·
                  {e.resultados.entrenamiento}
                  {" "}entrenamiento ·
                  {e.resultados.validacion}
                  {" "}validación
                </p>

                <div className="gov-tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Modelo</th>
                        <th>MAE</th>
                        <th>RMSE</th>
                        <th>R²</th>
                        <th>Precision</th>
                        <th>Recall</th>
                        <th>F1</th>
                      </tr>
                    </thead>

                    <tbody>
                      {e.resultados.comparacion
                        .map(m => (
                          <tr key={m.modelo}>
                            <td>{m.modelo}</td>
                            <td>{m.mae ?? "—"}</td>
                            <td>{m.rmse ?? "—"}</td>
                            <td>{m.r2 ?? "—"}</td>
                            <td>
                              {m.precision ?? "—"}
                            </td>
                            <td>
                              {m.recall ?? "—"}
                            </td>
                            <td>{m.f1 ?? "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <small>
                  Artefacto:{" "}
                  {e.artefacto_bytes} bytes ·
                  SHA-256:{" "}
                  {e.artefacto_sha256}
                </small>

                <p>
                  {e.resultados.limitacion}
                </p>

                {e.motivo && (
                  <p>Revisión: {e.motivo}</p>
                )}

                {puedeRevisar &&
                  e.estado === "pending" && (
                    <div className="gov-buttons">
                      <button
                        disabled={ocupado}
                        onClick={() => revisar(
                          "experiments",
                          e.id,
                          "approved"
                        )}
                      >
                        Aprobar evaluación
                      </button>

                      <button
                        disabled={ocupado}
                        onClick={() => revisar(
                          "experiments",
                          e.id,
                          "rejected"
                        )}
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
              </article>
            ))}
          </div>

          {!experimentos.length && (
            <p>
              No hay experimentos registrados.
            </p>
          )}
        </>
      )}
    </section>
  );
}
