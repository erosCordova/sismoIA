import {
  createContext,
  useState,
  type FormEvent,
  type ReactNode
} from "react";

import {
  Activity,
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Globe2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  LogOut
} from "lucide-react";

import "./auth.css";

type Usuario = {
  id: string;
  nombre: string;
  email: string;
  roles: string[];
  permisos: string[];
};

type Sesion = {
  token: string;
  usuario: Usuario;
};

export const UsuarioContext = createContext<Usuario | null>(null);
export const TokenContext = createContext<string | null>(null);

export default function AuthGate({
  children
}: {
  children: ReactNode;
}) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarClave, setMostrarClave] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function ingresar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (cargando) return;

    setCargando(true);
    setError("");

    try {
      const respuesta = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password
        })
      });

      if (!respuesta.ok) {
        if (respuesta.status === 401) {
          throw new Error(
            "El correo o la contraseña no son correctos."
          );
        }

        if (respuesta.status === 403) {
          throw new Error(
            "Esta cuenta no tiene autorización para ingresar."
          );
        }

        if (respuesta.status === 429) {
          throw new Error(
            "Demasiados intentos. Espera un momento e inténtalo nuevamente."
          );
        }

        if (respuesta.status >= 500) {
          throw new Error(
            "El servidor no está disponible temporalmente. Inténtalo más tarde."
          );
        }

        throw new Error(
          "No se pudo iniciar sesión. Verifica tus datos."
        );
      }

      const datos: {
        access_token?: string;
      } = await respuesta.json();

      if (
        typeof datos.access_token !== "string" ||
        !datos.access_token
      ) {
        throw new Error(
          "El servidor no devolvió una sesión válida."
        );
      }

      const perfil = await fetch("/api/v1/auth/me", {
        headers: {
          Authorization: `Bearer ${datos.access_token}`
        }
      });

      if (!perfil.ok) {
        throw new Error(
          "No se pudo verificar tu perfil de usuario."
        );
      }

      const usuario: Usuario = await perfil.json();

      if (
        !usuario ||
        !Array.isArray(usuario.roles) ||
        !Array.isArray(usuario.permisos)
      ) {
        throw new Error(
          "El servidor devolvió un perfil incompleto."
        );
      }

      setSesion({
        token: datos.access_token,
        usuario
      });

      setPassword("");
      setMostrarClave(false);

    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Se produjo un error de conexión."
      );
    } finally {
      setCargando(false);
    }
  }

  function cerrarSesion() {
    setSesion(null);
    setEmail("");
    setPassword("");
    setMostrarClave(false);
    setError("");
  }

  if (sesion) {
    return (
      <>
        <div className="auth-session">
          <div className="auth-session-user">
            <ShieldCheck size={17} aria-hidden="true" />
            <span>
              {sesion.usuario.nombre}
              <span className="auth-session-divider"> · </span>
              {sesion.usuario.roles.join(", ")}
            </span>
          </div>

          <button
            type="button"
            onClick={cerrarSesion}
          >
            <LogOut size={15} aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>

        <TokenContext.Provider value={sesion.token}>
          <UsuarioContext.Provider value={sesion.usuario}>
            {children}
          </UsuarioContext.Provider>
        </TokenContext.Provider>
      </>
    );
  }

  return (
    <main className="auth-screen">
      <div className="auth-layout">
        <aside className="auth-showcase">
          <div className="auth-showcase-brand">
            <div className="auth-brand-icon">
              <Activity size={25} strokeWidth={2.4} />
            </div>

            <div>
              <strong>SISMOIA</strong>
              <span>ENTERPRISE</span>
            </div>
          </div>

          <div className="auth-showcase-main">
            <div className="auth-eyebrow">
              PLATAFORMA DE INTELIGENCIA SÍSMICA
            </div>

            <h2>
              Comprende la actividad sísmica.
              <span> Explora cada dato.</span>
            </h2>

            <p>
              Monitoreo, análisis y herramientas inteligentes
              en una plataforma diseñada para comprender
              mejor la información sísmica.
            </p>

            <div
              className="auth-radar"
              aria-hidden="true"
            >
              <div className="auth-radar-ring ring-one" />
              <div className="auth-radar-ring ring-two" />
              <div className="auth-radar-ring ring-three" />

              <div className="auth-radar-cross horizontal" />
              <div className="auth-radar-cross vertical" />

              <div className="auth-radar-core">
                <Activity size={37} strokeWidth={1.8} />
              </div>

              <div className="auth-radar-point point-one" />
              <div className="auth-radar-point point-two" />
              <div className="auth-radar-point point-three" />
            </div>
          </div>

          <div className="auth-showcase-footer">
            <span>
              <Globe2 size={17} />
              Cobertura geográfica
            </span>

            <span>
              <ShieldCheck size={17} />
              Acceso por roles
            </span>
          </div>
        </aside>

        <section
          className="auth-panel"
          aria-labelledby="auth-title"
        >
          <div className="auth-panel-top">
            <span className="auth-panel-status-dot" />
            Acceso a la plataforma
          </div>

          <div className="auth-form-content">
            <div className="auth-form-icon">
              <LockKeyhole size={24} />
            </div>

            <span className="auth-welcome">
              BIENVENIDO A SISMOIA
            </span>

            <h1 id="auth-title">
              Iniciar sesión
            </h1>

            <p className="auth-description">
              Ingresa tus credenciales para acceder
              a tu espacio de trabajo.
            </p>

            <form onSubmit={ingresar}>
              <div className="auth-field">
                <label htmlFor="correo">
                  Correo electrónico
                </label>

                <div className="auth-input-wrap">
                  <Mail
                    size={18}
                    aria-hidden="true"
                  />

                  <input
                    id="correo"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    placeholder="nombre@correo.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError("");
                    }}
                    maxLength={255}
                    required
                    disabled={cargando}
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="clave">
                  Contraseña
                </label>

                <div className="auth-input-wrap">
                  <LockKeyhole
                    size={18}
                    aria-hidden="true"
                  />

                  <input
                    id="clave"
                    name="password"
                    type={
                      mostrarClave
                        ? "text"
                        : "password"
                    }
                    autoComplete="current-password"
                    placeholder="Ingresa tu contraseña"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError("");
                    }}
                    required
                    disabled={cargando}
                  />

                  <button
                    type="button"
                    className="auth-toggle-password"
                    onClick={() =>
                      setMostrarClave((valor) => !valor)
                    }
                    aria-label={
                      mostrarClave
                        ? "Ocultar contraseña"
                        : "Mostrar contraseña"
                    }
                    aria-pressed={mostrarClave}
                    disabled={cargando}
                  >
                    {mostrarClave
                      ? <EyeOff size={19} />
                      : <Eye size={19} />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  className="auth-error"
                  role="alert"
                >
                  <AlertCircle
                    size={18}
                    aria-hidden="true"
                  />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="auth-submit"
                disabled={cargando}
              >
                {cargando ? (
                  <>
                    <span
                      className="auth-spinner"
                      aria-hidden="true"
                    />
                    Verificando acceso...
                  </>
                ) : (
                  <>
                    Ingresar a SISMOIA
                    <ArrowRight
                      size={19}
                      aria-hidden="true"
                    />
                  </>
                )}
              </button>
            </form>

            <div className="auth-safe-note">
              <ShieldCheck
                size={18}
                aria-hidden="true"
              />

              <span>
                Acceso exclusivo para usuarios
                autorizados del sistema.
              </span>
            </div>
          </div>

          <div className="auth-panel-footer">
            SISMOIA Enterprise
            <span aria-hidden="true"> · </span>
            Monitoreo y análisis sísmico
          </div>
        </section>
      </div>
    </main>
  );
}
