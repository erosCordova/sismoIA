import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Database,
  Globe2,
  LockKeyhole,
  MapPinned,
  ShieldCheck
} from "lucide-react";

import "./landing.css";

type Props = {
  onIngresar: () => void;
};

const funciones = [
  {
    Icono: Globe2,
    titulo: "Monitoreo sísmico",
    descripcion:
      "Explora eventos registrados en Perú y el mundo mediante mapas interactivos."
  },
  {
    Icono: BarChart3,
    titulo: "Análisis de datos",
    descripcion:
      "Consulta distribuciones, magnitudes, registros históricos y tendencias."
  },
  {
    Icono: MapPinned,
    titulo: "Pronósticos experimentales",
    descripcion:
      "Examina estimaciones probabilísticas por zonas y períodos."
  },
  {
    Icono: Bell,
    titulo: "Alertas configurables",
    descripcion:
      "Gestiona reglas para identificar eventos que cumplen tus criterios."
  },
  {
    Icono: Database,
    titulo: "Catálogo sísmico",
    descripcion:
      "Filtra y consulta información de las fuentes sísmicas disponibles."
  },
  {
    Icono: ShieldCheck,
    titulo: "Gestión de accesos",
    descripcion:
      "Trabaja con cuentas y permisos según las funciones autorizadas."
  }
];

export default function LandingPage({ onIngresar }: Props) {
  return (
    <div className="lp-root" id="inicio">
      <header className="lp-header">
        <div className="lp-container lp-header-inner">
          <a className="lp-brand" href="#inicio">
            <span className="lp-brand-icon">
              <Activity size={23} strokeWidth={2.5} />
            </span>
            <span>
              <strong>SISMOIA</strong>
              <small>ENTERPRISE</small>
            </span>
          </a>

          <nav className="lp-navigation" aria-label="Navegación">
            <a href="#funcionalidades">Funcionalidades</a>
            <a href="#plataforma">La plataforma</a>
          </nav>

          <button
            type="button"
            className="lp-access"
            onClick={onIngresar}
          >
            Iniciar sesión
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-container lp-hero-grid">
            <div className="lp-hero-copy">
              <div className="lp-eyebrow">
                <span className="lp-live-dot" />
                PLATAFORMA DE ANÁLISIS SÍSMICO
              </div>

              <h1>
                Comprende la actividad sísmica
                <span> del mundo.</span>
              </h1>

              <p className="lp-hero-description">
                Monitorea eventos registrados, analiza
                información histórica y explora
                estimaciones probabilísticas experimentales
                desde una sola plataforma.
              </p>

              <div className="lp-hero-actions">
                <button
                  type="button"
                  className="lp-primary"
                  onClick={onIngresar}
                >
                  Acceder a SISMOIA
                  <ArrowRight size={19} aria-hidden="true" />
                </button>

                <a
                  className="lp-secondary"
                  href="#funcionalidades"
                >
                  Explorar funcionalidades
                </a>
              </div>

              <div className="lp-hero-highlights">
                <span>
                  <Globe2 size={16} />
                  Perú y mundo
                </span>

                <span>
                  <BarChart3 size={16} />
                  Análisis histórico
                </span>

                <span>
                  <ShieldCheck size={16} />
                  Acceso por roles
                </span>
              </div>
            </div>

            <div className="lp-visual">
              <div className="lp-demo-card">
                <div className="lp-demo-top">
                  <span className="lp-demo-brand">
                    <Activity size={19} />
                    SISMOIA
                  </span>

                  <span className="lp-demo-status">
                    Vista ilustrativa
                  </span>
                </div>

                <div className="lp-demo-heading">
                  <div>
                    <small>EXPLORACIÓN GEOGRÁFICA</small>
                    <strong>Actividad sísmica global</strong>
                  </div>
                  <Globe2 size={22} />
                </div>

                <div className="lp-map-preview">
                  <svg
                    viewBox="0 0 520 280"
                    role="img"
                    aria-label="Ilustración de un mapa mundial con puntos sísmicos"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <defs>
                      <pattern
                        id="lp-grid"
                        width="26"
                        height="26"
                        patternUnits="userSpaceOnUse"
                      >
                        <path
                          d="M 26 0 L 0 0 0 26"
                          fill="none"
                          stroke="#28627c"
                          strokeWidth=".6"
                          opacity=".45"
                        />
                      </pattern>
                    </defs>

                    <rect
                      width="520"
                      height="280"
                      rx="12"
                      fill="#09263e"
                    />

                    <rect
                      width="520"
                      height="280"
                      fill="url(#lp-grid)"
                    />

                    <g
                      fill="#26566a"
                      stroke="#3e8591"
                      strokeWidth="1.3"
                      opacity=".9"
                    >
                      <path d="M33 65 L70 41 128 47 151 65 140 94 114 108 104 138 82 127 72 103 48 94 Z" />
                      <path d="M120 135 L155 143 169 169 156 202 145 241 130 263 119 229 123 199 108 168 Z" />
                      <path d="M219 83 L247 66 267 75 283 99 267 117 242 109 227 126 212 110 Z" />
                      <path d="M230 133 L278 128 301 151 288 185 268 230 250 223 242 189 216 159 Z" />
                      <path d="M278 60 L335 39 398 46 448 65 482 86 467 115 435 127 418 116 398 140 370 129 351 105 308 112 287 94 Z" />
                      <path d="M397 154 L422 162 432 180 416 192 404 174 Z" />
                      <path d="M422 209 L461 207 481 224 466 243 439 244 417 228 Z" />
                    </g>

                    <g fill="none" stroke="#69d8db" opacity=".45">
                      <circle cx="137" cy="172" r="18" />
                      <circle cx="137" cy="172" r="33" />
                      <circle cx="395" cy="111" r="15" />
                      <circle cx="395" cy="111" r="29" />
                      <circle cx="453" cy="226" r="17" />
                    </g>

                    <g fill="#76f0e3" stroke="#d6fffa" strokeWidth="2">
                      <circle cx="137" cy="172" r="5" />
                      <circle cx="395" cy="111" r="5" />
                      <circle cx="453" cy="226" r="5" />
                      <circle cx="94" cy="119" r="4" />
                      <circle cx="292" cy="145" r="4" />
                    </g>

                    <g fill="#efad62">
                      <circle cx="372" cy="106" r="4" />
                      <circle cx="149" cy="198" r="4" />
                    </g>
                  </svg>

                  <span className="lp-map-label">
                    Representación visual · No son eventos reales
                  </span>
                </div>

                <div className="lp-demo-bottom">
                  <span>
                    <span className="lp-legend-dot" />
                    Monitoreo y visualización
                  </span>

                  <span>USGS · IGP</span>
                </div>
              </div>

              <div className="lp-floating-card">
                <span className="lp-floating-icon">
                  <BarChart3 size={20} />
                </span>
                <div>
                  <strong>Datos y análisis</strong>
                  <small>Información para explorar</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="lp-features"
          id="funcionalidades"
        >
          <div className="lp-container">
            <div className="lp-section-heading">
              <span className="lp-section-kicker">
                FUNCIONALIDADES
              </span>

              <h2>
                Herramientas para comprender
                los datos sísmicos
              </h2>

              <p>
                Desde la observación de eventos hasta
                el análisis experimental, SISMOIA reúne
                herramientas para explorar información.
              </p>
            </div>

            <div className="lp-features-grid">
              {funciones.map(({ Icono, titulo, descripcion }) => (
                <article
                  className="lp-feature"
                  key={titulo}
                >
                  <span className="lp-feature-icon">
                    <Icono
                      size={23}
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                  </span>

                  <h3>{titulo}</h3>
                  <p>{descripcion}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="lp-platform"
          id="plataforma"
        >
          <div className="lp-container lp-platform-grid">
            <div>
              <span className="lp-section-kicker">
                UNA PLATAFORMA INTEGRADA
              </span>

              <h2>
                De los registros a
                la información útil.
              </h2>

              <p>
                SISMOIA combina fuentes de datos,
                visualizaciones y herramientas de análisis
                para facilitar la interpretación de
                actividad sísmica histórica.
              </p>

              <div className="lp-platform-steps">
                <div>
                  <span>01</span>
                  <strong>Consulta los registros</strong>
                  <p>Explora la información disponible de las fuentes.</p>
                </div>

                <div>
                  <span>02</span>
                  <strong>Analiza los resultados</strong>
                  <p>Revisa gráficos, magnitudes y distribuciones.</p>
                </div>

                <div>
                  <span>03</span>
                  <strong>Estudia las estimaciones</strong>
                  <p>Interpreta probabilidades experimentales con sus límites.</p>
                </div>
              </div>
            </div>

            <div className="lp-platform-panel">
              <div className="lp-panel-icon">
                <LockKeyhole size={30} />
              </div>

              <h3>Tu espacio de trabajo</h3>

              <p>
                Ingresa con tu cuenta autorizada
                para acceder a las funciones habilitadas
                según tu rol.
              </p>

              <button
                type="button"
                className="lp-primary"
                onClick={onIngresar}
              >
                Iniciar sesión
                <ArrowRight size={18} />
              </button>

              <div className="lp-panel-foot">
                <ShieldCheck size={16} />
                Autenticación del sistema existente
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <span>
            <Activity size={18} />
            SISMOIA Enterprise
          </span>

          <p>
            Las estimaciones sísmicas son experimentales
            y no constituyen alertas oficiales.
          </p>
        </div>
      </footer>
    </div>
  );
}
