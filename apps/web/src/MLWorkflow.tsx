import ZoneWorkspace from "./ZoneWorkspace";
import {useState} from "react";
import {Link} from "react-router-dom";

import {
  BrainCircuit,
  BarChart3,
  Database,
  ArrowRight
} from "lucide-react";

import GovernancePanel from "./GovernancePanel";
import {MapPinned} from "lucide-react";
import ModelsWorkspace from "./ModelsWorkspace";
import SciencePanels from "./SciencePanels";

import "./ml-workflow.css";
import "./ml-workflow-clean.css";

type Props = {
  peru: boolean;
};

type Vista = "pronosticos" | "modelos" | "analisis";

export default function MLWorkflow({peru}: Props) {
  const [vista, setVista] =
    useState<Vista>("pronosticos");

  return (
    <main className="mlw mlw-clean">
      <header className="mlc-header">
        <div className="mlc-heading">
          <div className="mlc-logo">
            <BrainCircuit size={25}/>
          </div>

          <div>
            <h1>Modelos ML</h1>

          </div>
        </div>

        <span className="mlc-context">
          {peru ? "Perú" : "Global"}
        </span>
      </header>

      <nav
        className="mlc-tabs"
        aria-label="Herramientas de modelos"
      >
        <button
          type="button"
          aria-pressed={vista === "pronosticos"}
          className={
            vista === "pronosticos" ? "active" : ""
          }
          onClick={() => setVista("pronosticos")}
        >
          <MapPinned size={18}/>
          Exploración por zonas
        </button>

        <button
          type="button"
          aria-pressed={vista === "modelos"}
          className={
            vista === "modelos" ? "active" : ""
          }
          onClick={() => setVista("modelos")}
        >
          <BrainCircuit size={18}/>
          Modelos
        </button>

        <button
          type="button"
          aria-pressed={vista === "analisis"}
          className={
            vista === "analisis" ? "active" : ""
          }
          onClick={() => setVista("analisis")}
        >
          <BarChart3 size={18}/>
          Análisis
        </button>
      </nav>

      {vista === "pronosticos" && (
        <section className="mlc-content">
          {/* SISMOIA_ML_GLOBAL_OBSERVADO_V1 */}
<ZoneWorkspace key={peru ? "peru" : "mundo"} peru={peru}/>
        </section>
      )}

      {vista === "modelos" && (
        <section className="mlc-content">
          <div className="mlc-section-head">
            <h2>Entrenar y probar</h2>

            <Link className="mlc-link" to="/datos">
              <Database size={17}/>
              Preparar datos
              <ArrowRight size={16}/>
            </Link>
          </div>

          <GovernancePanel
            seccion="experiments"
            peru={peru}
          />
        </section>
      )}

      {vista === "analisis" && (
        <section className="mlc-content">
          <div className="mlc-section-head">
            <h2>Análisis avanzado</h2>
          </div>

          <ModelsWorkspace peru={peru}/>

          <SciencePanels
            modo="modelos"
            peru={peru}
          />
        </section>
      )}
    </main>
  );
}
