# MedDICOM — Plataforma de Gestión de Estudios DICOM

Plataforma web **privada** para gestionar estudios DICOM entre **pacientes**, **hospitales/clínicas** y **médicos especialistas**, con almacenamiento en **Orthanc (PACS)**, notificaciones in-app al médico asignado e historial de accesos.

> Proyecto académico — pensado para correr **localmente** sin exponerse a internet.

---

## 🧱 Arquitectura

```
┌──────────────┐        ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│   Frontend   │  HTTP  │   Backend    │  REST  │   Orthanc    │        │   MongoDB    │
│  React+Nginx │ ─────► │   FastAPI    │ ─────► │    PACS      │        │              │
│  :3000       │        │   :8001      │        │   :8042      │        │   :27017     │
└──────────────┘        └──────────────┘        └──────────────┘        └──────────────┘
                              │                                               ▲
                              └───────────────────────────────────────────────┘
```

- **Frontend** React 19 + Tailwind, servido por Nginx. Proxy `/api` → backend.
- **Backend** FastAPI + Motor (Mongo async), JWT Bearer + bcrypt, integración REST con Orthanc.
- **Orthanc** 1.12 como servidor PACS que valida e indexa los DICOM.
- **MongoDB** guarda usuarios, metadata de estudios, historial de accesos y notificaciones.

---

## ✅ Requisitos

- **Docker** ≥ 20 y **Docker Compose** ≥ 2
- 4 GB de RAM libres y ~2 GB de disco
- Navegador moderno (Chrome/Firefox/Edge)

> Instrucciones para instalar Docker: https://docs.docker.com/get-docker/

---

## 🚀 Arranque rápido (3 pasos)

### 1. Clona el proyecto y entra a la carpeta
```bash
git clone <tu_repo>.git meddicom
cd meddicom
```

### 2. Genera claves y crea tu `.env`
```bash
cp .env.example .env
```
Abre `.env` y reemplaza los placeholders:

```bash
# Genera una clave JWT aleatoria (64 caracteres hex)
openssl rand -hex 32

# Genera una clave Fernet (32 bytes base64)
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Pega los valores resultantes en `JWT_SECRET` y `FERNET_KEY`. Cambia también `ADMIN_PASSWORD` y `ORTHANC_PASSWORD` por contraseñas propias.

### 3. Levanta todo
```bash
docker compose up -d --build
```

La primera vez tardará 3-5 minutos (build de imágenes + descarga de Orthanc). Al finalizar:

- 🌐 **App**: http://localhost:3000
- 🔑 **Login**: `admin@medicos.com` / `admin123` (o el que hayas puesto en `.env`)

> Solo se expone el puerto `3000` y **únicamente en `127.0.0.1`** (tu propia máquina). Ni MongoDB, ni Orthanc, ni el backend son accesibles desde la red. Es **privado por diseño**.

---

## 👥 Registro de usuarios

Desde la pantalla de login pulsa **"Regístrate aquí"** y elige un rol:

| Rol | Qué puede hacer |
|---|---|
| **Paciente** | Subir sus propios estudios y asignarlos a un médico. |
| **Hospital / Clínica** | Subir estudios en nombre de pacientes y asignarlos. |
| **Médico Especialista** | Recibir notificaciones, ver y descargar estudios asignados. |

Para tu presentación:
- Crea 1 médico (ej. `drgarcia@demo.com`), 1 paciente y 1 clínica.
- El paciente sube un archivo DICOM y lo asigna al médico.
- El médico ve la campanita con notificación, abre el estudio, lo descarga.

---

## 📂 Estructura del repositorio

```
meddicom/
├── backend/            # FastAPI + Motor
│   ├── server.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/           # React + Tailwind (build production con Nginx)
│   ├── src/
│   ├── package.json
│   ├── nginx.conf
│   └── Dockerfile
├── orthanc/
│   └── orthanc.json    # Configuración del PACS
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🛠️ Operaciones útiles

### Ver logs en vivo
```bash
docker compose logs -f backend        # logs del backend
docker compose logs -f orthanc        # logs del PACS
```

### Detener todo (conservando datos)
```bash
docker compose down
```

### Borrar todo (¡incluye DB y estudios!)
```bash
docker compose down -v
```

### Reconstruir tras cambios de código
```bash
docker compose up -d --build
```

### Entrar a un contenedor
```bash
docker compose exec backend bash
docker compose exec mongodb mongosh medicos_dicom_db
```

---

## 🧪 Probar que todo funciona

Con un archivo DICOM de ejemplo (`sample.dcm`) puedes verificar el flujo desde la terminal:

```bash
# 1. Obtener token de admin
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@medicos.com","password":"admin123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# 2. Listar médicos
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/doctors

# 3. Verificar Orthanc (solo desde dentro del contenedor)
docker compose exec backend curl -u meddicom:$ORTHANC_PASSWORD http://orthanc:8042/system
```

### Generar un DICOM de prueba
```bash
pip install pydicom
python3 - <<'EOF'
from pydicom.dataset import Dataset, FileDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid
import datetime
fm = Dataset()
fm.MediaStorageSOPClassUID = '1.2.840.10008.5.1.4.1.1.7'
fm.MediaStorageSOPInstanceUID = generate_uid()
fm.TransferSyntaxUID = ExplicitVRLittleEndian
fm.ImplementationClassUID = generate_uid()
ds = FileDataset('sample.dcm', {}, file_meta=fm, preamble=b"\0"*128)
ds.PatientName = 'Demo^Paciente'; ds.PatientID = '001'; ds.Modality = 'OT'
ds.StudyInstanceUID = generate_uid(); ds.SeriesInstanceUID = generate_uid()
ds.SOPInstanceUID = fm.MediaStorageSOPInstanceUID
ds.SOPClassUID = fm.MediaStorageSOPClassUID
ds.ContentDate = datetime.date.today().strftime("%Y%m%d")
ds.ContentTime = datetime.datetime.now().strftime("%H%M%S")
ds.is_little_endian = True; ds.is_implicit_VR = False
ds.save_as('sample.dcm'); print("sample.dcm listo")
EOF
```

Súbelo desde la interfaz en **Subir Estudio**.

---

## 🔒 Seguridad & privacidad

- ✅ **Sólo `localhost`** — el puerto `3000` se bindea a `127.0.0.1`. Nadie de tu red LAN puede acceder.
- ✅ **Autenticación JWT Bearer** (24 h) con `bcrypt` para contraseñas.
- ✅ **Orthanc** detrás de Basic Auth y sin puertos expuestos al host.
- ✅ **Control de acceso por rol**: el médico sólo ve los estudios asignados a él; el paciente/clínica sólo los suyos.
- ✅ **Historial de accesos (audit trail)**: cada subida/descarga/eliminación queda registrada con usuario, IP y timestamp.

### Si quieres exponerlo sólo durante la presentación
Usa un túnel temporal (gratis) y ciérralo al terminar:

```bash
# Con ngrok (https://ngrok.com)
ngrok http 3000

# O con Cloudflare Tunnel (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
cloudflared tunnel --url http://localhost:3000
```

La URL temporal sólo existe mientras el comando esté corriendo; al cerrar la terminal se apaga.

---

## 🧯 Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `docker compose up` falla con `port is already allocated` | El 3000 ya está ocupado. | Cambia `APP_PORT=3080` en `.env`. |
| El login responde "Orthanc rechazó el archivo" | Subiste un archivo que no es DICOM. | Orthanc valida el formato. Usa un `.dcm` real. |
| El frontend muestra "Network Error" | Backend no arrancó. | `docker compose logs backend` |
| Cambios de código no se reflejan | Estás usando la imagen cacheada. | `docker compose up -d --build` |
| Perdí la contraseña del admin | Cambia `ADMIN_PASSWORD` y el seed la actualiza al reiniciar. (Si no, borra el user desde mongosh). | |

---

## 📚 Stack técnico

- **Backend**: FastAPI 0.110, Motor 3.3, PyJWT, bcrypt, cryptography (Fernet), httpx, pydicom (tests)
- **Frontend**: React 19, React Router 7, Tailwind 3, @phosphor-icons/react, axios
- **Infra**: Docker Compose, Nginx 1.27, MongoDB 7, Orthanc 1.12

---

## 📄 Licencia / Uso

Proyecto académico. Siéntete libre de adaptarlo. No está pensado para producción clínica real (no cumple HIPAA/GDPR out of the box — requiere hardening adicional).
