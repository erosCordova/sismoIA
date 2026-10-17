import {useState} from "react";
import {Link} from "react-router-dom";

import {
  BrainCircuit,
  Database,
  BarChart3,
  ArrowRight,
  Info
} from "lucide-react";

import GovernancePanel from "./GovernancePanel";
import ModelsWorkspace from "./ModelsWorkspace";
import SciencePanels from "./SciencePanels";

import "./ml-workflow.css";
import "./ml-workflow-clean.css";

type Props = {
  peru: boolean;
};

type Vista = "datos" | "modelos" | "analisis";

export default function MLWorkflow({peru}: Props) {
  const [vista, setVista] = useState<Vista>("datos");

  const [revision, setRevision] = useState(0);

  return (
    <main className="mlw mlw-clean">

      <header className="mlc-header">
        <div className="mlc-heading">
          <div className="mlc-logo">
            <BrainCircuit size={26}/>
          </div>

          <div>
            <h1>Machine Learning</h1>
            <p>Entrenamiento y análisis sísmico</p>
          </div>
        </div>

        <span className="mlc-context">
          {peru ? "Perú" : "Global"}
        </span>
      </header>

      <nav
        className="mlc-tabs"
        aria-label="Áreas de Machine Learning"
      >
        <button
          type="button"
          className={vista === "datos" ? "active" : ""}
          aria-pressed={vista === "datos"}
          onClick={() => setVista("datos")}
        >
          <Database size={19}/>
          Datos
        </button>

        <button
          type="button"
          className={vista === "modelos" ? "active" : ""}
          aria-pressed={vista === "modelos"}
          onClick={() => setVista("modelos")}
        >
          <BrainCircuit size={19}/>
          Modelos
        </button>

        <button
          type="button"
          className={vista === "analisis" ? "active" : ""}
          aria-pressed={vista === "analisis"}
          onClick={() => setVista("analisis")}
        >
          <BarChart3 size={19}/>
          Análisis
        </button>
      </nav>

      {vista === "datos" && (
        <section className="mlc-content">
          <div className="mlc-section-head">
            <div>
              <h2>Conjuntos de datos</h2>
              <p>Configura y administra tus datasets.</p>
            </div>

            <Link
              className="mlc-link"
              to="/datos"
            >
              Preparación de datos
              <ArrowRight size={16}/>
            </Link>
          </div>

          <GovernancePanel
            seccion="datasets"
            peru={peru}
            onDataUpdated={() =>
              setRevision(actual => actual + 1)
            }
          />
        </section>
      )}

      {vista === "modelos" && (
        <section className="mlc-content">
          <div className="mlc-section-head">
            <div>
              <h2>Entrenamiento y resultados</h2>
              <p>Entrena, compara y prueba tus modelos.</p>
            </div>
          </div>

          <GovernancePanel
            key={revision}
            seccion="experiments"
            peru={peru}
          />
        </section>
      )}

      {vista === "analisis" && (
        <section className="mlc-content">
          <div className="mlc-section-head">
            <div>
              <h2>Análisis de modelos</h2>
              <p>Herramientas y métricas avanzadas.</p>
            </div>
          </div>

          <ModelsWorkspace/>

          <SciencePanels
            modo="modelos"
            peru={peru}
          />
        </section>
      )}

      <footer className="mlc-footer">
        <Info size={16}/>
        <span>
          Resultados experimentales basados en
          datos observados. No pronostican
          terremotos futuros.
        </span>
      </footer>

    </main>
  );
}
