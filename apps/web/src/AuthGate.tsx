import { createContext, useState, type FormEvent, type ReactNode } from "react";
import { Activity, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import "./auth.css";

type Usuario = { id: string; nombre: string; email: string; roles: string[]; permisos: string[] };
export const UsuarioContext = createContext<Usuario | null>(null);
export const TokenContext = createContext<string | null>(null);
type Sesion = { token: string; usuario: Usuario };

export default function AuthGate({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function ingresar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCargando(true);
    setError("");
    try {
      const respuesta = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      if (!respuesta.ok) throw new Error(respuesta.status === 401 ? "Credenciales incorrectas" : "No se pudo iniciar sesion");
      const datos = await respuesta.json();
      const perfil = await fetch("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${datos.access_token}` }
      });
      if (!perfil.ok) throw new Error("No se pudo verificar el perfil");
      const usuario: Usuario = await perfil.json();
      setSesion({ token: datos.access_token, usuario });
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexion");
    } finally {
      setCargando(false);
    }
  }

  if (sesion) return <><div className="auth-session"><ShieldCheck size={16}/><span>{sesion.usuario.nombre} · {sesion.usuario.roles.join(", ")}</span><button onClick={() => setSesion(null)}>Cerrar sesión</button></div><TokenContext.Provider value={sesion.token}><UsuarioContext.Provider value={sesion.usuario}>{children}</UsuarioContext.Provider></TokenContext.Provider></>;
  return <main className="auth-screen"><section className="auth-card"><div className="auth-logo"><Activity size={32}/></div><h1>SISMOIA Enterprise</h1><p>Acceso seguro al sistema</p><form onSubmit={ingresar}><label htmlFor="correo">Correo electrónico</label><input id="correo" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/><label htmlFor="clave">Contraseña</label><input id="clave" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/>{error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" disabled={cargando}><LogIn size={16}/>{cargando ? "Verificando..." : "Iniciar sesión"}</button></form><p className="auth-note"><LockKeyhole size={14}/> Acceso autorizado</p></section></main>;
}
