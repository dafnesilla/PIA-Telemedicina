# PRD — Plataforma DICOM Médica (MedDICOM)

## Problem statement original (usuario)
> "Diseño de la estructura de la plataforma web: Crear una estructura de usuario básica con permisos de acceso (usuario y contraseña) para pacientes/usuarios, hospitales/clínicas y médicos especialistas. Además, incorporar una pestaña de carga de archivos para pacientes, clínicas u hospitales, y una pestaña de descarga para médicos. Desarrollo de funcionalidades: Implementar un sistema de registro para los usuarios, configurar el almacenamiento de archivos DICOM en la aplicación, revisar de que manera se podría asegurar la privacidad y seguridad de los datos mediante protocolos básicos de cifrado y permisos de acceso."

## User personas
- **Paciente** — sube sus propios estudios y los asigna a un médico.
- **Hospital / Clínica** — sube estudios en nombre de pacientes y los asigna a médicos.
- **Médico Especialista** — recibe y descarga los estudios que le son asignados.

## Core requirements (estáticos)
- Registro/login con tres roles y control de acceso por rol.
- Carga de archivos DICOM con metadatos del paciente y asignación explícita al médico.
- Descarga restringida: sólo uploader y médico asignado.
- Cifrado de los archivos en reposo.
- Contraseñas hasheadas (bcrypt).
- UI en español, estilo médico profesional (azul/blanco).

## Arquitectura
- Backend: FastAPI + Motor (MongoDB async). JWT Bearer (24h) + bcrypt.
- Almacenamiento: archivos cifrados con **Fernet (AES-128 CBC + HMAC)** en `/app/backend/dicom_storage`. Metadata en MongoDB.
- Frontend: React 19 + React Router + Tailwind + @phosphor-icons/react. Token en `localStorage`, axios interceptor añade `Authorization: Bearer`.
- Colecciones: `users`, `studies`, `access_logs`.

## What's been implemented (2026-01)
- **Autenticación JWT** (`/api/auth/register`, `/login`, `/logout`, `/me`) con seed admin médico.
- **Gestión de estudios DICOM**: upload multipart con cifrado Fernet, listado filtrado por rol, descarga con descifrado, delete (sólo uploader).
- **Asignación a médico**: endpoint `/api/doctors` + dropdown en upload.
- **Dashboard por rol**: stats, acciones rápidas, card de privacidad y actividad reciente.
- **Historial de accesos / Audit trail** (`/api/logs`, `/api/studies/{id}/logs`): registra upload/download/delete con actor, rol, IP y timestamp. Página /app/logs con filtro por acción y búsqueda.
- **Pruebas**: 38/38 pytest (auth, studies, stats, logs). E2E Playwright verificó login/logout, roleguard, dashboard, navegación y tabla de logs.

## Prioritized backlog (P0/P1/P2)
- **P1** — Recuperación de contraseña (forgot/reset password).
- **P1** — Página de perfil editable (actualizar nombre, especialidad, teléfono).
- **P2** — Protección de fuerza bruta en login (lockout tras 5 intentos).
- **P2** — Hacer `seed_admin` idempotente ante cambio de `ADMIN_PASSWORD`.
- **P2** — Notificación al médico cuando se le asigna un estudio (email / in-app).
- **P2** — Paginación en listado de estudios y logs cuando crezca el volumen.
- **P2** — Exportar historial de accesos a CSV.

## Credenciales de prueba
- admin@medicos.com / admin123 (rol médico, especialidad Radiología)
