import { useContext, useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { TokenContext, UsuarioContext } from "./AuthGate";
import "./management.css";

type Rol = { id: string; nombre: string };
type Props = { roles: Rol[]; onCreated: () => void };

export default function UserCreateForm({ roles, onCreated }: Props) {
  const token = useContext(TokenContext);
  const usuario = useContext(UsuarioContext);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const esAdmin = Boolean(usuario?.roles.includes("Administrador") && usuario.permisos.includes("*"));

  async function registrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!token || !esAdmin || guardando) return;
    setGuardando(true);
    setError("");
    setMensaje("");
    try {
      const respuesta = await fetch("/api/v1/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim().toLowerCase(),
          password,
          rol
        })
      });
      const cuerpo: { detail?: string | unknown[] } = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        throw new Error(typeof cuerpo.detail === "string" ? cuerpo.detail : `No se pudo registrar el usuario. HTTP ${respuesta.status}`);
      }
      setNombre("");
      setEmail("");
      setPassword("");
      setRol("");
      setMensaje("Usuario creado correctamente. Ya puede iniciar sesión con sus credenciales.");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear usuario");
    } finally {
      setGuardando(false);
    }
  }

  if (!esAdmin) return null;

  return <article className="prep-card management-new-user">
    <h3><UserPlus size={19}/> Registrar nuevo usuario</h3>
    <p>Crear una cuenta y asignarle un rol autorizado de SISMOIA Enterprise.</p>
    <form onSubmit={e => void registrar(e)} className="management-create-form">
      <label>Nombre completo
        <input required minLength={3} maxLength={180} value={nombre}
          onChange={e => setNombre(e.target.value)} placeholder="Nombre y apellidos" autoComplete="name"/>
      </label>
      <label>Correo electrónico
        <input required type="email" maxLength={255} value={email}
          onChange={e => setEmail(e.target.value)} placeholder="usuario@empresa.com" autoComplete="off"/>
      </label>
      <label>Contraseña temporal
        <input required type="password" minLength={8} value={password}
          onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password"/>
      </label>
      <label>Rol de acceso
        <select required value={rol} onChange={e => setRol(e.target.value)}>
          <option value="">Seleccionar rol</option>
          {roles.map(r => <option value={r.nombre} key={r.id}>{r.nombre}</option>)}
        </select>
      </label>
      <button type="submit" disabled={guardando || !roles.length || !rol}>
        <UserPlus size={16}/> {guardando ? "Registrando..." : "Crear usuario"}
      </button>
    </form>
    {error && <p className="prep-error" role="alert">{error}</p>}
    {mensaje && <p className="management-ok" role="status">{mensaje}</p>}
    <p className="management-small">La contraseña no se muestra en las tablas ni en la respuesta de administración.</p>
  </article>;
}
