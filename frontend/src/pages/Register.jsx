import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { UserPlus, User, Buildings, Stethoscope, Heartbeat } from "@phosphor-icons/react";

const ROLES = [
  { value: "paciente", label: "Paciente", icon: User, desc: "Subo mis propios estudios" },
  { value: "clinica", label: "Hospital / Clínica", icon: Buildings, desc: "Subo estudios de pacientes" },
  { value: "medico", label: "Médico Especialista", icon: Stethoscope, desc: "Recibo y descargo estudios" },
];

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    role: "paciente",
    full_name: "",
    email: "",
    password: "",
    organization: "",
    specialty: "",
    phone: "",
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  if (user && user !== false && user !== null) {
    return <Navigate to="/app" replace />;
  }

  const update = (k, v) => setForm({ ...form, [k]: v });

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const payload = { ...form };
    if (payload.role !== "medico") payload.specialty = null;
    if (payload.role === "paciente") payload.organization = null;
    const res = await register(payload);
    setLoading(false);
    if (res.ok) navigate("/app");
    else setErr(res.error);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto p-6 md:p-10">
        <Link to="/login" className="inline-flex items-center gap-2 mb-8" data-testid="back-to-login-link">
          <Heartbeat size={26} weight="duotone" className="text-sky-700" />
          <span className="text-lg font-semibold text-slate-900">MedDICOM</span>
        </Link>

        <div className="bg-white border border-slate-200 rounded-lg p-8">
          <p className="label-small mb-2">Registro</p>
          <h2 className="text-3xl font-semibold text-slate-900 mb-2">Crear cuenta</h2>
          <p className="text-slate-500 mb-8">
            Selecciona tu tipo de usuario para personalizar tu experiencia.
          </p>

          <form onSubmit={onSubmit} className="space-y-6" data-testid="register-form">
            {/* Role picker */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Tipo de usuario
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {ROLES.map((r) => {
                  const Icon = r.icon;
                  const active = form.role === r.value;
                  return (
                    <button
                      type="button"
                      key={r.value}
                      onClick={() => update("role", r.value)}
                      className={`text-left p-4 rounded-md border-2 transition-all ${
                        active
                          ? "border-sky-600 bg-sky-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                      data-testid={`role-option-${r.value}`}
                    >
                      <Icon
                        size={24}
                        weight={active ? "fill" : "duotone"}
                        className={active ? "text-sky-700" : "text-slate-500"}
                      />
                      <div className="mt-2 font-medium text-slate-900">{r.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{r.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nombre completo" required>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => update("full_name", e.target.value)}
                  required
                  className="input"
                  data-testid="register-full-name-input"
                />
              </Field>
              <Field label="Correo electrónico" required>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  required
                  className="input"
                  data-testid="register-email-input"
                />
              </Field>
              <Field label="Contraseña (mín. 6)" required>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  required
                  minLength={6}
                  className="input"
                  data-testid="register-password-input"
                />
              </Field>
              <Field label="Teléfono (opcional)">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  className="input"
                  data-testid="register-phone-input"
                />
              </Field>

              {form.role === "clinica" && (
                <Field label="Nombre del hospital / clínica" required>
                  <input
                    type="text"
                    value={form.organization}
                    onChange={(e) => update("organization", e.target.value)}
                    required
                    className="input"
                    data-testid="register-organization-input"
                  />
                </Field>
              )}
              {form.role === "medico" && (
                <Field label="Especialidad" required>
                  <input
                    type="text"
                    value={form.specialty}
                    onChange={(e) => update("specialty", e.target.value)}
                    required
                    className="input"
                    placeholder="ej: Radiología, Neurología"
                    data-testid="register-specialty-input"
                  />
                </Field>
              )}
            </div>

            {err && (
              <div
                className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-md"
                data-testid="register-error"
              >
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sky-700 hover:bg-sky-600 disabled:bg-slate-400 text-white font-medium py-2.5 rounded-md transition-all inline-flex items-center justify-center gap-2"
              data-testid="register-submit-button"
            >
              <UserPlus size={18} weight="bold" />
              {loading ? "Creando cuenta..." : "Crear cuenta"}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-600 text-center">
            ¿Ya tienes cuenta?{" "}
            <Link to="/login" className="text-sky-700 hover:text-sky-600 font-medium">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
      <style>{`
        .input {
          width: 100%;
          padding: 0.625rem 0.875rem;
          background: white;
          border: 1px solid #CBD5E1;
          border-radius: 0.375rem;
          color: #0F172A;
          transition: all .2s ease-in-out;
        }
        .input:focus {
          border-color: #0369A1;
          box-shadow: 0 0 0 3px rgba(14,165,233,0.15);
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
