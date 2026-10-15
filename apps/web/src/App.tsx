import { lazy, Suspense } from "react";
import { useContext } from "react";
import { UsuarioContext } from "./AuthGate";
import { useEffect, useState } from "react";
import {
  BrowserRouter, NavLink, Link, useLocation
} from "react-router-dom";
import {
  Activity, LayoutDashboard, MapPinned, BarChart3,
  Database, BrainCircuit, TrendingUp, SlidersHorizontal,
  Bell, Radio, FileText, Users, ShieldCheck,
  Globe2, MapPin, Search, Menu, X, ArrowRight,
  type LucideIcon
} from "lucide-react";

type Modulo = {
  nombre: string;
  ruta: string;
  grupo: string;
  icono: LucideIcon;
  descripcion: string;
};

const modulos: Modulo[] = [
  {nombre:"Dashboard",ruta:"/",grupo:"Monitoreo",icono:LayoutDashboard,descripcion:"Resumen ejecutivo de la actividad sísmica"},
  {nombre:"Eventos sísmicos",ruta:"/eventos",grupo:"Monitoreo",icono:Activity,descripcion:"Registros sísmicos y consultas"},
  {nombre:"Mapa sísmico",ruta:"/mapa",grupo:"Monitoreo",icono:MapPinned,descripcion:"Visualización geográfica mundial"},
  {nombre:"Análisis estadístico",ruta:"/analisis",grupo:"Inteligencia artificial",icono:BarChart3,descripcion:"Estadísticas y tendencias históricas"},
  {nombre:"Preparación de datos",ruta:"/datos",grupo:"Inteligencia artificial",icono:Database,descripcion:"Limpieza y validación de datasets"},
  {nombre:"Modelos ML",ruta:"/modelos",grupo:"Inteligencia artificial",icono:BrainCircuit,descripcion:"Entrenamiento y evaluación de modelos"},
  {nombre:"Estimaciones",ruta:"/estimaciones",grupo:"Inteligencia artificial",icono:TrendingUp,descripcion:"Resultados experimentales"},
  {nombre:"Reglas de alertas",ruta:"/reglas",grupo:"Alertas",icono:SlidersHorizontal,descripcion:"Configuración de reglas y umbrales"},
  {nombre:"Centro de alertas",ruta:"/alertas",grupo:"Alertas",icono:Bell,descripcion:"Avisos y seguimiento de entregas"},
  {nombre:"Fuentes de datos",ruta:"/fuentes",grupo:"Administración",icono:Radio,descripcion:"Proveedores y sincronización"},
  {nombre:"Reportes",ruta:"/reportes",grupo:"Administración",icono:FileText,descripcion:"Generación de informes"},
  {nombre:"Usuarios y roles",ruta:"/usuarios",grupo:"Administración",icono:Users,descripcion:"Gestión de accesos y permisos"},
  {nombre:"Auditoría y configuración",ruta:"/auditoria",grupo:"Administración",icono:ShieldCheck,descripcion:"Registro de operaciones y configuración"}
];

const grupos = [
  "Monitoreo",
  "Inteligencia artificial",
  "Alertas",
  "Administración"
];

const SeismicWorkspace = lazy(() => import("./SeismicWorkspace"));
const PreparationWorkspace = lazy(() => import("./PreparationWorkspace"));
const AnalyticsWorkspace = lazy(() => import("./AnalyticsWorkspace"));

const ModelsWorkspace = lazy(() => import("./ModelsWorkspace"));
const EstimatesWorkspace = lazy(() => import("./EstimatesWorkspace"));
const AlertsWorkspace = lazy(() => import("./AlertsWorkspace"));
const SourcesWorkspace = lazy(() => import("./SourcesWorkspace"));
const ReportsWorkspace = lazy(() => import("./ReportsWorkspace"));
const ManagementWorkspace = lazy(() => import("./ManagementWorkspace"));
const permisoPorRuta: Record<string, string> = {"/": "dashboard:read", "/eventos": "events:read", "/mapa": "map:read", "/analisis": "analytics:read", "/datos": "datasets:read", "/modelos": "models:read", "/estimaciones": "estimates:read", "/reglas": "rules:manage", "/alertas": "alerts:read", "/fuentes": "sources:read", "/reportes": "reports:read", "/usuarios": "users:read", "/auditoria": "audit:read"};

function Plataforma() {
  const [cobertura, setCobertura] = useState("Perú");
  const [busqueda, setBusqueda] = useState("");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [conexion, setConexion] = useState("Comprobando...");
  useEffect(() => {
    fetch("/api/v1/health/database")
      .then(r => { if (!r.ok) throw Error("API no disponible"); return r.json(); })
      .then(d => setConexion(d.database === "connected" ? "FastAPI y PostgreSQL conectados" : "Base de datos no disponible"))
      .catch(() => setConexion("Sin conexión"));
  }, []);

  const location = useLocation();
  const usuario = useContext(UsuarioContext);
  const puedeVer = (ruta: string) => Boolean(usuario && (usuario.permisos.includes("*") || usuario.permisos.includes(permisoPorRuta[ruta])));
  const modulo = modulos.find(m => m.ruta === location.pathname);
  const Icono = modulo?.icono ?? LayoutDashboard;

  return (
    <div className="app-layout">
      <aside className={`sidebar ${menuAbierto ? "abierto" : ""}`}>
        <div className="marca">
          <Activity size={30}/>
          <div><strong>SISMOIA</strong><small>ENTERPRISE</small></div>
          <button className="cerrar-menu" onClick={() => setMenuAbierto(false)}><X/></button>
        </div>

        <div className="buscador">
          <Search size={17}/>
          <input
            placeholder="Buscar módulo..."
            aria-label="Buscar módulo"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        <nav>
          {grupos.map(grupo => {
            const items = modulos.filter(m =>
              m.grupo === grupo &&
              m.nombre.toLowerCase().includes(busqueda.toLowerCase()) && puedeVer(m.ruta)
            );
            if (!items.length) return null;
            return (
              <section className="grupo" key={grupo}>
                <h4>{grupo}</h4>
                {items.map(m => {
                  const Icon = m.icono;
                  return (
                    <NavLink
                      key={m.ruta}
                      to={m.ruta}
                      end
                      onClick={() => setMenuAbierto(false)}
                      className={({isActive}) => isActive ? "enlace activo" : "enlace"}
                    >
                      <Icon size={18}/><span>{m.nombre}</span>
                    </NavLink>
                  );
                })}
              </section>
            );
          })}
        </nav>
        <footer className="sidebar-footer">SISMOIA · Fase 1</footer>
      </aside>

      <div className="contenido">
        <header className="topbar">
          <div className="topbar-titulo">
            <button className="abrir-menu" onClick={() => setMenuAbierto(true)}><Menu/></button>
            <strong>{modulo?.nombre ?? "Página no encontrada"}</strong>
          </div>
          <div className="cobertura">
            <button className={cobertura === "Perú" ? "seleccionado" : ""}
              onClick={() => setCobertura("Perú")}><MapPin size={16}/> Perú</button>
            <button className={cobertura === "Mundo" ? "seleccionado" : ""}
              onClick={() => setCobertura("Mundo")}><Globe2 size={16}/> Mundo</button>
          </div>
        </header>

        <main>
          {!modulo ? (
            <section className="panel">
              <h2>Página no encontrada</h2>
              <Link to="/">Volver al Dashboard</Link>
            </section>
          ) : !puedeVer(modulo.ruta) ? (
<section className="panel"><h2>Acceso restringido</h2><p>No tienes permisos para consultar este módulo.</p></section>
) : modulo.ruta === "/usuarios" ? (
<Suspense fallback={<p>Cargando usuarios...</p>}><ManagementWorkspace seccion="usuarios" /></Suspense>
) : modulo.ruta === "/auditoria" ? (
<Suspense fallback={<p>Cargando auditoría...</p>}><ManagementWorkspace seccion="auditoria" /></Suspense>
) : modulo.ruta === "/fuentes" ? (
<Suspense fallback={<p>Cargando fuentes...</p>}><SourcesWorkspace /></Suspense>
) : modulo.ruta === "/reportes" ? (
<Suspense fallback={<p>Cargando reportes...</p>}><ReportsWorkspace peru={cobertura === "Perú"} /></Suspense>
) : modulo.ruta === "/reglas" ? (
<Suspense fallback={<p>Cargando reglas...</p>}><AlertsWorkspace seccion="reglas" /></Suspense>
) : modulo.ruta === "/alertas" ? (
<Suspense fallback={<p>Cargando alertas...</p>}><AlertsWorkspace seccion="centro" /></Suspense>
) : modulo.ruta === "/estimaciones" ? (
<Suspense fallback={<p>Cargando estimaciones...</p>}><EstimatesWorkspace peru={cobertura === "Perú"} /></Suspense>
) : modulo.ruta === "/modelos" ? (
<Suspense fallback={<p>Cargando modelos...</p>}><ModelsWorkspace /></Suspense>
) : modulo.ruta === "/analisis" ? (
<Suspense fallback={<p>Cargando módulo...</p>}><AnalyticsWorkspace peru={cobertura === "Perú"} /></Suspense>
) : modulo.ruta === "/datos" ? (
<Suspense fallback={<p>Cargando módulo...</p>}><PreparationWorkspace peru={cobertura === "Perú"} /></Suspense>
) : ["/", "/eventos", "/mapa"].includes(modulo.ruta) ? (
<Suspense fallback={<p>Cargando módulo...</p>}><SeismicWorkspace modo={modulo.ruta === "/" ? "dashboard" : modulo.ruta === "/mapa" ? "mapa" : "eventos"} peru={cobertura === "Perú"} /></Suspense>
) : modulo.ruta === "/" ? (
            <>
              <section className="hero">
                <div>
                  <p className="etiqueta">MONITOREO Y ANALÍTICA SÍSMICA</p>
                  <h1>SISMOIA Enterprise</h1>
                  <p>Plataforma empresarial de monitoreo sísmico mundial,
                    análisis estadístico y Machine Learning.</p>
                  <Link className="boton-principal" to="/eventos">
                    Explorar eventos <ArrowRight size={17}/>
                  </Link>
                </div>
                <Globe2 className="hero-globo" size={115}/>
              </section>

              <h2>Resumen sísmico — {cobertura}</h2>
              <p role="status">Estado de servicios: {conexion}</p>
              <div className="tarjetas">
                {["Eventos registrados","Magnitud máxima","Profundidad media","Alertas activas"].map(t => (
                  <div className="tarjeta" key={t}>
                    <span>{t}</span><strong>—</strong>
                    <small>Esperando conexión con datos reales</small>
                  </div>
                ))}
              </div>

              <div className="paneles">
                <section className="panel">
                  <h3>Actividad sísmica</h3>
                  <p>Los gráficos aparecerán al conectar el backend.</p>
                  <div className="estado-vacio"><BarChart3 size={38}/> Sin registros disponibles</div>
                </section>
                <section className="panel">
                  <h3>Mapa de epicentros</h3>
                  <p>Cobertura seleccionada: {cobertura}</p>
                  <div className="estado-vacio"><MapPinned size={38}/> Mapa pendiente de integración</div>
                </section>
              </div>
            </>
          ) : (
            <>
              <div className="encabezado-modulo">
                <Icono size={31}/>
                <div><h1>{modulo.nombre}</h1><p>{modulo.descripcion}</p></div>
              </div>
              <section className="panel">
                <h3>Implementación del módulo</h3>
                <p>Esta sección se desarrollará en su fase correspondiente,
                  conectándola con FastAPI y PostgreSQL.</p>
                <p><strong>Cobertura:</strong> {cobertura}</p>
                <p><strong>Estado:</strong> Pendiente de implementación funcional.</p>
              </section>
            </>
          )}
          <p className="advertencia">
            SISMOIA no predice con certeza la fecha, ubicación ni magnitud de futuros terremotos.
            Las estimaciones experimentales no son alertas oficiales.
          </p>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return <BrowserRouter><Plataforma/></BrowserRouter>;
}
