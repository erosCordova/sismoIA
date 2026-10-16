import {
  useContext, useState
} from "react";

import {Link} from "react-router-dom";

import {
  BrainCircuit, ChevronDown,
  ArrowRight, Info
} from "lucide-react";

import {
  UsuarioContext
} from "./AuthGate";

import PreparationWorkspace
  from "./PreparationWorkspace";

import SciencePanels
  from "./SciencePanels";

import GovernancePanel
  from "./GovernancePanel";

import ModelsWorkspace
  from "./ModelsWorkspace";

import "./ml-workflow.css";

type Props = {
  peru: boolean;
};

export default function MLWorkflow({peru}: Props) {
  const usuario = useContext(UsuarioContext);

  const [revisionDataset, setRevisionDataset] =
    useState(0);

  const [mostrarAvanzado, setMostrarAvanzado] =
    useState(false);

  const permisos = usuario?.permisos ?? [];

  const puedeVerDatos =
    permisos.includes("*") ||
    permisos.includes("datasets:read");

  const pasos = [
    ["ml-paso-1", "Preparar datos"],
    ["ml-paso-2", "Verificar calidad"],
    ["ml-paso-3", "Guardar dataset"],
    ["ml-paso-4", "Entrenar modelo"],
    ["ml-paso-5", "Análisis adicional"]
  ];

  return (
    <div className="mlw">
      <header className="mlw-header">
        <div className="mlw-headline">
          <BrainCircuit size={27}/>

          <div>
            <h2>
              Machine Learning paso a paso
            </h2>

            <p>
              Sigue los apartados de arriba hacia
              abajo para preparar, entrenar y
              evaluar tus modelos.
            </p>
          </div>
        </div>

        <div className="mlw-notice">
          <Info size={20}/>

          <span>
            El entrenamiento se inicia manualmente
            cuando pulses el botón correspondiente.
            Los resultados son experimentales y
            no predicen futuros terremotos.
          </span>
        </div>

        <nav
          className="mlw-nav"
          aria-label="Etapas del entrenamiento"
        >
          {pasos.map(([id, nombre], i) => (
            <a key={id} href={`#${id}`}>
              {i + 1}. {nombre}
            </a>
          ))}
        </nav>
      </header>

      <section
        className="mlw-stage"
        id="ml-paso-1"
      >
        <div className="mlw-stage-head">
          <span className="mlw-number">1</span>

          <div>
            <h3>Preparar los datos sísmicos</h3>

            <p>
              Primero revisa los eventos y sus
              características. Estos registros
              serán la base de los experimentos.
            </p>
          </div>
        </div>

        {puedeVerDatos ? (
          <PreparationWorkspace peru={peru}/>
        ) : (
          <p className="mlw-message">
            Tu rol no permite consultar los
            detalles de preparación de datos.
          </p>
        )}
      </section>

      <section
        className="mlw-stage"
        id="ml-paso-2"
      >
        <div className="mlw-stage-head">
          <span className="mlw-number">2</span>

          <div>
            <h3>Comprobar la calidad de los datos</h3>

            <p>
              Revisa los valores faltantes,
              las reglas de limpieza y la
              distribución temporal de los datos
              antes de crear una versión.
            </p>
          </div>
        </div>

        {puedeVerDatos ? (
          <SciencePanels
            modo="datos"
            peru={peru}
          />
        ) : (
          <p className="mlw-message">
            No tienes permisos para consultar
            el informe de calidad.
          </p>
        )}
      </section>

      <section
        className="mlw-stage"
        id="ml-paso-3"
      >
        <div className="mlw-stage-head">
          <span className="mlw-number">3</span>

          <div>
            <h3>
              Registrar los datos para entrenar
            </h3>

            <p>
              Configura el conjunto de datos,
              pulsa «Registrar dataset» y
              comprueba que aparezca en la lista
              de versiones existentes.
            </p>
          </div>
        </div>

        <GovernancePanel
          seccion="datasets"
          peru={peru}
          onDataUpdated={() =>
            setRevisionDataset(v => v + 1)
          }
        />
      </section>

      <section
        className="mlw-stage"
        id="ml-paso-4"
      >
        <div className="mlw-stage-head">
          <span className="mlw-number">4</span>

          <div>
            <h3>
              Entrenar y revisar los resultados
            </h3>

            <p>
              Selecciona el dataset del paso 3,
              elige regresión o clasificación y
              pulsa «Entrenar y guardar».
              Después podrás consultar las
              métricas del experimento y su
              estado de revisión.
            </p>
          </div>
        </div>

        <GovernancePanel
          key={revisionDataset}
          seccion="experiments"
          peru={peru}
        />
      </section>

      <section
        className="mlw-stage"
        id="ml-paso-5"
      >
        <div className="mlw-stage-head">
          <span className="mlw-number">5</span>

          <div>
            <h3>
              Explorar análisis adicionales
            </h3>

            <p>
              Aquí se conservan los gráficos,
              comparaciones y el laboratorio
              supervisado original. Puedes
              utilizarlos cuando quieras
              profundizar en los resultados.
            </p>
          </div>
        </div>

        <button
          className="mlw-expand"
          type="button"
          aria-expanded={mostrarAvanzado}
          onClick={() =>
            setMostrarAvanzado(v => !v)
          }
        >
          <ChevronDown size={18}/>

          {mostrarAvanzado
            ? "Ocultar análisis adicionales"
            : "Mostrar análisis adicionales"}
        </button>

        {mostrarAvanzado && (
          <div className="mlw-extra">
            <ModelsWorkspace/>

            <SciencePanels
              modo="modelos"
              peru={peru}
            />
          </div>
        )}
      </section>

      <footer className="mlw-footer">
        <h3>¿Y las estimaciones sísmicas?</h3>

        <p>
          En la sección Estimaciones puedes
          consultar indicadores estadísticos
          históricos. Son análisis descriptivos,
          no pronósticos de terremotos.
        </p>

        <Link to="/estimaciones">
          Ir a Estimaciones
          <ArrowRight size={17}/>
        </Link>
      </footer>
    </div>
  );
}
