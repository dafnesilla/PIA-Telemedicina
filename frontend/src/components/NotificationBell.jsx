import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Bell, BellRinging, CheckCircle, X } from "@phosphor-icons/react";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const fetchUnread = async () => {
    try {
      const { data } = await api.get("/notifications/unread-count");
      setUnread(data.count || 0);
    } catch {}
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/notifications", { params: { limit: 20 } });
      setItems(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchUnread();
    const t = setInterval(fetchUnread, 30000); // poll every 30s
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (open) fetchItems();
  }, [open]);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleClick = async (n) => {
    if (!n.read) {
      try {
        await api.post(`/notifications/${n.id}/read`);
      } catch {}
      setItems((arr) => arr.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.study_id) {
      navigate("/app/studies");
    }
  };

  const markAllRead = async () => {
    try {
      await api.post("/notifications/read-all");
    } catch {}
    setItems((arr) => arr.map((x) => ({ ...x, read: true })));
    setUnread(0);
  };

  const Icon = unread > 0 ? BellRinging : Bell;

  return (
    <div className="relative" ref={ref} data-testid="notification-bell">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        data-testid="notification-bell-button"
        aria-label="Notificaciones"
      >
        <Icon size={20} weight={unread > 0 ? "fill" : "regular"} />
        {unread > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-semibold rounded-full flex items-center justify-center"
            data-testid="notification-unread-badge"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[360px] bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden"
          data-testid="notification-dropdown"
        >
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-900 text-sm">Notificaciones</div>
              <div className="text-xs text-slate-500">
                {unread > 0 ? `${unread} sin leer` : "Al día"}
              </div>
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-sky-700 hover:text-sky-600 font-medium inline-flex items-center gap-1"
                data-testid="mark-all-read-button"
              >
                <CheckCircle size={14} weight="bold" />
                Marcar todas
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-sm text-slate-500 text-center">Cargando...</div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center">
                <Bell size={28} weight="duotone" className="mx-auto text-slate-300 mb-2" />
                <div className="text-sm text-slate-500">Sin notificaciones</div>
              </div>
            ) : (
              <ul>
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={`border-b border-slate-100 last:border-b-0 ${
                      n.read ? "bg-white" : "bg-sky-50/40"
                    }`}
                  >
                    <button
                      onClick={() => handleClick(n)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex gap-3"
                      data-testid={`notification-item-${n.id}`}
                    >
                      <div
                        className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                          n.read ? "bg-transparent" : "bg-sky-600"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-sm ${
                            n.read ? "text-slate-700" : "font-medium text-slate-900"
                          }`}
                        >
                          {n.title}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          {n.message}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          {new Date(n.created_at).toLocaleString("es")}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
