import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import {
  UploadSimple,
  FileDashed,
  CheckCircle,
  X,
} from "@phosphor-icons/react";

export default function Upload() {
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState([]);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState({
    patient_name: "",
    patient_document: "",
    doctor_id: "",
    study_description: "",
    modality: "",
    study_date: "",
    notes: "",
  });
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get("/doctors")
      .then((r) => setDoctors(r.data))
      .catch(() => setDoctors([]));
  }, []);

  const update = (k, v) => setForm({ ...form, [k]: v });

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setSuccess("");
    if (!file) {
      setErr("Selecciona un archivo DICOM");
      return;
    }
    if (!form.doctor_id) {
      setErr("Debes seleccionar un médico");
      return;
    }
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
    try {
      await api.post("/studies/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSuccess("Estudio enviado a Orthanc y asignado al médico correctamente.");
      setTimeout(() => navigate("/app/studies"), 900);
    } catch (e2) {
      setErr(formatApiError(e2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto" data-testid="upload-page">
      <p className="label-small">Carga</p>
      <h1 className="text-3xl font-semibold text-slate-900 mt-1 mb-2">
        Subir estudio DICOM
      </h1>
      <p className="text-slate-500 mb-8">
        El archivo se enviará al servidor PACS <b>Orthanc</b> y se asignará al médico seleccionado. Solo se aceptan archivos DICOM válidos (.dcm).
      </p>

      <form onSubmit={onSubmit} className="space-y-6" data-testid="upload-form">
        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-lg p-10 text-center transition-colors ${
            dragOver
              ? "border-2 border-sky-500 bg-sky-50"
              : "border-2 border-dashed border-slate-300 bg-slate-50 hover:border-sky-400 hover:bg-sky-50/40"
          }`}
          data-testid="dicom-upload-dropzone"
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <CheckCircle size={24} weight="fill" className="text-emerald-600" />
              <div className="text-left">
                <div className="font-medium text-slate-900" data-testid="selected-file-name">
                  {file.name}
                </div>
                <div className="text-xs text-slate-500">
                  {(file.size / 1024).toFixed(1)} KB
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="ml-4 text-slate-400 hover:text-slate-700"
                data-testid="clear-file-button"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <>
              <FileDashed size={44} weight="duotone" className="mx-auto text-sky-700 mb-3" />
              <p className="text-slate-900 font-medium mb-1">
                Arrastra tu archivo DICOM aquí
              </p>
              <p className="text-sm text-slate-500 mb-4">
                o haz clic para seleccionarlo (.dcm)
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-sky-700 text-white text-sm rounded-md cursor-pointer hover:bg-sky-600 transition-colors">
                <UploadSimple size={16} weight="bold" />
                Seleccionar archivo
                <input
                  type="file"
                  accept=".dcm,application/dicom"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                  data-testid="file-input"
                />
              </label>
            </>
          )}
        </div>

        {/* Metadata */}
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-slate-900 mb-4">
            Información del estudio
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre del paciente" required>
              <input
                required
                className="input"
                value={form.patient_name}
                onChange={(e) => update("patient_name", e.target.value)}
                data-testid="patient-name-input"
              />
            </Field>
            <Field label="Documento del paciente">
              <input
                className="input"
                value={form.patient_document}
                onChange={(e) => update("patient_document", e.target.value)}
                data-testid="patient-document-input"
              />
            </Field>
            <Field label="Asignar al médico" required>
              <select
                required
                className="input"
                value={form.doctor_id}
                onChange={(e) => update("doctor_id", e.target.value)}
                data-testid="doctor-select"
              >
                <option value="">— Selecciona un médico —</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name} {d.specialty ? `· ${d.specialty}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Modalidad">
              <select
                className="input"
                value={form.modality}
                onChange={(e) => update("modality", e.target.value)}
                data-testid="modality-select"
              >
                <option value="">—</option>
                <option value="CT">CT · Tomografía</option>
                <option value="MR">MR · Resonancia</option>
                <option value="US">US · Ecografía</option>
                <option value="CR">CR · Radiografía</option>
                <option value="DX">DX · Rayos X digital</option>
                <option value="MG">MG · Mamografía</option>
                <option value="OTHER">Otra</option>
              </select>
            </Field>
            <Field label="Fecha del estudio">
              <input
                type="date"
                className="input"
                value={form.study_date}
                onChange={(e) => update("study_date", e.target.value)}
                data-testid="study-date-input"
              />
            </Field>
            <Field label="Descripción">
              <input
                className="input"
                value={form.study_description}
                onChange={(e) => update("study_description", e.target.value)}
                data-testid="study-description-input"
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Notas / Observaciones">
                <textarea
                  className="input"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  data-testid="notes-input"
                />
              </Field>
            </div>
          </div>
        </div>

        {err && (
          <div
            className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-md"
            data-testid="upload-error"
          >
            {err}
          </div>
        )}
        {success && (
          <div
            className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-md"
            data-testid="upload-success"
          >
            {success}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
            data-testid="cancel-upload-button"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-700 hover:bg-sky-600 disabled:bg-slate-400 text-white rounded-md transition-colors"
            data-testid="submit-upload-button"
          >
            <UploadSimple size={18} weight="bold" />
            {loading ? "Enviando a Orthanc..." : "Subir a Orthanc"}
          </button>
        </div>
      </form>

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
