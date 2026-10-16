import {useState} from "react";
import {Link} from "react-router-dom";

import {
  BrainCircuit,
  Database,
  ArrowRight,
  ChevronDown,
  BarChart3,
  Info
} from "lucide-react";

import GovernancePanel from "./GovernancePanel";
import ModelsWorkspace from "./ModelsWorkspace";
import SciencePanels from "./SciencePanels";

import "./ml-workflow.css";

type Props = {
  peru: boolean;
};

export default function MLWorkflow({peru}: Props) {
  const [mostrarAvanzado, setMostrarAvanzado] =
    useState(false);

  return (
    <div className="mlw">

      <header className="mlw-header">
        <div className="mlw-headline">
          <BrainCircuit size={27}/>

          <div>
            <h2>Modelos de Machine Learning</h2>

            <p>
              Entrena modelos, compara sus resultados
              y revisa los experimentos registrados.
            </p>
          </div>
        </div>

        <div className="mlw-notice">
          <Database size={22}/>

          <div>
            <strong>
              Primero prepara y registra tus datos
            </strong>

            <p>
              La limpieza, calidad, registro y
              aprobación de datasets se realizan
              exclusivamente en el módulo
              Preparación de datos.
            </p>

            <Link to="/datos">
              Ir a Preparación de datos
              <ArrowRight size={17}/>
            </Link>
          </div>
        </div>

        <nav
          className="mlw-nav"
          aria-label="Apartados de Modelos ML"
        >
          <a href="#ml-entrenamiento">
            1. Entrenar y revisar
          </a>

          <a href="#ml-analisis">
            2. Análisis adicionales
          </a>
        </nav>
      </header>

      <section
        className="mlw-stage"
        id="ml-entrenamiento"
      >
        <div className="mlw-stage-head">
          <span className="mlw-number">1</span>

          <div>
            <h3>
              Entrenar y revisar los resultados
            </h3>

            <p>
              Selecciona un dataset registrado,
              elige regresión o clasificación
              y pulsa «Entrenar y guardar».
            </p>

            <p>
              Debajo encontrarás los experimentos
              registrados, sus métricas y
              sus estados de revisión.
            </p>
          </div>
        </div>

        <GovernancePanel
          seccion="experiments"
          peru={peru}
        />
      </section>

      <section
        className="mlw-stage"
        id="ml-analisis"
      >
        <div className="mlw-stage-head">
          <span className="mlw-number">2</span>

          <div>
            <h3>
              Análisis adicionales
            </h3>

            <p>
              Explora agrupaciones, comparaciones
              y laboratorios experimentales.
              Estos análisis son complementarios
              al entrenamiento registrado.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="mlw-expand"
          aria-expanded={mostrarAvanzado}
          onClick={() =>
            setMostrarAvanzado(v => !v)
          }
        >
          <BarChart3 size={18}/>

          {mostrarAvanzado
            ? "Ocultar análisis avanzados"
            : "Mostrar análisis avanzados"}

          <ChevronDown size={18}/>
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
        <div className="mlw-headline">
          <Info size={20}/>

          <div>
            <h3>Consulta de estimaciones</h3>

            <p>
              Las estimaciones actuales describen
              estadísticas históricas; no son
              predicciones del próximo terremoto
              ni resultados automáticos de los
              modelos entrenados.
            </p>

            <Link to="/estimaciones">
              Ir a Estimaciones
              <ArrowRight size={17}/>
            </Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
