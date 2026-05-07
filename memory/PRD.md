# PRD — Plataforma DICOM Médica (MedDICOM)

## Problem statement original (usuario)
> Crear una plataforma web para gestionar estudios DICOM con tres tipos de usuarios (pacientes, hospitales/clínicas, médicos especialistas), con carga de archivos por parte de pacientes/clínicas y descarga por parte de médicos, aplicando cifrado/seguridad básica. Integrar **Orthanc (PACS)** como backend de almacenamiento y **notificar in-app al médico** cuando se le asigna un estudio.

## User personas
- **Paciente** — sube sus propios estudios y los asigna a un médico.
- **Hospital / Clínica** — sube estudios en nombre de pacientes y los asigna a médicos.
- **Médico Especialista** — recibe, ve notificaciones y descarga los estudios asignados.

## Arquitectura
- **Backend**: FastAPI + Motor (MongoDB async). JWT Bearer 24h + bcrypt.
- **Storage DICOM**: **Orthanc 1.10** (PACS) corriendo en `http://localhost:8042` bajo supervisor. Archivos reales DICOM indexados y comprimidos por Orthanc; metadata clínica en MongoDB.
- **Autenticación Orthanc**: HTTP Basic (usuario `meddicom`) — credenciales en `.env`.
- **Colecciones Mongo**: `users`, `studies` (con `orthanc_id`, `orthanc_study_id`, `storage`), `access_logs`, `notifications`.
- **Frontend**: React 19 + Tailwind + @phosphor-icons/react. Token en `localStorage`, axios interceptor añade `Authorization: Bearer`.

## What's been implemented (actualizado 2026-01)
- **Autenticación JWT** con 3 roles y seed de admin médico.
- **Upload de DICOM a Orthanc**: validación real (si no es DICOM, Orthanc rechaza y devolvemos 400).
- **Download desde Orthanc** con fallback a estudios legacy cifrados con Fernet.
- **Delete**: elimina del PACS y de Mongo; mantiene audit trail.
- **Historial de accesos** `/api/logs` con registro de upload/download/delete y página /app/logs con filtros.
- **Notificaciones in-app**: al subir un estudio se crea automáticamente una notificación para el médico asignado. Campanita en el header con badge de sin leer, dropdown, marcar leída al click, "marcar todas", polling cada 30s.
- **Dashboard** por rol con stats, actividad reciente y accesos rápidos.
- **Pruebas**: 51/51 pytest (auth, studies, stats, logs, Orthanc, notifications) + E2E Playwright (login, roleguard, dashboard, logs, campanita completa).

## Credenciales
- App admin: **admin@medicos.com / admin123** (rol médico, Radiología)
- Orthanc (interno): meddicom / meddicom_secret_2026 — http://localhost:8042

## Prioritized backlog
- **P1** — Recuperación de contraseña (forgot/reset).
- **P1** — Página de perfil editable.
- **P2** — Push en tiempo real (WebSocket/SSE) en lugar de polling 30s.
- **P2** — Visor DICOM embebido usando Orthanc Explorer / OHIF Viewer.
- **P2** — Brute-force lockout en login.
- **P2** — Notificación también para el uploader cuando el médico descarga.
- **P2** — Paginación y exportación CSV de logs.
