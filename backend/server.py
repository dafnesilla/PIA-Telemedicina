from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import bcrypt
import jwt
import httpx
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from cryptography.fernet import Fernet
import io

# ============ CONFIG ============
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
FERNET_KEY = os.environ["FERNET_KEY"]
STORAGE_DIR = Path(os.environ["DICOM_STORAGE_DIR"])
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

ORTHANC_URL = os.environ.get("ORTHANC_URL", "http://localhost:8042").rstrip("/")
ORTHANC_USER = os.environ.get("ORTHANC_USER", "")
ORTHANC_PASSWORD = os.environ.get("ORTHANC_PASSWORD", "")
ORTHANC_AUTH = (ORTHANC_USER, ORTHANC_PASSWORD) if ORTHANC_USER else None

JWT_ALG = "HS256"
ACCESS_TTL_MIN = 60 * 24  # 24h for convenience in MVP
ALLOWED_ROLES = {"paciente", "clinica", "medico"}

fernet = Fernet(FERNET_KEY.encode())
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Plataforma DICOM Médica")
api = APIRouter(prefix="/api")

# ============ LOGGING ============
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ============ MODELS ============
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    role: str
    # role-specific optional fields
    organization: Optional[str] = None  # hospital/clinic name
    specialty: Optional[str] = None  # medico specialty
    phone: Optional[str] = None

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    organization: Optional[str] = None
    specialty: Optional[str] = None
    phone: Optional[str] = None
    created_at: str

class AuthResponse(BaseModel):
    user: UserOut
    access_token: str
    token_type: str = "bearer"

class DoctorOut(BaseModel):
    id: str
    full_name: str
    specialty: Optional[str] = None
    email: str

class StudyOut(BaseModel):
    id: str
    filename: str
    patient_name: str
    patient_document: Optional[str] = None
    study_description: Optional[str] = None
    modality: Optional[str] = None
    study_date: Optional[str] = None
    notes: Optional[str] = None
    size_bytes: int
    uploader_id: str
    uploader_name: str
    uploader_role: str
    doctor_id: str
    doctor_name: str
    created_at: str
    orthanc_id: Optional[str] = None
    orthanc_study_id: Optional[str] = None
    storage: str = "local"

# ============ AUTH HELPERS ============
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=ACCESS_TTL_MIN * 60,
        path="/",
    )

def user_to_dict(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "email": doc["email"],
        "full_name": doc["full_name"],
        "role": doc["role"],
        "organization": doc.get("organization"),
        "specialty": doc.get("specialty"),
        "phone": doc.get("phone"),
        "created_at": doc["created_at"],
    }

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token inválido")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

def require_role(*roles: str):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Permiso denegado")
        return user
    return dep

# ============ AUTH ROUTES ============
@api.post("/auth/register", response_model=AuthResponse)
async def register(payload: RegisterIn, response: Response):
    role = payload.role.lower().strip()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Rol inválido")
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="El correo ya está registrado")
    now = datetime.now(timezone.utc).isoformat()
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(payload.password),
        "full_name": payload.full_name.strip(),
        "role": role,
        "organization": payload.organization,
        "specialty": payload.specialty if role == "medico" else None,
        "phone": payload.phone,
        "created_at": now,
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_doc["id"], email, role)
    set_auth_cookie(response, token)
    return {"user": user_to_dict(user_doc), "access_token": token, "token_type": "bearer"}

@api.post("/auth/login", response_model=AuthResponse)
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = create_access_token(user["id"], email, user["role"])
    set_auth_cookie(response, token)
    return {"user": user_to_dict(user), "access_token": token, "token_type": "bearer"}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user_to_dict(user)

# ============ DOCTORS ============
@api.get("/doctors", response_model=List[DoctorOut])
async def list_doctors(user: dict = Depends(get_current_user)):
    docs = await db.users.find({"role": "medico"}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [{"id": d["id"], "full_name": d["full_name"], "specialty": d.get("specialty"), "email": d["email"]} for d in docs]

# ============ STUDIES (DICOM) ============
def _study_public(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "patient_name": doc["patient_name"],
        "patient_document": doc.get("patient_document"),
        "study_description": doc.get("study_description"),
        "modality": doc.get("modality"),
        "study_date": doc.get("study_date"),
        "notes": doc.get("notes"),
        "size_bytes": doc["size_bytes"],
        "uploader_id": doc["uploader_id"],
        "uploader_name": doc["uploader_name"],
        "uploader_role": doc["uploader_role"],
        "doctor_id": doc["doctor_id"],
        "doctor_name": doc["doctor_name"],
        "created_at": doc["created_at"],
        "orthanc_id": doc.get("orthanc_id"),
        "orthanc_study_id": doc.get("orthanc_study_id"),
        "storage": doc.get("storage", "local"),
    }

# ============ ORTHANC CLIENT ============
async def orthanc_upload(data: bytes) -> dict:
    """Upload DICOM bytes to Orthanc. Returns {"ID": instance_id, "ParentStudy": study_uid, ...}"""
    try:
        async with httpx.AsyncClient(auth=ORTHANC_AUTH, timeout=30.0) as cli:
            r = await cli.post(f"{ORTHANC_URL}/instances", content=data,
                               headers={"Content-Type": "application/dicom"})
            if r.status_code >= 400:
                raise HTTPException(status_code=400,
                                    detail=f"Orthanc rechazó el archivo (no es DICOM válido): {r.text[:200]}")
            return r.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Orthanc upload error: {e}")
        raise HTTPException(status_code=502, detail=f"No se pudo conectar con Orthanc: {e}")

async def orthanc_download(instance_id: str) -> bytes:
    """Download DICOM bytes from Orthanc by instance ID."""
    try:
        async with httpx.AsyncClient(auth=ORTHANC_AUTH, timeout=60.0) as cli:
            r = await cli.get(f"{ORTHANC_URL}/instances/{instance_id}/file")
            if r.status_code == 404:
                raise HTTPException(status_code=404, detail="Archivo no disponible en Orthanc")
            if r.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Error al leer Orthanc: {r.text[:200]}")
            return r.content
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Orthanc download error: {e}")
        raise HTTPException(status_code=502, detail=f"No se pudo conectar con Orthanc: {e}")

async def orthanc_delete(instance_id: str):
    try:
        async with httpx.AsyncClient(auth=ORTHANC_AUTH, timeout=30.0) as cli:
            await cli.delete(f"{ORTHANC_URL}/instances/{instance_id}")
    except Exception as e:
        logger.warning(f"Orthanc delete failed for {instance_id}: {e}")

# ============ ACCESS LOGS (audit trail) ============
async def log_access(request: Request, user: dict, study: dict, action: str):
    """Record an audit trail entry for a study action."""
    ip = None
    try:
        if request.client:
            ip = request.client.host
        xff = request.headers.get("x-forwarded-for")
        if xff:
            ip = xff.split(",")[0].strip()
    except Exception:
        pass
    entry = {
        "id": str(uuid.uuid4()),
        "study_id": study["id"],
        "study_filename": study["filename"],
        "patient_name": study["patient_name"],
        "uploader_id": study["uploader_id"],
        "doctor_id": study["doctor_id"],
        "actor_id": user["id"],
        "actor_name": user["full_name"],
        "actor_role": user["role"],
        "action": action,  # upload | download | delete
        "ip_address": ip,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.access_logs.insert_one(entry)
    except Exception as e:
        logger.warning(f"Failed to log access: {e}")

def _log_public(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "study_id": doc["study_id"],
        "study_filename": doc.get("study_filename", ""),
        "patient_name": doc.get("patient_name", ""),
        "actor_id": doc["actor_id"],
        "actor_name": doc["actor_name"],
        "actor_role": doc["actor_role"],
        "action": doc["action"],
        "ip_address": doc.get("ip_address"),
        "timestamp": doc["timestamp"],
    }

@api.post("/studies/upload", response_model=StudyOut)
async def upload_study(
    request: Request,
    file: UploadFile = File(...),
    patient_name: str = Form(...),
    doctor_id: str = Form(...),
    patient_document: Optional[str] = Form(None),
    study_description: Optional[str] = Form(None),
    modality: Optional[str] = Form(None),
    study_date: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    user: dict = Depends(require_role("paciente", "clinica")),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Archivo inválido")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    # verify doctor exists
    doctor = await db.users.find_one({"id": doctor_id, "role": "medico"}, {"_id": 0, "password_hash": 0})
    if not doctor:
        raise HTTPException(status_code=400, detail="Médico seleccionado no existe")

    # Send to Orthanc (primary storage)
    orthanc_resp = await orthanc_upload(data)
    orthanc_instance_id = orthanc_resp.get("ID")
    orthanc_study_id = orthanc_resp.get("ParentStudy")
    if not orthanc_instance_id:
        raise HTTPException(status_code=502, detail="Orthanc no devolvió un ID válido")

    study_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": study_id,
        "filename": file.filename,
        "storage": "orthanc",
        "orthanc_id": orthanc_instance_id,
        "orthanc_study_id": orthanc_study_id,
        "patient_name": patient_name.strip(),
        "patient_document": patient_document,
        "study_description": study_description,
        "modality": modality,
        "study_date": study_date,
        "notes": notes,
        "size_bytes": len(data),
        "uploader_id": user["id"],
        "uploader_name": user["full_name"],
        "uploader_role": user["role"],
        "doctor_id": doctor["id"],
        "doctor_name": doctor["full_name"],
        "created_at": now,
    }
    await db.studies.insert_one(doc)
    await log_access(request, user, doc, "upload")
    # Create in-app notification for the assigned doctor
    await create_notification(
        user_id=doctor["id"],
        ntype="study_assigned",
        title="Nuevo estudio asignado",
        message=f"{user['full_name']} te ha asignado un estudio de {patient_name.strip()}.",
        study_id=study_id,
    )
    return _study_public(doc)

@api.get("/studies", response_model=List[StudyOut])
async def list_studies(user: dict = Depends(get_current_user)):
    role = user["role"]
    if role == "medico":
        query = {"doctor_id": user["id"]}
    elif role in ("paciente", "clinica"):
        query = {"uploader_id": user["id"]}
    else:
        query = {}
    docs = await db.studies.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [_study_public(d) for d in docs]

@api.get("/studies/{study_id}/download")
async def download_study(study_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await db.studies.find_one({"id": study_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Estudio no encontrado")
    # access control: doctor assigned OR uploader
    if user["role"] == "medico":
        if doc["doctor_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="No tienes acceso a este estudio")
    elif user["role"] in ("paciente", "clinica"):
        if doc["uploader_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="No tienes acceso a este estudio")
    else:
        raise HTTPException(status_code=403, detail="Permiso denegado")

    # Fetch bytes from Orthanc (primary) or legacy local encrypted store
    if doc.get("storage") == "orthanc" and doc.get("orthanc_id"):
        data = await orthanc_download(doc["orthanc_id"])
    else:
        fpath = Path(doc.get("storage_path", ""))
        if not fpath.exists():
            raise HTTPException(status_code=404, detail="Archivo no disponible")
        with open(fpath, "rb") as f:
            encrypted = f.read()
        try:
            data = fernet.decrypt(encrypted)
        except Exception:
            raise HTTPException(status_code=500, detail="Error al descifrar el archivo")

    await log_access(request, user, doc, "download")
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/dicom",
        headers={"Content-Disposition": f'attachment; filename="{doc["filename"]}"'},
    )

@api.delete("/studies/{study_id}")
async def delete_study(study_id: str, request: Request, user: dict = Depends(get_current_user)):
    doc = await db.studies.find_one({"id": study_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Estudio no encontrado")
    if user["role"] not in ("paciente", "clinica") or doc["uploader_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Solo quien subió el archivo puede eliminarlo")

    # Delete from storage
    if doc.get("storage") == "orthanc" and doc.get("orthanc_id"):
        await orthanc_delete(doc["orthanc_id"])
    else:
        fpath = Path(doc.get("storage_path", ""))
        if fpath.exists():
            try:
                fpath.unlink()
            except Exception:
                pass
    await db.studies.delete_one({"id": study_id})
    await log_access(request, user, doc, "delete")
    return {"ok": True}

# ============ NOTIFICATIONS (in-app) ============
async def create_notification(user_id: str, ntype: str, title: str, message: str, study_id: Optional[str] = None):
    entry = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": ntype,
        "title": title,
        "message": message,
        "study_id": study_id,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.notifications.insert_one(entry)
    except Exception as e:
        logger.warning(f"Failed to create notification: {e}")

def _notif_public(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "type": doc["type"],
        "title": doc["title"],
        "message": doc["message"],
        "study_id": doc.get("study_id"),
        "read": bool(doc.get("read")),
        "created_at": doc["created_at"],
    }

@api.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user), limit: int = 50):
    docs = await db.notifications.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(max(1, min(limit, 200)))
    return [_notif_public(d) for d in docs]

@api.get("/notifications/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    c = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"count": c}

@api.post("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, user: dict = Depends(get_current_user)):
    res = await db.notifications.update_one(
        {"id": notif_id, "user_id": user["id"]}, {"$set": {"read": True}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    return {"ok": True}

@api.post("/notifications/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": user["id"], "read": False}, {"$set": {"read": True}}
    )
    return {"ok": True}

# ============ ACCESS LOG ENDPOINTS ============
@api.get("/logs")
async def list_logs(user: dict = Depends(get_current_user), limit: int = 200):
    """Return audit logs relevant to the current user.
    - paciente/clinica: logs of studies they uploaded
    - medico: logs of studies assigned to them
    """
    role = user["role"]
    if role == "medico":
        query = {"doctor_id": user["id"]}
    elif role in ("paciente", "clinica"):
        query = {"uploader_id": user["id"]}
    else:
        query = {}
    docs = await db.access_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(max(1, min(limit, 1000)))
    return [_log_public(d) for d in docs]

@api.get("/studies/{study_id}/logs")
async def study_logs(study_id: str, user: dict = Depends(get_current_user)):
    """Return audit logs for a specific study (uploader or assigned doctor only)."""
    study = await db.studies.find_one({"id": study_id}, {"_id": 0})
    if not study:
        raise HTTPException(status_code=404, detail="Estudio no encontrado")
    if user["role"] == "medico":
        if study["doctor_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="No tienes acceso a este estudio")
    elif user["role"] in ("paciente", "clinica"):
        if study["uploader_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="No tienes acceso a este estudio")
    else:
        raise HTTPException(status_code=403, detail="Permiso denegado")
    docs = await db.access_logs.find({"study_id": study_id}, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return [_log_public(d) for d in docs]

@api.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    role = user["role"]
    if role == "medico":
        total = await db.studies.count_documents({"doctor_id": user["id"]})
        patients = await db.studies.distinct("patient_name", {"doctor_id": user["id"]})
        return {"total_studies": total, "unique_patients": len(patients)}
    elif role in ("paciente", "clinica"):
        total = await db.studies.count_documents({"uploader_id": user["id"]})
        doctors = await db.studies.distinct("doctor_id", {"uploader_id": user["id"]})
        return {"total_studies": total, "unique_doctors": len(doctors)}
    return {"total_studies": 0}

@api.get("/")
async def root():
    return {"message": "Plataforma DICOM Médica API"}

# ============ STARTUP ============
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("role")
    await db.studies.create_index("doctor_id")
    await db.studies.create_index("uploader_id")
    await db.studies.create_index("created_at")
    await db.access_logs.create_index("study_id")
    await db.access_logs.create_index("uploader_id")
    await db.access_logs.create_index("doctor_id")
    await db.access_logs.create_index("timestamp")
    await db.notifications.create_index("user_id")
    await db.notifications.create_index("created_at")
    # seed admin (as medico for test)
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@medicos.com")
    admin_pwd = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_pwd),
            "full_name": "Dr. Admin Sistema",
            "role": "medico",
            "organization": None,
            "specialty": "Radiología",
            "phone": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    logger.info("Startup complete.")

@app.on_event("shutdown")
async def shutdown():
    client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
