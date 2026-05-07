import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import {
  ClockCounterClockwise,
  UploadSimple,
  DownloadSimple,
  Trash,
  MagnifyingGlass,
  FolderOpen,
} from "@phosphor-icons/react";

const ACTIONS = {
  upload: { label: "Subida", icon: UploadSimple, cls: "bg-sky-50 text-sky-800 border-sky-100" },
  download: { label: "Descarga", icon: DownloadSimple, cls: "bg-emerald-50 text-emerald-800 border-emerald-100" },
  delete: { label: "Eliminación", icon: Trash, cls: "bg-red-50 text-red-700 border-red-100" },
};

export default function Logs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState(null);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .get("/logs")
      .then((r) => setLogs(r.data))
      .catch((e) => {
        setErr(formatApiError(e));
        setLogs([]);
      });
  }, []);

  const filtered = (logs || []).filter((l) => {
    if (action !== "all" && l.action !== action) return false;
    if (!q) return true;
    const h = `${l.actor_name} ${l.actor_role} ${l.study_filename} ${l.patient_name}`.toLowerCase();
    return h.includes(q.toLowerCase());
  });

  const isMedico = user.role === "medico";

  return (
    <div className="max-w-7xl mx-auto" data-testid="logs-page">
      <p className="label-small">Auditoría</p>
      <h1 className="text-3xl font-semibold text-slate-900 mt-1 mb-1">
        Historial de accesos
      </h1>
      <p className="text-slate-500 mb-8">
        {isMedico
          ? "Registro de subidas y descargas de los estudios asignados a ti."
          : "Registro de quién ha subido, descargado o eliminado tus estudios."}
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-md focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 transition-all text-sm"
            placeholder="Buscar por usuario, archivo o paciente..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="logs-search-input"
          />
        </div>
        <select
          className="px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 transition-all"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          data-testid="logs-action-filter"
        >
          <option value="all">Todas las acciones</option>
          <option value="upload">Subidas</option>
          <option value="download">Descargas</option>
          <option value="delete">Eliminaciones</option>
        </select>
        <span className="text-xs text-slate-500 ml-auto" data-testid="logs-count">
          {filtered.length} registro{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-md mb-4">
          {err}
        </div>
      )}

      {logs === null ? (
        <div className="text-slate-500 text-sm">Cargando historial...</div>
      ) : filtered.length === 0 ? (
        <div
          className="bg-white border border-slate-200 rounded-lg p-12 text-center"
          data-testid="logs-empty-state"
        >
          <ClockCounterClockwise size={48} weight="duotone" className="mx-auto text-sky-700 mb-3" />
          <h3 className="text-lg font-medium text-slate-900 mb-1">
            Sin actividad registrada
          </h3>
          <p className="text-sm text-slate-500 mb-6">
            Cuando se suba o descargue un estudio, aparecerá aquí con fecha y usuario.
          </p>
          <Link
            to="/app/studies"
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-700 hover:bg-sky-600 text-white rounded-md text-sm transition-colors"
          >
            <FolderOpen size={16} weight="bold" />
            Ver estudios
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="logs-table">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                <tr>
                  <Th>Acción</Th>
                  <Th>Usuario</Th>
                  <Th>Estudio</Th>
                  <Th>Paciente</Th>
                  <Th>IP</Th>
                  <Th>Fecha</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const a = ACTIONS[l.action] || { label: l.action, icon: ClockCounterClockwise, cls: "bg-slate-50 text-slate-700 border-slate-200" };
                  const Icon = a.icon;
                  return (
                    <tr
                      key={l.id}
                      className="border-t border-slate-200 hover:bg-slate-50 transition-colors"
                      data-testid={`log-row-${l.id}`}
                    >
                      <Td>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border ${a.cls}`}
                        >
                          <Icon size={13} weight="bold" />
                          {a.label}
                        </span>
                      </Td>
                      <Td>
                        <div className="font-medium text-slate-900">{l.actor_name}</div>
                        <div className="text-xs text-slate-500 capitalize">{l.actor_role}</div>
                      </Td>
                      <Td className="text-slate-700">{l.study_filename}</Td>
                      <Td className="text-slate-700">{l.patient_name}</Td>
                      <Td className="text-slate-500 font-mono text-xs">
                        {l.ip_address || "—"}
                      </Td>
                      <Td className="text-slate-500 text-xs">
                        {new Date(l.timestamp).toLocaleString("es")}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const Th = ({ children }) => (
  <th className="text-left px-4 py-3 font-medium">{children}</th>
);
const Td = ({ children, className = "" }) => (
  <td className={`px-4 py-3 align-top ${className}`}>{children}</td>
);
