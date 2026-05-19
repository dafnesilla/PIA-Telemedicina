import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { formatApiError } from "@/lib/api";
import DicomViewer from "@/components/DicomViewer";
import {
  DownloadSimple,
  Trash,
  FolderOpen,
  MagnifyingGlass,
  UploadSimple,
  Eye,
} from "@phosphor-icons/react";

export default function Studies() {
  const { user } = useAuth();
  const [studies, setStudies] = useState(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [viewing, setViewing] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/studies");
      setStudies(data);
    } catch (e) {
      setErr(formatApiError(e));
      setStudies([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onDownload = async (s) => {
    try {
      const res = await api.get(`/studies/${s.id}/download`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/dicom" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = s.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(formatApiError(e));
    }
  };

  const onDelete = async (s) => {
    if (!window.confirm(`¿Eliminar el estudio "${s.filename}"?`)) return;
    try {
      await api.delete(`/studies/${s.id}`);
      load();
    } catch (e) {
      setErr(formatApiError(e));
    }
  };

  const filtered = (studies || []).filter((s) => {
    if (!q) return true;
    const h = `${s.patient_name} ${s.filename} ${s.doctor_name} ${s.uploader_name} ${s.modality || ""}`.toLowerCase();
    return h.includes(q.toLowerCase());
  });

  const isMedico = user.role === "medico";
  const canUpload = user.role === "paciente" || user.role === "clinica";

  return (
    <div className="max-w-7xl mx-auto" data-testid="studies-page">
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <p className="label-small">Estudios</p>
          <h1 className="text-3xl font-semibold text-slate-900 mt-1 mb-1">
            {isMedico ? "Estudios Recibidos" : "Mis Estudios"}
          </h1>
          <p className="text-slate-500">
            {isMedico
              ? "Estudios DICOM que te han sido asignados."
              : "Estudios DICOM que has subido."}
          </p>
        </div>
        {canUpload && (
          <Link
            to="/app/upload"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-700 hover:bg-sky-600 text-white rounded-md text-sm transition-colors"
            data-testid="studies-upload-button"
          >
            <UploadSimple size={16} weight="bold" />
            Subir nuevo
          </Link>
        )}
      </div>

      <div className="mb-5">
        <div className="relative max-w-md">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-md focus:border-sky-600 focus:ring-2 focus:ring-sky-500/20 transition-all text-sm"
            placeholder="Buscar por paciente, archivo, médico..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="studies-search-input"
          />
        </div>
      </div>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-md mb-4">
          {err}
        </div>
      )}

      {studies === null ? (
        <div className="text-slate-500 text-sm">Cargando estudios...</div>
      ) : filtered.length === 0 ? (
        <EmptyState isMedico={isMedico} canUpload={canUpload} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="studies-table">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                <tr>
                  <Th>Paciente</Th>
                  <Th>Archivo</Th>
                  <Th>Modalidad</Th>
                  <Th>Fecha estudio</Th>
                  {isMedico ? <Th>Subido por</Th> : <Th>Médico</Th>}
                  <Th>Subido</Th>
                  <Th className="text-right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t border-slate-200 hover:bg-slate-50 transition-colors"
                    data-testid={`study-row-${s.id}`}
                  >
                    <Td>
                      <div className="font-medium text-slate-900">{s.patient_name}</div>
                      {s.patient_document && (
                        <div className="text-xs text-slate-500">{s.patient_document}</div>
                      )}
                    </Td>
                    <Td>
                      <div className="text-slate-900">{s.filename}</div>
                      <div className="text-xs text-slate-500">
                        {(s.size_bytes / 1024).toFixed(1)} KB
                      </div>
                    </Td>
                    <Td>
                      {s.modality ? (
                        <span className="inline-block px-2 py-0.5 rounded bg-sky-50 text-sky-800 text-xs font-medium border border-sky-100">
                          {s.modality}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td>{s.study_date || <span className="text-slate-400">—</span>}</Td>
                    <Td>
                      <div className="text-slate-900">
                        {isMedico ? s.uploader_name : s.doctor_name}
                      </div>
                      {isMedico && (
                        <div className="text-xs text-slate-500 capitalize">{s.uploader_role}</div>
                      )}
                    </Td>
                    <Td className="text-slate-500 text-xs">
                      {new Date(s.created_at).toLocaleString("es")}
                    </Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => setViewing(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-slate-300 hover:border-sky-500 hover:text-sky-700 text-slate-700 rounded-md transition-colors"
                          data-testid={`view-study-${s.id}`}
                        >
                          <Eye size={14} weight="bold" />
                          Ver
                        </button>
                        <button
                          onClick={() => onDownload(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-sky-700 hover:bg-sky-600 text-white rounded-md transition-colors"
                          data-testid={`download-study-${s.id}`}
                        >
                          <DownloadSimple size={14} weight="bold" />
                          Descargar
                        </button>
                        {!isMedico && (
                          <button
                            onClick={() => onDelete(s)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Eliminar"
                            data-testid={`delete-study-${s.id}`}
                          >
                            <Trash size={16} />
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {viewing && (
        <DicomViewer study={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

const Th = ({ children, className = "" }) => (
  <th className={`text-left px-4 py-3 font-medium ${className}`}>{children}</th>
);
const Td = ({ children, className = "" }) => (
  <td className={`px-4 py-3 align-top ${className}`}>{children}</td>
);

function EmptyState({ isMedico, canUpload }) {
  return (
    <div
      className="bg-white border border-slate-200 rounded-lg p-12 text-center"
      data-testid="studies-empty-state"
    >
      <FolderOpen size={48} weight="duotone" className="mx-auto text-sky-700 mb-3" />
      <h3 className="text-lg font-medium text-slate-900 mb-1">
        {isMedico ? "Aún no tienes estudios asignados" : "Aún no has subido estudios"}
      </h3>
      <p className="text-sm text-slate-500 mb-6">
        {isMedico
          ? "Cuando un paciente o clínica te asigne un estudio, aparecerá aquí."
          : "Sube tu primer archivo DICOM para compartirlo con un médico especialista."}
      </p>
      {canUpload && (
        <Link
          to="/app/upload"
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-700 hover:bg-sky-600 text-white rounded-md text-sm transition-colors"
        >
          <UploadSimple size={16} weight="bold" />
          Subir primer estudio
        </Link>
      )}
    </div>
  );
}
