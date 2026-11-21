import pytest

from timetable_upload import timetable_publisher as timetable_upload


class FakeProfileSnapshot:
    exists = True

    def __init__(self, role):
        self.role = role

    def to_dict(self):
        return {"type": self.role}


class FakeProfileDocument:
    def __init__(self, role):
        self.role = role

    def get(self):
        return FakeProfileSnapshot(self.role)


class FakeProfilesCollection:
    def __init__(self, role):
        self.role = role

    def document(self, _document_id):
        return FakeProfileDocument(self.role)


class FakeFirestore:
    def __init__(self, role):
        self.role = role

    def collection(self, _collection_name):
        return FakeProfilesCollection(self.role)


def configure_upload_auth(monkeypatch, role):
    monkeypatch.setattr(timetable_upload, "_firebase_app", lambda: object())
    monkeypatch.setattr(
        timetable_upload.auth,
        "verify_id_token",
        lambda *_args, **_kwargs: {
            "email": "user@cuiatk.edu.pk",
            "email_verified": True,
            "uid": "user-id",
        },
    )
    monkeypatch.setattr(
        timetable_upload.firestore,
        "client",
        lambda **_kwargs: FakeFirestore(role),
    )


def test_staff_can_upload_timetables(monkeypatch):
    configure_upload_auth(monkeypatch, "staff")

    assert timetable_upload.verify_timetable_uploader("verified-token") == {
        "email": "user@cuiatk.edu.pk",
        "role": "staff",
    }


@pytest.mark.parametrize("role", ["teacher", "student"])
def test_non_staff_cannot_upload_timetables(monkeypatch, role):
    configure_upload_auth(monkeypatch, role)

    with pytest.raises(PermissionError, match="Only a registered Staff account"):
        timetable_upload.verify_timetable_uploader("verified-token")


def test_dev_mode_does_not_allow_teacher_timetable_upload(monkeypatch):
    configure_upload_auth(monkeypatch, "teacher")
    monkeypatch.setenv("TIMETABLE_UPLOAD_DEV_MODE", "true")

    with pytest.raises(PermissionError, match="Only a registered Staff account"):
        timetable_upload.verify_timetable_uploader("verified-token")
