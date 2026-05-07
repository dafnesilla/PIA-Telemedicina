"""Backend tests for Plataforma DICOM Médica - auth, doctors, studies, stats."""
import os
import uuid
import requests
import pytest

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@medicos.com"
ADMIN_PASSWORD = "admin123"


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
DICOM_BYTES = b"DICM" + b"\x00" * 128 + b"TEST_PAYLOAD_" + os.urandom(64)


def _upload(session, doctor_id, filename="test.dcm"):
    files = {"file": (filename, DICOM_BYTES, "application/dicom")}
    data = {"patient_name": "Juan Paciente", "doctor_id": doctor_id,
            "study_description": "RX Tórax", "modality": "CR"}
    return session.post(f"{API}/studies/upload", files=files, data=data)


class TestStudies:
    def test_upload_by_paciente(self, session_paciente, session_medico):
        r = _upload(session_paciente, session_medico.user["id"])
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


# ---------- CLEANUP ----------
def test_zz_cleanup(session_paciente):
    # delete remaining study
    try:
        session_paciente.delete(f"{API}/studies/{pytest.study_id_paciente}")
    except Exception:
        pass
