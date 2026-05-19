import React, { useEffect, useState } from "react";
import api, { API, formatApiError } from "@/lib/api";
import { tokenStore } from "@/lib/api";
import { X, CaretLeft, CaretRight, Eye, Spinner } from "@phosphor-icons/react";

export default function DicomViewer({ study, onClose }) {
  const [info, setInfo] = useState(null);
  const [frame, setFrame] = useState(0);
  const [imgUrl, setImgUrl] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr("");
      try {
        const { data } = await api.get(`/studies/${study.id}/info`);
        if (cancelled) return;
        setInfo(data);
        if (!data.viewable) {
          setErr(data.reason || "Vista previa no disponible para este estudio.");
        }
      } catch (e) {
        if (!cancelled) setErr(formatApiError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [study.id]);

  // Fetch image as blob with Authorization header
  useEffect(() => {
    if (!info?.viewable) return;
    let cancelled = false;
    let blobUrl = "";
    (async () => {
      setLoading(true);
      try {
        const token = tokenStore.get();
        const res = await fetch(
          `${API}/studies/${study.id}/preview${frame > 0 ? `?frame=${frame}` : ""}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
        if (!cancelled) setImgUrl(blobUrl);
      } catch (e) {
        if (!cancelled) setErr(e.message || "No se pudo cargar la imagen");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [info, study.id, frame]);

  // Close on Esc
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (info?.frames > 1) {
        if (e.key === "ArrowLeft") setFrame((f) => Math.max(0, f - 1));
        if (e.key === "ArrowRight") setFrame((f) => Math.min(info.frames - 1, f + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [info, onClose]);

  const multiFrame = info?.frames > 1;
  const tagEntries = info?.tags ? Object.entries(info.tags) : [];

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/80 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="dicom-viewer-overlay"
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="dicom-viewer-modal"
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Eye size={18} weight="duotone" className="text-sky-700" />
              <h3 className="font-medium text-slate-900 truncate">
                {study.patient_name}
              </h3>
              {study.modality && (
                <span className="inline-block px-2 py-0.5 rounded bg-sky-50 text-sky-800 text-xs font-medium border border-sky-100">
                  {study.modality}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 truncate mt-0.5">
              {study.filename} · {(study.size_bytes / 1024).toFixed(1)} KB
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-slate-100 text-slate-500"
            data-testid="dicom-viewer-close"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Image */}
          <div className="flex-1 bg-slate-950 flex items-center justify-center relative min-h-[300px]">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                <Spinner size={32} className="animate-spin" />
              </div>
            )}
            {err && !loading && (
              <div className="text-slate-300 text-sm p-6 text-center">
                {err}
              </div>
            )}
            {!err && imgUrl && (
              <img
                src={imgUrl}
                alt={`Imagen DICOM ${study.filename}`}
                className="max-w-full max-h-[70vh] object-contain"
                data-testid="dicom-viewer-image"
              />
            )}

            {multiFrame && (
              <>
                <button
                  onClick={() => setFrame((f) => Math.max(0, f - 1))}
                  disabled={frame === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white flex items-center justify-center transition-colors"
                  data-testid="dicom-prev-frame"
                  aria-label="Frame anterior"
                >
                  <CaretLeft size={20} weight="bold" />
                </button>
                <button
                  onClick={() => setFrame((f) => Math.min(info.frames - 1, f + 1))}
                  disabled={frame === info.frames - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white flex items-center justify-center transition-colors"
                  data-testid="dicom-next-frame"
                  aria-label="Frame siguiente"
                >
                  <CaretRight size={20} weight="bold" />
                </button>
                <div
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white/10 text-white text-xs"
                  data-testid="dicom-frame-counter"
                >
                  Frame {frame + 1} / {info.frames}
                </div>
              </>
            )}
          </div>

          {/* Tags sidebar */}
          <aside className="md:w-72 border-t md:border-t-0 md:border-l border-slate-200 bg-slate-50 overflow-y-auto">
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="label-small">Metadata DICOM</div>
            </div>
            {tagEntries.length === 0 ? (
              <div className="p-4 text-xs text-slate-500">
                {info ? "Sin metadata disponible." : "Cargando..."}
              </div>
            ) : (
              <dl className="divide-y divide-slate-200" data-testid="dicom-tags-list">
                {tagEntries.map(([k, v]) => (
                  <div key={k} className="px-4 py-2.5">
                    <dt className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                      {k}
                    </dt>
                    <dd className="text-sm text-slate-900 break-words">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </aside>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
          <span>
            Vista previa generada por Orthanc · Subido por {study.uploader_name}
          </span>
          <span className="text-slate-400">Tecla Esc para cerrar</span>
        </div>
      </div>
    </div>
  );
}
