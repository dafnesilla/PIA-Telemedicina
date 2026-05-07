import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import {
  House,
  UploadSimple,
  FolderOpen,
  SignOut,
  Heartbeat,
  User,
  Stethoscope,
  Buildings,
  ClockCounterClockwise,
} from "@phosphor-icons/react";

const roleLabel = { paciente: "Paciente", clinica: "Hospital / Clínica", medico: "Médico Especialista" };
const roleIcon = { paciente: User, clinica: Buildings, medico: Stethoscope };

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Cargando...
      </div>
    );
  }
  if (user === false) {
    navigate("/login", { replace: true });
    return null;
  }

  const RoleIcon = roleIcon[user.role] || User;
  const canUpload = user.role === "paciente" || user.role === "clinica";

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside
        className="hidden md:flex w-64 flex-col bg-white border-r border-slate-200 sticky top-0 h-screen"
        data-testid="sidebar"
      >
        <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-2">
          <Heartbeat size={24} weight="duotone" className="text-sky-700" />
          <span className="text-lg font-semibold text-slate-900">MedDICOM</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <SideLink to="/app" icon={House} label="Panel" end testid="nav-dashboard" />
          {canUpload && (
            <SideLink to="/app/upload" icon={UploadSimple} label="Subir Estudio" testid="nav-upload" />
          )}
          <SideLink
            to="/app/studies"
            icon={FolderOpen}
            label={user.role === "medico" ? "Estudios Recibidos" : "Mis Estudios"}
            testid="nav-studies"
          />
          <SideLink
            to="/app/logs"
            icon={ClockCounterClockwise}
            label="Historial de accesos"
            testid="nav-logs"
          />
        </nav>
        <div className="p-3 border-t border-slate-200">
          <div className="px-3 py-3 rounded-md bg-slate-50 border border-slate-200 mb-2">
            <div className="flex items-center gap-2 mb-1">
              <RoleIcon size={16} weight="fill" className="text-sky-700" />
              <span className="label-small" style={{ fontSize: "0.65rem" }}>
                {roleLabel[user.role]}
              </span>
            </div>
            <div className="text-sm font-medium text-slate-900 truncate" data-testid="sidebar-user-name">
              {user.full_name}
            </div>
            <div className="text-xs text-slate-500 truncate">{user.email}</div>
          </div>
          <button
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors text-sm"
            data-testid="logout-button"
          >
            <SignOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2 md:hidden">
            <Heartbeat size={22} weight="duotone" className="text-sky-700" />
            <span className="font-semibold text-slate-900">MedDICOM</span>
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-1 md:gap-2">
            <NotificationBell />
            <button
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className="md:hidden text-sm text-slate-600 px-2 py-1"
              data-testid="mobile-logout-button"
            >
              Salir
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 md:p-8" data-testid="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SideLink({ to, icon: Icon, label, end, testid }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? "bg-sky-50 text-sky-800 border border-sky-100"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`
      }
      data-testid={testid}
    >
      <Icon size={18} weight="bold" />
      {label}
    </NavLink>
  );
}
