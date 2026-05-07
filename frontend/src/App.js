import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import DashboardLayout from "@/pages/DashboardLayout";
import Dashboard from "@/pages/Dashboard";
import Upload from "@/pages/Upload";
import Studies from "@/pages/Studies";
import Logs from "@/pages/Logs";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Cargando...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleGuard({ roles, children }) {
  const { user } = useAuth();
  if (user && roles.includes(user.role)) return children;
  return <Navigate to="/app" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/app"
            element={
              <Protected>
                <DashboardLayout />
              </Protected>
            }
          >
            <Route index element={<Dashboard />} />
            <Route
              path="upload"
              element={
                <RoleGuard roles={["paciente", "clinica"]}>
                  <Upload />
                </RoleGuard>
              }
            />
            <Route path="studies" element={<Studies />} />
            <Route path="logs" element={<Logs />} />
          </Route>
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
