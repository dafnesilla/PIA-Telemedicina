import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import {
  FolderOpen,
  Users,
  UploadSimple,
  ShieldCheck,
  FileLock,
  ArrowRight,
} from "@phosphor-icons/react";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/stats").then((r) => setStats(r.data)).catch(() => setStats({}));
  }, []);

  const isMedico = user.role === "medico";
  const canUpload = user.role === "paciente" || user.role === "clinica";

  return (
    <div className="max-w-6xl mx-auto" data-testid="dashboard-page">
      <p className="label-small">Panel</p>
      <h1 className="text-3xl sm:text-4xl font-semibold text-slate-900 mt-1 mb-1">
        Hola, {user.full_name.split(" ")[0]}
      </h1>
      <p className="text-slate-500 mb-8">
        {isMedico
          ? "Revisa los estudios DICOM asignados a tu perfil."
          : "Sube y gestiona los estudios DICOM de tus pacientes."}
      </p>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        <StatCard
          icon={FolderOpen}
          label={isMedico ? "Estudios recibidos" : "Estudios subidos"}
          value={stats?.total_studies ?? "—"}
          testid="stat-total-studies"
        />
        <StatCard
          icon={Users}
          label={isMedico ? "Pacientes únicos" : "Médicos asignados"}
          value={(isMedico ? stats?.unique_patients : stats?.unique_doctors) ?? "—"}
          testid="stat-unique"
        />
        <StatCard
          icon={ShieldCheck}
          label="Cifrado"
          value="AES"
          suffix="activo"
          testid="stat-encryption"
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {canUpload && (
          <ActionCard
            to="/app/upload"
            icon={UploadSimple}
            title="Subir estudio DICOM"
            desc="Carga un archivo .dcm y asígnalo al médico especialista."
            testid="action-upload"
          />
        )}
        <ActionCard
          to="/app/studies"
          icon={FolderOpen}
          title={isMedico ? "Estudios recibidos" : "Mis estudios"}
          desc={
            isMedico
              ? "Visualiza y descarga los estudios que te han asignado."
              : "Administra los estudios que has subido."
          }
          testid="action-studies"
        />
      </div>

      {/* Security note */}
      <div className="mt-10 p-6 bg-white border border-slate-200 rounded-lg flex items-start gap-4">
        <FileLock size={28} weight="duotone" className="text-sky-700 flex-shrink-0" />
        <div>
          <h3 className="text-lg font-medium text-slate-900 mb-1">
            Privacidad y seguridad
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Tus archivos DICOM se almacenan cifrados con AES (Fernet) en
            reposo. El acceso a cada estudio se limita al usuario que lo subió
            y al médico asignado, con tokens JWT para la autenticación y
            contraseñas protegidas con bcrypt.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, suffix, testid }) {
  return (
    <div
      className="bg-white border border-slate-200 rounded-lg p-6 hover:shadow-sm transition-shadow"
      data-testid={testid}
    >
      <div className="flex items-center justify-between mb-4">
        <Icon size={22} weight="duotone" className="text-sky-700" />
      </div>
      <div className="label-small mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-3xl font-semibold text-slate-900">{value}</div>
        {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}

function ActionCard({ to, icon: Icon, title, desc, testid }) {
  return (
    <Link
      to={to}
      className="group bg-white border border-slate-200 rounded-lg p-6 hover:border-sky-300 hover:shadow-sm transition-all flex items-start gap-4"
      data-testid={testid}
    >
      <div className="w-11 h-11 rounded-md bg-sky-50 flex items-center justify-center flex-shrink-0">
        <Icon size={22} weight="duotone" className="text-sky-700" />
      </div>
      <div className="flex-1">
        <h3 className="text-lg font-medium text-slate-900 mb-1 flex items-center gap-2">
          {title}
          <ArrowRight
            size={16}
            weight="bold"
            className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-sky-700"
          />
        </h3>
        <p className="text-sm text-slate-500">{desc}</p>
      </div>
    </Link>
  );
}
