import {
  lazy, Suspense, useContext, useEffect, useState
} from "react";
import {
  BrowserRouter, NavLink, Link, useLocation
} from "react-router-dom";
import {
  Activity, LayoutDashboard, MapPinned, BarChart3,
  Database, BrainCircuit, TrendingUp, SlidersHorizontal,
  Bell, Radio, FileText, Users, ShieldCheck,
  Globe2, MapPin, Search, Menu, X, UserRound,
  type LucideIcon
} from "lucide-react";

import { TokenContext, UsuarioContext } from "./AuthGate";
import "./sismoia-shell.css";

type Modulo = {
  nombre: string;
  ruta: string;
  grupo: string;
  icono: LucideIcon;
  permiso: string;
};

const modulos: Modulo[] = [
  {nombre:"Dashboard", ruta:"/", grupo:"Monitoreo", icono:LayoutDashboard, permiso:"dashboard:read"},
  {nombre:"Eventos sísmicos", ruta:"/eventos", grupo:"Monitoreo", icono:Activity, permiso:"events:read"},
  {nombre:"Mapa sísmico", ruta:"/mapa", grupo:"Monitoreo", icono:MapPinned, permiso:"map:read"},
  {nombre:"Análisis estadístico", ruta:"/analisis", grupo:"Monitoreo", icono:BarChart3, permiso:"analytics:read"},

  {nombre:"Preparación de datos", ruta:"/datos", grupo:"Inteligencia artificial", icono:Database, permiso:"datasets:read"},
  {nombre:"Modelos ML", ruta:"/modelos", grupo:"Inteligencia artificial", icono:BrainCircuit, permiso:"models:read"},
  {nombre:"Estimaciones", ruta:"/estimaciones", grupo:"Inteligencia artificial", icono:TrendingUp, permiso:"estimates:read"},

  {nombre:"Reglas de alertas", ruta:"/reglas", grupo:"Operaciones", icono:SlidersHorizontal, permiso:"rules:manage"},
  {nombre:"Centro de alertas", ruta:"/alertas", grupo:"Operaciones", icono:Bell, permiso:"alerts:read"},
  {nombre:"Fuentes de datos", ruta:"/fuentes", grupo:"Operaciones", icono:Radio, permiso:"sources:read"},
  {nombre:"Reportes", ruta:"/reportes", grupo:"Operaciones", icono:FileText, permiso:"reports:read"},

  {nombre:"Usuarios y roles", ruta:"/usuarios", grupo:"Administración", icono:Users, permiso:"users:read"},
  {nombre:"Auditoría y configuración", ruta:"/auditoria", grupo:"Administración", icono:ShieldCheck, permiso:"audit:read"}
];

const grupos = [
  "Monitoreo",
  "Inteligencia artificial",
  "Operaciones",
  "Administración"
];

const SismoiaDashboard = lazy(() => import("./SismoiaDashboard"));
const CatalogWorkspace = lazy(() => import("./CatalogWorkspace"));
const AnalyticsWorkspace = lazy(() => import("./AnalyticsWorkspace"));
const PreparationWorkspace = lazy(() => import("./PreparationWorkspace"));
const ModelsWorkspace = lazy(() => import("./ModelsWorkspace"));
const EstimatesWorkspace = lazy(() => import("./EstimatesWorkspace"));
const AlertsWorkspace = lazy(() => import("./AlertsWorkspace"));
const SourcesWorkspace = lazy(() => import("./SourcesWorkspace"));
const ReportsWorkspace = lazy(() => import("./ReportsWorkspace"));
const ManagementWorkspace = lazy(() => import("./ManagementWorkspace"));

type Diagnostico = {
  fuentes: {
    id: string;
    nombre: string;
    frescura: string;
    ultima_recepcion_utc: string | null;
  }[];
  calculado_utc: string;
};

function CargandoModulo() {
  return (
    <div className="sismo-module-loading" role="status" aria-label="Cargando módulo">
      <div className="sismo-skeleton sismo-skeleton-title" />
      <div className="sismo-skeleton sismo-skeleton-block" />
      <div className="sismo-skeleton sismo-skeleton-block" />
      <span>Cargando información...</span>
    </div>
  );
}

function Plataforma() {
  const location = useLocation();
  const usuario = useContext(UsuarioContext);
  const token = useContext(TokenContext);

  const [peru, setPeru] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [fuentes, setFuentes] = useState<Diagnostico | null>(null);
  const [errorFuentes, setErrorFuentes] = useState(false);

  const puede = (permiso: string) =>
    Boolean(
      usuario &&
      (
        usuario.permisos.includes("*") ||
        usuario.permisos.includes(permiso)
      )
    );

  const puedeFuentes = puede("sources:read");

  const modulo = modulos.find(
    m => m.ruta === location.pathname
  );

  const perfil = usuario as unknown as {
    full_name?: string;
    nombre?: string;
    email?: string;
    roles?: string[];
  } | null;

  const nombreUsuario =
    perfil?.full_name ||
    perfil?.nombre ||
    perfil?.email ||
    "Usuario autenticado";

  const rolesUsuario =
    perfil?.roles?.length
      ? perfil.roles.join(", ")
      : "Sesión activa";

  useEffect(() => {
    setMenuAbierto(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuAbierto) return;

    function cerrarConEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        setMenuAbierto(false);
      }
    }

    document.addEventListener("keydown", cerrarConEscape);

    return () => {
      document.removeEventListener(
        "keydown", cerrarConEscape
      );
    };
  }, [menuAbierto]);

  useEffect(() => {
    if (!token || !puedeFuentes) {
      setFuentes(null);
      setErrorFuentes(false);
      return;
    }

    let vigente = true;

    async function actualizar() {
      try {
        const respuesta = await fetch(
          "/api/v1/sources/diagnostics",
          {
            headers: {
              Authorization: `Bearer ${token}`
            },
            cache: "no-store"
          }
        );

        if (!respuesta.ok) {
          throw new Error(
            `HTTP ${respuesta.status}`
          );
        }

        const datos: Diagnostico = await respuesta.json();

        if (vigente) {
          setFuentes(datos);
          setErrorFuentes(false);
        }
      } catch {
        if (vigente) {
          setFuentes(null);
          setErrorFuentes(true);
        }
      }
    }

    void actualizar();

    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void actualizar();
      }
    }, 120000);

    return () => {
      vigente = false;
      window.clearInterval(intervalo);
    };
  }, [token, puedeFuentes]);

  const recientes = fuentes?.fuentes.filter(
    f => f.frescura === "Recepción reciente"
  ).length;

  const estadoFuentes = !puedeFuentes
    ? "Fuentes: sin acceso"
    : errorFuentes
      ? "Fuentes: consulta no disponible"
      : !fuentes
        ? "Consultando fuentes..."
        : `${recientes} de ${fuentes.fuentes.length} con recepción reciente`;

  function contenido() {
    switch (modulo?.ruta) {
      case "/":
        return <SismoiaDashboard peru={peru} />;

      case "/eventos":
        return <CatalogWorkspace modo="eventos" peru={peru} />;

      case "/mapa":
        return <CatalogWorkspace modo="mapa" peru={peru} />;

      case "/analisis":
        return <AnalyticsWorkspace peru={peru} />;

      case "/datos":
        return <PreparationWorkspace peru={peru} />;

      case "/modelos":
        return <ModelsWorkspace />;

      case "/estimaciones":
        return <EstimatesWorkspace peru={peru} />;

      case "/reglas":
        return <AlertsWorkspace seccion="reglas" />;

      case "/alertas":
        return <AlertsWorkspace seccion="centro" />;

      case "/fuentes":
        return <SourcesWorkspace />;

      case "/reportes":
        return <ReportsWorkspace peru={peru} />;

      case "/usuarios":
        return <ManagementWorkspace seccion="usuarios" />;

      case "/auditoria":
        return <ManagementWorkspace seccion="auditoria" />;

      default:
        return null;
    }
  }

  return (
    <div className="app-layout sismo-shell">
      {menuAbierto && (
        <button
          className="sismo-sidebar-backdrop"
          aria-label="Cerrar menú de navegación"
          onClick={() => setMenuAbierto(false)}
        />
      )}

      <aside
        id="sismo-sidebar"
        className={`sidebar ${menuAbierto ? "abierto" : ""}`}
        aria-label="Navegación principal"
      >
        <div className="marca">
          <span className="sismo-brand-icon">
            <Activity size={27} />
          </span>

          <div>
            <strong>SISMOIA</strong>
            <small>ENTERPRISE</small>
          </div>

          <button
            className="cerrar-menu"
            aria-label="Cerrar menú"
            onClick={() => setMenuAbierto(false)}
          >
            <X size={21} />
          </button>
        </div>

        <label className="buscador">
          <Search size={17} />

          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar módulo..."
            aria-label="Buscar módulo de navegación"
          />
        </label>

        <nav aria-label="Módulos del sistema">
          {grupos.map(grupo => {
            const items = modulos.filter(
              m =>
                m.grupo === grupo &&
                puede(m.permiso) &&
                m.nombre.toLocaleLowerCase("es")
                  .includes(
                    busqueda.toLocaleLowerCase("es").trim()
                  )
            );

            if (!items.length) return null;

            return (
              <section className="grupo" key={grupo}>
                <h4>{grupo}</h4>

                {items.map(m => {
                  const Icono = m.icono;

                  return (
                    <NavLink
                      key={m.ruta}
                      to={m.ruta}
                      end
                      onClick={() => setMenuAbierto(false)}
                      className={({isActive}) =>
                        isActive
                          ? "enlace activo"
                          : "enlace"
                      }
                    >
                      <Icono size={17} aria-hidden="true" />
                      <span>{m.nombre}</span>
                    </NavLink>
                  );
                })}
              </section>
            );
          })}

          {!modulos.some(
            m =>
              puede(m.permiso) &&
              m.nombre.toLocaleLowerCase("es").includes(
                busqueda.toLocaleLowerCase("es").trim()
              )
          ) && (
            <p className="sismo-nav-empty">
              No se encontraron módulos disponibles.
            </p>
          )}
        </nav>

        <footer className="sidebar-footer sismo-sidebar-footer">
          <span className="sismo-sidebar-pulse" />
          Monitoreo de eventos observados
        </footer>
      </aside>

      <div className="contenido">
        <header className="topbar sismo-topbar">
          <div className="topbar-titulo sismo-topbar-title">
            <button
              className="abrir-menu"
              aria-label="Abrir menú"
              aria-expanded={menuAbierto}
              aria-controls="sismo-sidebar"
              onClick={() => setMenuAbierto(true)}
            >
              <Menu size={22} />
            </button>

            <div>
              <small>Panel empresarial</small>
              <strong>
                {modulo?.nombre ?? "Página no encontrada"}
              </strong>
            </div>
          </div>

          <div className="sismo-topbar-right">
            <div
              className="sismo-source-status"
              role="status"
              title="Recepción reciente: eventos almacenados en las últimas 24 horas. No verifica la disponibilidad en vivo de las fuentes."
            >
              <Radio size={16} aria-hidden="true" />
              <span>{estadoFuentes}</span>
            </div>

            <div className="cobertura" aria-label="Cobertura">
              <button
                type="button"
                className={peru ? "seleccionado" : ""}
                aria-pressed={peru}
                onClick={() => setPeru(true)}
              >
                <MapPin size={15} />
                Perú
              </button>

              <button
                type="button"
                className={!peru ? "seleccionado" : ""}
                aria-pressed={!peru}
                onClick={() => setPeru(false)}
              >
                <Globe2 size={15} />
                Mundo
              </button>
            </div>

            <div
              className="sismo-user"
              title={`${nombreUsuario} · ${rolesUsuario}`}
              aria-label={`Usuario: ${nombreUsuario}. ${rolesUsuario}`}
            >
              <span className="sismo-user-avatar">
                <UserRound size={19} />
              </span>

              <div>
                <strong>{nombreUsuario}</strong>
                <small>{rolesUsuario}</small>
              </div>
            </div>
          </div>
        </header>

        <main id="contenido-principal">
          {!modulo ? (
            <section className="panel">
              <h2>Página no encontrada</h2>
              <p>La dirección solicitada no existe.</p>
              <Link className="sismo-return" to="/">
                Volver al Dashboard
              </Link>
            </section>
          ) : !puede(modulo.permiso) ? (
            <section className="panel" role="alert">
              <h2>Acceso restringido</h2>
              <p>
                Tu rol no permite utilizar este módulo.
              </p>
            </section>
          ) : (
            <Suspense fallback={<CargandoModulo />}>
              {contenido()}
            </Suspense>
          )}

          <p className="advertencia sismo-disclaimer">
            SISMOIA presenta eventos observados y análisis
            experimentales. No predice con certeza cuándo
            ni dónde ocurrirá un terremoto. Las estimaciones
            no son alertas oficiales.
          </p>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Plataforma />
    </BrowserRouter>
  );
}
