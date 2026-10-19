import {useContext, useEffect, useState} from "react";
import {apiError} from "./apiErrors";
import {
  Database, Download, RefreshCw, ShieldCheck
} from "lucide-react";
import {TokenContext} from "./AuthGate";
import "./preparation.css";

type Registro = {
  id: string;
  fecha_utc: string;
  fuente: string;
  magnitud: number;
  profundidad_km: number | null;
  latitud: number;
  longitud: number;
  estado_calidad: string;
  banderas: string[];
  particion: string;
  profundidad_imputada: boolean;
};

type Reporte = {
  version: {
    codigo: string;
    total_catalogo: number;
    ultima_recepcion_utc: string | null;
  };
  total_muestra: number;
  limitado: boolean;
  seleccionados: number;
  entrenamiento: number;
  validacion: number;
  estados: Record<string, number>;
  banderas: Record<string, number>;
  objetivo: string;
  variables_entrada: string[];
  imputacion_profundidad: number | null;
  magnitud: {
    media: number | null;
    mediana: number | null;
    q1: number | null;
    q3: number | null;
    iqr: number | null;
    atipicos_iqr: number;
  };
  profundidad: {
    mediana: number | null;
    faltantes: number;
  };
  reglas: string[];
  vista_previa: Registro[];
  nota: string;
};

type Filtros = {
  fuente: string;
  fecha_desde: string;
  fecha_hasta: string;
  solo_validos: boolean;
  imputar_profundidad: boolean;
  objetivo: string;
};

const inicial: Filtros = {
  fuente: "",
  fecha_desde: "",
  fecha_hasta: "",
  solo_validos: false,
  imputar_profundidad: false,
  objetivo: "magnitud"
};

const numero = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("es-PE", {
        maximumFractionDigits: 3
      });

export default function PreparationWorkspace({
  peru
}: {
  peru: boolean
}) {
  const token = useContext(TokenContext);

  const [formulario, setFormulario] =
    useState<Filtros>(inicial);

  const [filtros, setFiltros] =
    useState<Filtros>(inicial);

  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");

  const parametros = (f: Filtros) => {
    const p = new URLSearchParams({
      peru: String(peru),
      solo_validos: String(f.solo_validos),
      imputar_profundidad: String(f.imputar_profundidad),
      objetivo: f.objetivo
    });

    if (f.fuente) p.set("fuente", f.fuente);

    if (f.fecha_desde) {
      p.set("fecha_desde", f.fecha_desde);
    }

    if (f.fecha_hasta) {
      p.set("fecha_hasta", f.fecha_hasta);
    }

    return p;
  };

  useEffect(() => {
    if (!token) return;

    const ctrl = new AbortController();

    async function cargar() {
      setCargando(true);
      setError("");
      setReporte(null);

      try {
        const r = await fetch(
          `/api/v1/preparation/dataset-report?${parametros(filtros)}`,
          {
            signal: ctrl.signal,
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!r.ok) {
          throw Error(
            await apiError(r, "No se pudo consultar el dataset")
          );
        }

        const resultado: Reporte = await r.json();

        if (!ctrl.signal.aborted) {
          setReporte(resultado);
        }
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setError(
            e instanceof Error
              ? e.message
              : "Error de consulta"
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

  }, [token, filtros, peru, revision]);

  function aplicar() {
    if (
      formulario.fecha_desde &&
      formulario.fecha_hasta &&
      formulario.fecha_desde > formulario.fecha_hasta
    ) {
      setError("Revisa el intervalo de fechas.");
      return;
    }

    setFiltros({...formulario});
    setRevision(v => v + 1);
  }

  async function exportar() {
    if (!token || !reporte) return;

    setExportando(true);
    setError("");

    try {
      const r = await fetch(
        `/api/v1/preparation/dataset-export?${parametros(filtros)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!r.ok) {
        throw Error(await apiError(r, "No se pudo exportar el dataset"));
      }

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${reporte.version.codigo}_preparado.csv`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo exportar"
      );
    } finally {
      setExportando(false);
    }
  }

  return (
    <section className="prep-root">
      <header className="prep-header">
        <div>
          <h2>
            <Database size={23}/>
            Preparación de datos
          </h2>

          <p>
            Conjuntos de datos para Machine Learning
            {" · "}{peru ? "Perú" : "Mundo"}
          </p>
        </div>

        <div className="prep-actions">
          <button
            onClick={() => setRevision(v => v + 1)}
            disabled={cargando}
          >
            <RefreshCw size={16}/> Actualizar
          </button>

          <button
            className="prep-download"
            disabled={!reporte || exportando}
            onClick={() => void exportar()}
          >
            <Download size={16}/>
            {exportando ? "Exportando..." : "Exportar CSV"}
          </button>
        </div>
      </header>

      <div className="sismo-filter-bar">
        <label>
          Fuente
          <select
            value={formulario.fuente}
            onChange={e => setFormulario(f => ({
              ...f, fuente: e.target.value
            }))}
          >
            <option value="">Todas</option>
            <option value="USGS">USGS</option>
            <option value="IGP">IGP</option>
          </select>
        </label>

        <label>
          Desde (UTC)
          <input
            type="date"
            value={formulario.fecha_desde}
            onChange={e => setFormulario(f => ({
              ...f, fecha_desde: e.target.value
            }))}
          />
        </label>

        <label>
          Hasta (UTC)
          <input
            type="date"
            value={formulario.fecha_hasta}
            onChange={e => setFormulario(f => ({
              ...f, fecha_hasta: e.target.value
            }))}
          />
        </label>

        <label>
          Variable objetivo
          <select
            value={formulario.objetivo}
            onChange={e => setFormulario(f => ({
              ...f, objetivo: e.target.value
            }))}
          >
            <option value="magnitud">Magnitud</option>
            <option value="profundidad_km">
              Profundidad (km)
            </option>
          </select>
        </label>

        <label className="sismo-check">
          <input
            type="checkbox"
            checked={formulario.solo_validos}
            onChange={e => setFormulario(f => ({
              ...f, solo_validos: e.target.checked
            }))}
          />
          Solo registros válidos
        </label>

        <label className="sismo-check">
          <input
            type="checkbox"
            checked={formulario.imputar_profundidad}
            disabled={formulario.objetivo === "profundidad_km"}
            onChange={e => setFormulario(f => ({
              ...f, imputar_profundidad: e.target.checked
            }))}
          />
          Imputar profundidad faltante
        </label>

        <button
          className="sismo-filter-button"
          onClick={aplicar}
          disabled={cargando}
        >
          Preparar conjunto
        </button>
      </div>

      {error && <p role="alert" className="prep-error">{error}</p>}

      {cargando && (
        <p className="prep-loading">
          Preparando y validando registros...
        </p>
      )}

      {reporte && (
        <>
          <article className="prep-card">
            <h3>
              <ShieldCheck size={19}/>
              Identificación del conjunto
            </h3>

            <div className="prep-detail">
              <span>Versión de consulta</span>
              <strong>{reporte.version.codigo}</strong>
            </div>

            <div className="prep-detail">
              <span>Registros en el catálogo filtrado</span>
              <strong>
                {numero(reporte.version.total_catalogo)}
              </strong>
            </div>

            <div className="prep-detail">
              <span>Filas evaluadas</span>
              <strong>{numero(reporte.total_muestra)}</strong>
            </div>

            <div className="prep-detail">
              <span>Variable objetivo</span>
              <strong>{reporte.objetivo}</strong>
            </div>

            <div className="prep-detail">
              <span>Variables de entrada</span>
              <strong>
                {reporte.variables_entrada.join(", ")}
              </strong>
            </div>

            {reporte.limitado && (
              <p className="prep-loading">
                Se analizaron los 10 000 registros más recientes
                que cumplen los filtros. El catálogo contiene
                registros adicionales.
              </p>
            )}
          </article>

          <div className="prep-metrics">
            <article>
              <span>Registros seleccionados</span>
              <strong>{numero(reporte.seleccionados)}</strong>
            </article>

            <article>
              <span>Entrenamiento (80%)</span>
              <strong>{numero(reporte.entrenamiento)}</strong>
            </article>

            <article>
              <span>Validación (20%)</span>
              <strong>{numero(reporte.validacion)}</strong>
            </article>

            <article>
              <span>Válidos en muestra</span>
              <strong>
                {numero(reporte.estados.VALIDO ?? 0)}
              </strong>
            </article>

            <article>
              <span>Requieren revisión</span>
              <strong>
                {numero(reporte.estados.REVISAR ?? 0)}
              </strong>
            </article>

            <article>
              <span>Profundidades faltantes</span>
              <strong>
                {numero(reporte.profundidad.faltantes)}
              </strong>
            </article>
          </div>

          <div className="prep-grid">
            <article className="prep-card">
              <h3>Estadísticas de magnitud</h3>
              {[
                ["Media", reporte.magnitud.media],
                ["Mediana", reporte.magnitud.mediana],
                ["Primer cuartil (Q1)", reporte.magnitud.q1],
                ["Tercer cuartil (Q3)", reporte.magnitud.q3],
                ["Rango intercuartílico (IQR)", reporte.magnitud.iqr],
                ["Atípicos detectados", reporte.magnitud.atipicos_iqr]
              ].map(([nombre, valor]) => (
                <div className="prep-detail" key={String(nombre)}>
                  <span>{nombre}</span>
                  <strong>{numero(valor as number | null)}</strong>
                </div>
              ))}
            </article>

            <article className="prep-card">
              <h3>Diagnóstico de calidad</h3>

              {Object.entries(reporte.banderas).map(
                ([nombre, cantidad]) => (
                  <div className="prep-detail" key={nombre}>
                    <span>
                      {nombre.replaceAll("_", " ")}
                    </span>
                    <strong>{numero(cantidad)}</strong>
                  </div>
                )
              )}

              {!Object.keys(reporte.banderas).length && (
                <p>
                  No se detectaron banderas de calidad
                  en la muestra evaluada.
                </p>
              )}

              <div className="prep-detail">
                <span>Mediana de imputación calculada</span>
                <strong>
                  {reporte.imputacion_profundidad === null
                    ? "No aplicada"
                    : `${numero(reporte.imputacion_profundidad)} km`}
                </strong>
              </div>
            </article>
          </div>

          <article className="prep-card">
            <h3>Reglas y trazabilidad</h3>

            <div className="sismo-rules">
              {reporte.reglas.map((regla, i) => (
                <div key={regla}>
                  <span>{i + 1}</span>
                  {regla}
                </div>
              ))}
            </div>
          </article>

          <article className="prep-card">
            <h3>Vista previa de datos preparados</h3>
            <p>
              Hasta 80 registros de los
              {" "}{numero(reporte.seleccionados)}
              {" "}seleccionados.
            </p>

            <div className="prep-table-wrap">
              <table className="prep-table">
                <thead>
                  <tr>
                    <th>Fecha UTC</th>
                    <th>Fuente</th>
                    <th>Magnitud</th>
                    <th>Profundidad</th>
                    <th>Latitud</th>
                    <th>Longitud</th>
                    <th>Calidad</th>
                    <th>Partición</th>
                  </tr>
                </thead>

                <tbody>
                  {reporte.vista_previa.map(r => (
                    <tr key={r.id}>
                      <td>
                        {new Date(r.fecha_utc).toLocaleString(
                          "es-PE",
                          {
                            timeZone: "UTC",
                            dateStyle: "short",
                            timeStyle: "short"
                          }
                        )}
                      </td>
                      <td>{r.fuente}</td>
                      <td>{numero(r.magnitud)}</td>
                      <td>
                        {r.profundidad_km === null
                          ? "—"
                          : `${numero(r.profundidad_km)} km`}
                        {r.profundidad_imputada && " *"}
                      </td>
                      <td>{r.latitud.toFixed(4)}</td>
                      <td>{r.longitud.toFixed(4)}</td>
                      <td title={r.banderas.join(", ")}>
                        {r.estado_calidad}
                      </td>
                      <td>{r.particion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <p className="prep-footer">
            {reporte.nota} La separación temporal prepara
            los datos para validación; todavía no representa
            resultados de entrenamiento. La aprobación formal
            del dataset deberá realizarse mediante un
            procedimiento autorizado y auditable.
          </p>
        </>
      )}
    </section>
  );
}
