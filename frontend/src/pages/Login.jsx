import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { SignIn, ShieldCheck, Heartbeat } from "@phosphor-icons/react";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  if (user && user !== false && user !== null) {
    return <Navigate to="/app" replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (res.ok) navigate("/app");
    else setErr(res.error);
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-white">
      {/* Left image / brand */}
      <div
        className="hidden lg:flex flex-col justify-between p-12 relative bg-slate-900"
        style={{
          backgroundImage:
            "linear-gradient(rgba(2,6,23,0.75), rgba(2,6,23,0.85)), url('https://images.unsplash.com/photo-1777269749032-d8d458ae594d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        data-testid="login-hero"
      >
        <div className="flex items-center gap-2 text-white">
          <Heartbeat size={28} weight="duotone" className="text-sky-400" />
          <span className="text-lg font-semibold tracking-tight">MedDICOM</span>
        </div>
        <div className="text-white max-w-md">
          <p className="label-small text-sky-300 mb-3" style={{ color: "#7DD3FC" }}>
            Plataforma clínica segura
          </p>
          <h1 className="text-4xl font-semibold leading-tight mb-4">
            Gestión cifrada de estudios DICOM entre pacientes, clínicas y médicos.
          </h1>
          <p className="text-slate-300 text-base leading-relaxed">
            Sube estudios de imagen, asigna al médico especialista y controla el
            acceso con permisos estrictos.
          </p>
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <ShieldCheck size={18} weight="bold" />
          <span>Cifrado en reposo · Acceso basado en roles</span>
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <Heartbeat size={26} weight="duotone" className="text-sky-700" />
            <span className="text-lg font-semibold">MedDICOM</span>
          </div>
          <p className="label-small mb-2">Acceso</p>
          <h2 className="text-3xl font-semibold text-slate-900 mb-2">
            Iniciar Sesión
          </h2>
          <p className="text-slate-500 mb-8">
            Ingresa tus credenciales para continuar.
          </p>

          <form onSubmit={onSubmit} className="space-y-5" data-testid="login-form">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 transition-all"
                placeholder="doctor@hospital.com"
                data-testid="login-email-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 transition-all"
                placeholder="••••••••"
                data-testid="login-password-input"
              />
            </div>
            {err && (
              <div
                className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-md"
                data-testid="login-error"
              >
                {err}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sky-700 hover:bg-sky-600 disabled:bg-slate-400 text-white font-medium py-2.5 rounded-md transition-all inline-flex items-center justify-center gap-2"
              data-testid="login-submit-button"
            >
              <SignIn size={18} weight="bold" />
              {loading ? "Ingresando..." : "Iniciar Sesión"}
            </button>
          </form>

          <p className="mt-8 text-sm text-slate-600">
            ¿No tienes cuenta?{" "}
            <Link
              to="/register"
              className="text-sky-700 hover:text-sky-600 font-medium"
              data-testid="go-to-register-link"
            >
              Regístrate aquí
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
