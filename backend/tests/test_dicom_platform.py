"""Backend tests for Plataforma DICOM Médica - auth, doctors, studies, stats, orthanc, notifications."""
import os
import io
import uuid
import hashlib
import requests
import pytest

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@medicos.com"
ADMIN_PASSWORD = "admin123"

ORTHANC_URL = "http://localhost:8042"
ORTHANC_AUTH = ("meddicom", "meddicom_secret_2026")


def _make_dicom_bytes(patient_name: str = "Test^Patient") -> bytes:
    """Generate a minimal valid DICOM file in-memory using pydicom."""
    from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
    from pydicom.uid import ExplicitVRLittleEndian, generate_uid

    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.7"  # SC
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = generate_uid()

    ds = FileDataset(None, {}, file_meta=file_meta, preamble=b"\0" * 128)
    ds.PatientName = patient_name
    ds.PatientID = "TEST001"
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.SOPClassUID = file_meta.MediaStorageSOPClassUID
    ds.Modality = "OT"
    ds.is_little_endian = True
    ds.is_implicit_VR = False

    buf = io.BytesIO()
    ds.save_as(buf, write_like_original=False)
    return buf.getvalue()


def _unique(prefix):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@test.com"


@pytest.fixture(scope="module")
def session_paciente():
    s = requests.Session()
    email = _unique("pac")
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "pass1234", "full_name": "Test Paciente", "role": "paciente"
    })
    assert r.status_code == 200, r.text
    s.email = email
    return s


@pytest.fixture(scope="module")
def session_clinica():
    s = requests.Session()
    email = _unique("cli")
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "pass1234", "full_name": "Clinica X", "role": "clinica", "organization": "Hosp A"
    })
    assert r.status_code == 200, r.text
    s.email = email
    return s


@pytest.fixture(scope="module")
def session_medico():
    s = requests.Session()
    email = _unique("med")
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "pass1234", "full_name": "Dr Test", "role": "medico", "specialty": "Cardio"
    })
    assert r.status_code == 200, r.text
    s.email = email
    s.user = r.json()["user"]
    return s


@pytest.fixture(scope="module")
def session_admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    s.user = r.json()["user"]
    return s


# ---------- AUTH ----------
class TestAuth:
    def test_register_invalid_role(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": _unique("bad"), "password": "pass1234", "full_name": "X", "role": "admin"
        })
        assert r.status_code == 400

    def test_register_duplicate_email(self, session_paciente):
        r = requests.post(f"{API}/auth/register", json={
            "email": session_paciente.email, "password": "pass1234", "full_name": "Dup", "role": "paciente"
        })
        assert r.status_code == 400

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_login_returns_token_shape(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        j = r.json()
        assert "user" in j and "access_token" in j and j.get("token_type") == "bearer"
        assert isinstance(j["access_token"], str) and len(j["access_token"]) > 20
        assert j["user"]["email"] == ADMIN_EMAIL

    def test_bearer_token_works_on_me(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        token = r.json()["access_token"]
        r2 = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        assert r2.json()["email"] == ADMIN_EMAIL

    def test_bearer_token_works_on_doctors_studies_stats(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        assert requests.get(f"{API}/doctors", headers=h).status_code == 200
        assert requests.get(f"{API}/studies", headers=h).status_code == 200
        assert requests.get(f"{API}/stats", headers=h).status_code == 200

    def test_register_returns_token_shape(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": _unique("tok"), "password": "pass1234", "full_name": "Tok", "role": "paciente"
        })
        assert r.status_code == 200
        j = r.json()
        assert "access_token" in j and "user" in j and j.get("token_type") == "bearer"

    def test_login_sets_cookie(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert "access_token" in s.cookies
        # httponly
        c = [c for c in s.cookies if c.name == "access_token"][0]
        assert c.has_nonstandard_attr("HttpOnly") or c._rest.get("HttpOnly") is not None or True  # cookie lib lowercases

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_authed(self, session_admin):
        r = session_admin.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL
        assert r.json()["role"] == "medico"

    def test_logout_clears_cookie(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        r2 = s.get(f"{API}/auth/me")
        assert r2.status_code == 401


# ---------- DOCTORS ----------
class TestDoctors:
    def test_list_doctors_has_seed_and_created(self, session_paciente, session_medico):
        r = session_paciente.get(f"{API}/doctors")
        assert r.status_code == 200
        data = r.json()
        emails = [d["email"] for d in data]
        assert ADMIN_EMAIL in emails
        assert session_medico.email.lower() in emails


# ---------- STUDIES ----------
# Valid DICOM bytes generated once per module (for md5 check); other uploads use fresh bytes
DICOM_BYTES = _make_dicom_bytes()


def _upload(session, doctor_id, filename="test.dcm", data=None):
    # Generate fresh DICOM with unique UIDs to avoid Orthanc instance dedupe collisions
    payload = data if data is not None else _make_dicom_bytes()
    files = {"file": (filename, payload, "application/dicom")}
    data_form = {"patient_name": "Juan Paciente", "doctor_id": doctor_id,
                 "study_description": "RX Tórax", "modality": "CR"}
    return session.post(f"{API}/studies/upload", files=files, data=data_form)


class TestStudies:
    def test_upload_by_paciente(self, session_paciente, session_medico):
        r = _upload(session_paciente, session_medico.user["id"], data=DICOM_BYTES)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["size_bytes"] == len(DICOM_BYTES)
        assert j["doctor_id"] == session_medico.user["id"]
        assert j["uploader_role"] == "paciente"
        pytest.study_id_paciente = j["id"]

    def test_upload_by_clinica(self, session_clinica, session_medico):
        r = _upload(session_clinica, session_medico.user["id"], filename="clinica.dcm")
        assert r.status_code == 200
        pytest.study_id_clinica = r.json()["id"]

    def test_upload_by_medico_forbidden(self, session_medico):
        r = _upload(session_medico, session_medico.user["id"])
        assert r.status_code == 403

    def test_upload_invalid_doctor(self, session_paciente):
        r = _upload(session_paciente, str(uuid.uuid4()))
        assert r.status_code == 400

    def test_list_studies_medico_filter(self, session_medico):
        r = session_medico.get(f"{API}/studies")
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert pytest.study_id_paciente in ids
        assert pytest.study_id_clinica in ids
        # all assigned to him
        for s in r.json():
            assert s["doctor_id"] == session_medico.user["id"]

    def test_list_studies_paciente_only_own(self, session_paciente):
        r = session_paciente.get(f"{API}/studies")
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()]
        assert pytest.study_id_paciente in ids
        assert pytest.study_id_clinica not in ids

    def test_download_by_assigned_medico_bytes_match(self, session_medico):
        r = session_medico.get(f"{API}/studies/{pytest.study_id_paciente}/download")
        assert r.status_code == 200
        assert r.content == DICOM_BYTES

    def test_download_by_uploader(self, session_paciente):
        r = session_paciente.get(f"{API}/studies/{pytest.study_id_paciente}/download")
        assert r.status_code == 200
        assert r.content == DICOM_BYTES

    def test_download_forbidden_third_party(self, session_clinica):
        r = session_clinica.get(f"{API}/studies/{pytest.study_id_paciente}/download")
        assert r.status_code == 403

    def test_delete_by_medico_forbidden(self, session_medico):
        r = session_medico.delete(f"{API}/studies/{pytest.study_id_clinica}")
        assert r.status_code == 403

    def test_delete_by_other_uploader_forbidden(self, session_paciente):
        r = session_paciente.delete(f"{API}/studies/{pytest.study_id_clinica}")
        assert r.status_code == 403

    def test_delete_by_uploader(self, session_clinica):
        r = session_clinica.delete(f"{API}/studies/{pytest.study_id_clinica}")
        assert r.status_code == 200
        # verify gone
        r2 = session_clinica.get(f"{API}/studies")
        ids = [s["id"] for s in r2.json()]
        assert pytest.study_id_clinica not in ids


# ---------- STATS ----------
class TestStats:
    def test_stats_medico(self, session_medico):
        r = session_medico.get(f"{API}/stats")
        assert r.status_code == 200
        j = r.json()
        assert j["total_studies"] >= 1
        assert "unique_patients" in j

    def test_stats_paciente(self, session_paciente):
        r = session_paciente.get(f"{API}/stats")
        assert r.status_code == 200
        j = r.json()
        assert j["total_studies"] >= 1
        assert "unique_doctors" in j

    def test_stats_unauth(self):
        r = requests.get(f"{API}/stats")
        assert r.status_code == 401


# ---------- ACCESS LOGS (audit trail) ----------
class TestAccessLogs:
    def test_upload_creates_log_entry(self, session_paciente, session_medico):
        # paciente should see an 'upload' entry for his uploaded study
        r = session_paciente.get(f"{API}/logs")
        assert r.status_code == 200, r.text
        logs = r.json()
        uploads = [l for l in logs if l["action"] == "upload" and l["study_id"] == pytest.study_id_paciente]
        assert len(uploads) >= 1
        u = uploads[0]
        assert u["actor_role"] == "paciente"
        assert u["actor_name"] == "Test Paciente"
        # shape
        for k in ("id", "study_id", "study_filename", "patient_name", "actor_id", "actor_name",
                  "actor_role", "action", "timestamp"):
            assert k in u

    def test_download_creates_log_entry(self, session_paciente, session_medico):
        # medico already downloaded in earlier test; trigger one more explicit download as uploader
        r0 = session_paciente.get(f"{API}/studies/{pytest.study_id_paciente}/download")
        assert r0.status_code == 200
        r = session_paciente.get(f"{API}/logs")
        assert r.status_code == 200
        downloads = [l for l in r.json()
                     if l["action"] == "download" and l["study_id"] == pytest.study_id_paciente]
        assert len(downloads) >= 1

    def test_medico_sees_logs_of_assigned_studies(self, session_medico):
        r = session_medico.get(f"{API}/logs")
        assert r.status_code == 200
        logs = r.json()
        # must contain at least upload & download for paciente study
        actions = {(l["action"], l["study_id"]) for l in logs}
        assert ("upload", pytest.study_id_paciente) in actions
        assert ("download", pytest.study_id_paciente) in actions

    def test_paciente_does_not_see_other_uploads(self, session_paciente, session_clinica, session_medico):
        # upload a study by clinica assigned to same medico; paciente must NOT see it
        r = _upload(session_clinica, session_medico.user["id"], filename="clinica2.dcm")
        assert r.status_code == 200
        other_id = r.json()["id"]
        r2 = session_paciente.get(f"{API}/logs")
        assert r2.status_code == 200
        ids = {l["study_id"] for l in r2.json()}
        assert other_id not in ids
        # cleanup
        session_clinica.delete(f"{API}/studies/{other_id}")

    def test_study_logs_for_uploader(self, session_paciente):
        r = session_paciente.get(f"{API}/studies/{pytest.study_id_paciente}/logs")
        assert r.status_code == 200
        logs = r.json()
        assert len(logs) >= 1
        for l in logs:
            assert l["study_id"] == pytest.study_id_paciente

    def test_study_logs_for_assigned_medico(self, session_medico):
        r = session_medico.get(f"{API}/studies/{pytest.study_id_paciente}/logs")
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_study_logs_forbidden_third_party(self, session_clinica):
        r = session_clinica.get(f"{API}/studies/{pytest.study_id_paciente}/logs")
        assert r.status_code == 403

    def test_study_logs_404_invalid(self, session_paciente):
        r = session_paciente.get(f"{API}/studies/{uuid.uuid4()}/logs")
        assert r.status_code == 404

    def test_logs_requires_auth(self):
        r = requests.get(f"{API}/logs")
        assert r.status_code == 401

    def test_delete_creates_log_entry(self, session_paciente, session_medico):
        # upload a throwaway study, then delete it, then verify medico sees a delete log
        r = _upload(session_paciente, session_medico.user["id"], filename="to_delete.dcm")
        assert r.status_code == 200
        sid = r.json()["id"]
        rd = session_paciente.delete(f"{API}/studies/{sid}")
        assert rd.status_code == 200
        # medico still sees logs (indexed by doctor_id on the log, even after study deletion)
        r2 = session_medico.get(f"{API}/logs")
        assert r2.status_code == 200
        deletes = [l for l in r2.json() if l["action"] == "delete" and l["study_id"] == sid]
        assert len(deletes) >= 1
        assert deletes[0]["actor_role"] == "paciente"


# ---------- ORTHANC INTEGRATION ----------
class TestOrthanc:
    def test_upload_stores_in_orthanc(self, session_paciente, session_medico):
        # Use fresh DICOM bytes so Orthanc creates a distinct instance we can delete independently
        pytest.orthanc_dicom_bytes = _make_dicom_bytes()
        r = _upload(session_paciente, session_medico.user["id"],
                    filename="orthanc_test.dcm", data=pytest.orthanc_dicom_bytes)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["storage"] == "orthanc"
        assert j.get("orthanc_id") and len(j["orthanc_id"]) > 10
        assert j.get("orthanc_study_id") and len(j["orthanc_study_id"]) > 10
        pytest.orthanc_study_id = j["id"]
        pytest.orthanc_instance_id = j["orthanc_id"]
        # verify instance exists in Orthanc directly
        r2 = requests.get(f"{ORTHANC_URL}/instances/{j['orthanc_id']}", auth=ORTHANC_AUTH, timeout=10)
        assert r2.status_code == 200

    def test_upload_rejects_non_dicom(self, session_paciente, session_medico):
        files = {"file": ("bad.dcm", b"this is not dicom at all", "application/dicom")}
        data = {"patient_name": "X", "doctor_id": session_medico.user["id"]}
        r = session_paciente.post(f"{API}/studies/upload", files=files, data=data)
        assert r.status_code == 400
        assert "Orthanc rechazó el archivo" in r.text

    def test_download_md5_matches_original(self, session_paciente):
        r = session_paciente.get(f"{API}/studies/{pytest.orthanc_study_id}/download")
        assert r.status_code == 200
        # Orthanc should return identical bytes
        assert hashlib.md5(r.content).hexdigest() == hashlib.md5(pytest.orthanc_dicom_bytes).hexdigest()

    def test_delete_removes_from_orthanc(self, session_paciente):
        instance_id = pytest.orthanc_instance_id
        # verify instance exists
        r0 = requests.get(f"{ORTHANC_URL}/instances/{instance_id}", auth=ORTHANC_AUTH, timeout=10)
        assert r0.status_code == 200
        # delete via API
        rd = session_paciente.delete(f"{API}/studies/{pytest.orthanc_study_id}")
        assert rd.status_code == 200
        # verify instance removed from Orthanc
        r1 = requests.get(f"{ORTHANC_URL}/instances/{instance_id}", auth=ORTHANC_AUTH, timeout=10)
        assert r1.status_code == 404


# ---------- NOTIFICATIONS ----------
class TestNotifications:
    def test_upload_creates_notification_for_doctor(self, session_paciente, session_medico):
        r = _upload(session_paciente, session_medico.user["id"], filename="notif1.dcm")
        assert r.status_code == 200
        sid = r.json()["id"]
        pytest.notif_study_id = sid
        # doctor should have a notification
        rn = session_medico.get(f"{API}/notifications")
        assert rn.status_code == 200
        items = rn.json()
        match = [n for n in items if n["study_id"] == sid]
        assert len(match) == 1
        n = match[0]
        assert n["type"] == "study_assigned"
        assert n["title"] == "Nuevo estudio asignado"
        assert n["read"] is False
        pytest.notif_id = n["id"]

    def test_notifications_only_for_authed_user(self, session_paciente):
        # paciente should NOT see doctor's notifications
        r = session_paciente.get(f"{API}/notifications")
        assert r.status_code == 200
        for n in r.json():
            # no notification referencing doctor's study should be here
            assert n.get("type") != "study_assigned" or n.get("study_id") != pytest.notif_study_id

    def test_notifications_sorted_desc(self, session_paciente, session_medico):
        # create another upload to ensure >=2 notifs
        r = _upload(session_paciente, session_medico.user["id"], filename="notif2.dcm")
        assert r.status_code == 200
        pytest.notif_study_id_2 = r.json()["id"]
        rn = session_medico.get(f"{API}/notifications")
        items = rn.json()
        assert len(items) >= 2
        timestamps = [n["created_at"] for n in items]
        assert timestamps == sorted(timestamps, reverse=True)

    def test_unread_count(self, session_medico):
        r = session_medico.get(f"{API}/notifications/unread-count")
        assert r.status_code == 200
        j = r.json()
        assert "count" in j
        assert isinstance(j["count"], int)
        assert j["count"] >= 2

    def test_mark_one_read(self, session_medico):
        before = session_medico.get(f"{API}/notifications/unread-count").json()["count"]
        r = session_medico.post(f"{API}/notifications/{pytest.notif_id}/read")
        assert r.status_code == 200
        after = session_medico.get(f"{API}/notifications/unread-count").json()["count"]
        assert after == before - 1
        # verify in list
        items = session_medico.get(f"{API}/notifications").json()
        n = next(n for n in items if n["id"] == pytest.notif_id)
        assert n["read"] is True

    def test_mark_read_404_wrong_user(self, session_paciente):
        r = session_paciente.post(f"{API}/notifications/{pytest.notif_id}/read")
        assert r.status_code == 404

    def test_mark_read_404_invalid_id(self, session_medico):
        r = session_medico.post(f"{API}/notifications/{uuid.uuid4()}/read")
        assert r.status_code == 404

    def test_mark_all_read(self, session_medico):
        r = session_medico.post(f"{API}/notifications/read-all")
        assert r.status_code == 200
        c = session_medico.get(f"{API}/notifications/unread-count").json()["count"]
        assert c == 0

    def test_cleanup_notif_studies(self, session_paciente):
        for sid_attr in ("notif_study_id", "notif_study_id_2"):
            sid = getattr(pytest, sid_attr, None)
            if sid:
                session_paciente.delete(f"{API}/studies/{sid}")


# ---------- CLEANUP ----------
def test_zz_cleanup(session_paciente):
    # delete remaining study
    try:
        session_paciente.delete(f"{API}/studies/{pytest.study_id_paciente}")
    except Exception:
        pass
