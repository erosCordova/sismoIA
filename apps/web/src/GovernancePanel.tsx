import {
  useContext, useEffect, useState
} from "react";

import {
  TokenContext, UsuarioContext
} from "./AuthGate";

import {Link} from "react-router-dom";
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
    fuente_modelo?: string;
    advertencia_fuentes?: string;
    seleccion_sobre?: string;
    objetivo: string;
    variables: string[];
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
      balanced_accuracy?: number;
      matriz?: number[][];
    }[];
  };
};

function etiquetaEstado(estado: string): string {
  const etiquetas: Record<string, string> = {
    pending: "Pendiente de revisión",
    approved: "Aprobado",
    rejected: "Rechazado"
  };

  return etiquetas[estado] ?? estado;
}


type ResultadoEstimacion = {
  modelo: string;
  estado_modelo: string;
  algoritmo: string;
  objetivo: string;
  estimacion: number;
  categoria: string | null;
  advertencia: string;
};

function PruebaEstimacion({
  experimento,
  habilitado
}: {
  experimento: Experimento;
  habilitado: boolean;
}) {
  const token = useContext(TokenContext);

  const [valores, setValores] =
    useState<Record<string, string>>({});

  const [resultado, setResultado] =
    useState<ResultadoEstimacion | null>(null);

  const [errorPrueba, setErrorPrueba] = useState("");
  const [procesando, setProcesando] = useState(false);

  const nombres: Record<string, string> = {
    profundidad_km: "Profundidad (km)",
    magnitud: "Magnitud observada",
    latitud: "Latitud",
    longitud: "Longitud"
  };

  const ayudas: Record<string, string> = {
    profundidad_km: "Profundidad conocida del evento",
    magnitud: "Magnitud registrada del evento",
    latitud: "Ejemplo para Lima: -12.0464",
    longitud: "Ejemplo para Lima: -77.0428"
  };

  const variables =
    experimento.resultados.variables ?? [];

  async function ejecutarPrueba(
    evento: React.FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    if (!token) {
      setErrorPrueba("Inicia sesión para probar el modelo.");
      return;
    }

    const entrada: Record<string, number> = {};

    for (const variable of variables) {
      const texto = (valores[variable] ?? "").trim();
      const numero = Number(texto);

      if (!texto || !Number.isFinite(numero)) {
        setErrorPrueba(
          "Introduce un número válido en " +
          (nombres[variable] ?? variable)
        );
        return;
      }

      entrada[variable] = numero;
    }

    setProcesando(true);
    setErrorPrueba("");
    setResultado(null);

    try {
      const respuesta = await fetch(
        "/api/v1/governance/experiments/" +
        experimento.id + "/predict",
        {
          method: "POST",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(entrada)
        }
      );

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          typeof datos?.detail === "string"
            ? datos.detail
            : "No fue posible realizar la estimación"
        );
      }

      setResultado(datos as ResultadoEstimacion);
    } catch (error) {
      setErrorPrueba(
        error instanceof Error
          ? error.message
          : String(error)
      );
    } finally {
      setProcesando(false);
    }
  }

  return (
    <details className="gov-try">
      <summary>
        Probar una estimación con este modelo
      </summary>

      <div className="gov-try-body">
        <h4>Introduce los datos del evento</h4>

        <p>
          Completa las variables que utilizó
          el modelo durante su entrenamiento.
          El resultado será una estimación experimental.
        </p>

        {experimento.estado !== "approved" && (
          <p className="gov-try-warning">
            Este modelo está pendiente de aprobación.
            Puedes probarlo, pero no está validado
            para uso operativo.
          </p>
        )}

        <form onSubmit={ejecutarPrueba}>
          <div className="gov-try-fields">
            {variables.map(variable => (
              <label key={variable}>
                <strong>
                  {nombres[variable] ?? variable}
                </strong>

                <small>
                  {ayudas[variable] ?? "Dato requerido"}
                </small>

                <input
                  type="number"
                  step="any"
                  required
                  value={valores[variable] ?? ""}
                  onChange={evento => {
                    setValores(actual => ({
                      ...actual,
                      [variable]: evento.target.value
                    }));

                    setResultado(null);
                  }}
                />
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={
              procesando ||
              !habilitado ||
              !variables.length
            }
          >
            {procesando
              ? "Calculando estimación..."
              : "Probar modelo"}
          </button>
        </form>

        {!habilitado && (
          <p>
            Tu rol no permite ejecutar pruebas de modelos.
          </p>
        )}

        {errorPrueba && (
          <p role="alert" className="gov-error">
            {errorPrueba}
          </p>
        )}

        {resultado && (
          <div className="gov-try-result" role="status">
            <span>RESULTADO DEL MODELO</span>

            <strong>
              {resultado.categoria ??
                resultado.estimacion.toLocaleString(
                  "es-PE",
                  {maximumFractionDigits: 4}
                )}
              {resultado.algoritmo === "regresion" &&
               resultado.objetivo === "profundidad_km"
                ? " km" : ""}
            </strong>

            <p>
              Modelo utilizado: {resultado.modelo}
            </p>

            <p>
              {resultado.advertencia}
            </p>
          </div>
        )}
      </div>
    </details>
  );
}

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
      <header className="gov-hero">
        <span className="gov-eyebrow">
          SISMOIA · LABORATORIO DE MACHINE LEARNING
        </span>

        <h2>
          {seccion === "datasets"
            ? "Prepara tus datos para entrenar"
            : "Entrena y comprende tus modelos"}
        </h2>

        <p>
          {seccion === "datasets"
            ? "Crea un conjunto de datos reales, elige qué deseas estudiar y guárdalo para entrenar."
            : "Selecciona un dataset, entrena un algoritmo y revisa sus resultados antes de aprobarlo."}
        </p>

        <ol className="gov-steps">
          <li className={seccion === "datasets"
            ? "gov-active" : "gov-completed"}>
            <span className="gov-step-number">1</span>
            <div>
              <strong>Preparar datos</strong>
              <small>Crear y revisar el dataset</small>
            </div>
          </li>

          <li className={seccion === "experiments"
            ? "gov-active" : ""}>
            <span className="gov-step-number">2</span>
            <div>
              <strong>Entrenar</strong>
              <small>Seleccionar el algoritmo</small>
            </div>
          </li>

          <li>
            <span className="gov-step-number">3</span>
            <div>
              <strong>Evaluar</strong>
              <small>Comprender los resultados</small>
            </div>
          </li>
        </ol>

        <div className="gov-navigation">
          {seccion === "datasets" ? (
            <Link to="/modelos#ml-entrenamiento">
              Ir al entrenamiento →
            </Link>
          ) : (
            <Link to="/datos">
              ← Crear o revisar un dataset
            </Link>
          )}
        </div>
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
          <h3>Nuevo dataset</h3>


          <div className="gov-instructions">
            <strong>¿Qué debes configurar?</strong>
            <p>
              Pon un nombre a tu estudio, selecciona las
              fuentes y elige la variable que analizarás.
              SISMOIA reservará el 20 % de los registros
              para evaluar los resultados.
            </p>
          </div>

          <div className="gov-form">
            <label>
              Nombre del dataset
              <small className="gov-help">
                Usa un nombre fácil de identificar,
                por ejemplo: Estudio de magnitudes Perú.
              </small>
              <input
                value={nombre}
                maxLength={120}
                onChange={e =>
                  setNombre(e.target.value)
                }
              />
            </label>

            <label>
              Fuente de información
              <small className="gov-help">
                IGP: datos nacionales. USGS: catálogo
                internacional. Puedes utilizar ambas.
              </small>
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
                <option value="5000">5000</option>
                <option value="10000">10000</option>
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

          <h3>Datasets guardados</h3>

          <div className="gov-items">
            {datasets.map(d => (
              <article key={d.id}>
                <div className="gov-itemtop">
                  <strong>{d.nombre}</strong>
                  <span className={`gov-estado gov-estado-${d.estado}`}>
                    {etiquetaEstado(d.estado)}
                  </span>
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
            <div className="gov-empty" role="status">
              <strong>Sin datasets guardados</strong>
              <span>Crea uno con el formulario superior.</span>
            </div>
          )}
        </>
      ) : (
        <>
          <h3>Entrenar modelo</h3>


          <div className="gov-instructions">
            <strong>¿Qué tipo de resultado necesitas?</strong>
            <p>
              Regresión: estima un valor numérico como
              la magnitud. Clasificación: distingue
              magnitudes menores de 4 y magnitudes
              de 4 o superiores.
            </p>
          </div>

          <div className="gov-form">
            <label>
              Dataset para entrenar
              <small className="gov-help">
                Elige el conjunto de datos que creaste
                o uno registrado anteriormente.
              </small>
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
              Tipo de modelo
              <small className="gov-help">
                Escoge regresión para estimar valores
                o clasificación para distinguir categorías.
              </small>
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
              Entrenar modelo y evaluar
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

          <h3>Resultados de los entrenamientos</h3>

          <div className="gov-items">
            {experimentos.map(e => (
              <article key={e.id}>
                <div className="gov-itemtop">
                  <strong>
                    {e.resultados.modelo_seleccionado}
                  </strong>
                  <span className={`gov-estado gov-estado-${e.estado}`}>
                    {etiquetaEstado(e.estado)}
                  </span>
                </div>

                <p>
                  {e.algoritmo} ·
                  {e.resultados.entrenamiento}
                  {" "}entrenamiento ·
                  {e.resultados.validacion}
                  {" "}validación
                </p>

                <div className="gov-interpretacion">
                  {e.algoritmo === "regresion" ? (
                    <>
                      <strong>¿Cómo interpretar esta evaluación?</strong>
                      <p>
                        MAE indica cuánto se equivoca el modelo
                        en promedio. RMSE penaliza más los
                        errores grandes. R² muestra cuánto
                        mejora el ajuste respecto a utilizar
                        una referencia constante.
                      </p>
                      <p>
                        Busca errores pequeños y compara
                        siempre el modelo con la referencia.
                        Un R² cercano a cero indica escasa
                        capacidad explicativa.
                      </p>
                    </>
                  ) : (
                    <>
                      <strong>¿Cómo interpretar esta clasificación?</strong>
                      <p>
                        Precisión indica qué proporción de
                        las predicciones positivas fue correcta.
                        Recall indica cuántos positivos reales
                        identificó el modelo. F1 resume
                        ambas métricas.
                      </p>
                    </>
                  )}
                </div>


                <section
                  className="gov-result-card"
                  aria-label="Resumen del entrenamiento"
                >
                  <div className="gov-result-title">
                    <span>RESULTADO DEL EXPERIMENTO</span>
                    <h4>{e.resultados.modelo_seleccionado}</h4>
                    <p>
                      {e.resultados.entrenamiento} registros
                      para aprender y
                      {" "}{e.resultados.validacion}
                      {" "}para evaluar.
                    </p>
                  </div>

                  {(() => {
                    const m =
                      e.resultados.comparacion.find(
                        item => item.modelo ===
                          e.resultados.modelo_seleccionado
                      ) ?? e.resultados.comparacion[0];

                    if (!m) {
                      return <p>Sin métricas disponibles.</p>;
                    }

                    const mostrar = (valor?: number) =>
                      valor == null || !Number.isFinite(valor)
                        ? "—"
                        : valor.toFixed(3);

                    return (
                      <>
                        <div className="gov-metric-grid">
                          {e.algoritmo === "regresion" ? (
                            <>
                              <div>
                                <span>Error promedio (MAE)</span>
                                <strong>{mostrar(m.mae)}</strong>
                                <small>Menor es mejor</small>
                              </div>
                              <div>
                                <span>Error RMSE</span>
                                <strong>{mostrar(m.rmse)}</strong>
                                <small>Penaliza errores grandes</small>
                              </div>
                              <div>
                                <span>Ajuste R²</span>
                                <strong>{mostrar(m.r2)}</strong>
                                <small>
                                  Comparación con una referencia
                                </small>
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <span>Precisión</span>
                                <strong>
                                  {mostrar(m.precision)}
                                </strong>
                                <small>
                                  Acierto entre positivos estimados
                                </small>
                              </div>
                              <div>
                                <span>Recall</span>
                                <strong>
                                  {mostrar(m.recall)}
                                </strong>
                                <small>
                                  Positivos reales detectados
                                </small>
                              </div>
                              <div>
                                <span>F1</span>
                                <strong>{mostrar(m.f1)}</strong>
                                <small>
                                  Equilibrio de precisión y recall
                                </small>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="gov-result-advice">
                          <strong>
                            ¿Qué significa este resultado?
                          </strong>

                          <p>
                            {e.algoritmo === "regresion"
                              ? m.r2 != null && m.r2 <= 0.1
                                ? "El modelo tiene un ajuste muy bajo. Conviene revisar las variables y compararlo con una referencia antes de aprobarlo."
                                : "Revisa los errores y compáralos con una referencia sencilla. Un entrenamiento exitoso no garantiza buenas estimaciones."
                              : "Compara precisión, recall, F1 y la matriz de confusión. Ninguna métrica aislada demuestra que el modelo sea adecuado."}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </section>


                {(e.resultados.fuente_modelo ||
                  e.resultados.advertencia_fuentes ||
                  e.resultados.comparacion.some(
                    m => typeof m.balanced_accuracy === "number"
                  )) && (
                  <section
                    className="gov-ml-v2-details"
                    aria-label="Evaluación del modelo ML V2"
                  >
                    {e.resultados.fuente_modelo && (
                      <p>
                        <strong>Fuente del modelo: </strong>
                        {e.resultados.fuente_modelo}
                      </p>
                    )}

                    {e.resultados.comparacion.some(
                      m => typeof m.balanced_accuracy === "number"
                    ) && (
                      <div>
                        <strong>
                          Exactitud balanceada por algoritmo
                        </strong>

                        <div className="gov-ml-v2-scores">
                          {e.resultados.comparacion.map(m => (
                            <div
                              key={m.modelo}
                              className={
                                m.modelo ===
                                e.resultados.modelo_seleccionado
                                  ? "gov-ml-v2-score gov-ml-v2-selected"
                                  : "gov-ml-v2-score"
                              }
                            >
                              <span>{m.modelo}</span>
                              <strong>
                                {typeof m.balanced_accuracy === "number"
                                  ? `${(
                                      m.balanced_accuracy * 100
                                    ).toFixed(2)} %`
                                  : "No disponible"}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {e.resultados.advertencia_fuentes && (
                      <p className="gov-ml-v2-warning">
                        {e.resultados.advertencia_fuentes}
                      </p>
                    )}

                    <p className="gov-ml-v2-caption">
                      La elección del algoritmo utiliza datos
                      de desarrollo. Los resultados mostrados
                      corresponden a una evaluación cronológica
                      posterior. No pronostican terremotos futuros.
                    </p>
                  </section>
                )}

                <div className="gov-tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Modelo</th>
                        <th title="Error absoluto medio; menor es mejor">MAE</th>
                        <th title="Raíz del error cuadrático medio">RMSE</th>
                        <th title="Coeficiente de determinación">R²</th>
                        <th title="Proporción de predicciones positivas correctas">Precisión</th>
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

                <PruebaEstimacion
                  experimento={e}
                  habilitado={puedeCrear}
                />

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
            <div className="gov-empty" role="status">
              <strong>Sin modelos todavía</strong>
              <span>Prepara un dataset para entrenar.</span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
