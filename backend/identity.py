"""Verified chat identity.

A Firebase ID token is checked against Google's published signing keys, then the
caller's own Firestore profile is read with that same token. Client-supplied
names and roles are never accepted. If verification fails, the chat stays
anonymous. A service account is not required for this read because Firestore
rules already allow a user to read only their own profile.
"""
from __future__ import annotations

import json
import time
import urllib.parse

import university_data

_CACHE: dict[str, tuple[float, dict | None]] = {}
_CACHE_SECONDS = 300


def class_key_from_profile(profile: dict | None) -> str | None:
    if not profile or profile.get("type") != "student":
        return None
    dept = str(profile.get("dept") or "").strip().lower()
    code = None
    for key, value in university_data.DEPT_CODE.items():
        if dept == key or dept == value.lower():
            code = value
            break
    try:
        semester = int(profile.get("semester"))
    except (TypeError, ValueError):
        return None
    roman = university_data.ROMAN.get(semester)
    if not code or not roman:
        return None
    return f"BS({code})-{roman}"


def teacher_name_from_profile(profile: dict | None) -> str | None:
    if not profile or profile.get("type") != "teacher":
        return None
    import timetable_service as tt

    tt.ensure_timetable()
    wanted = str(profile.get("fullName") or profile.get("name") or "").strip().lower()
    if not wanted:
        return None
    for teacher in tt.ALL_TEACHERS:
        if teacher.strip().lower() == wanted:
            return teacher
    return None


def resolve_identity(id_token: str | None) -> dict | None:
    token = (id_token or "").strip()
    if not token or len(token) > 5000:
        return None
    cached = _CACHE.get(token)
    now = time.time()
    if cached and cached[0] > now:
        return cached[1]
    identity = _resolve_uncached(token)
    _CACHE[token] = (now + _CACHE_SECONDS, identity)
    if len(_CACHE) > 200:
        oldest = min(_CACHE, key=lambda key: _CACHE[key][0])
        _CACHE.pop(oldest, None)
    return identity


def _resolve_uncached(token: str) -> dict | None:
    claims = _tokeninfo(token)
    if not claims:
        return None
    email = str(claims.get("email") or "").strip()
    verified = str(claims.get("email_verified") or "").lower() == "true"
    audience = str(claims.get("aud") or "")
    issuer = str(claims.get("iss") or "")
    project = university_data.project_id()
    if not email or not verified:
        return None
    if audience != project or issuer != f"https://securetoken.google.com/{project}":
        return None
    profile = _read_own_profile(token, email)
    if not isinstance(profile, dict):
        return {"email": email, "verified": True}
    profile["email"] = email
    profile["verified"] = True
    return profile


_JWK_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
_JWK_CLIENT = None


def _tokeninfo(token: str) -> dict | None:
    """Verify a Firebase ID token locally. The token is never put in a URL.

    Google's oauth2 tokeninfo endpoint rejects Firebase securetoken JWTs, so a
    real student sign-in was treated as a guest. The signature is checked with
    Google's published keys. No service account is required.
    """
    if token.count(".") != 2:
        return None
    import jwt

    global _JWK_CLIENT
    try:
        if _JWK_CLIENT is None:
            _JWK_CLIENT = jwt.PyJWKClient(_JWK_URL, cache_keys=True, lifespan=3600)
        key = _JWK_CLIENT.get_signing_key_from_jwt(token).key
        project = university_data.project_id()
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=project,
            issuer=f"https://securetoken.google.com/{project}",
            leeway=300,
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )
    except Exception:
        return None
    return claims if isinstance(claims, dict) else None


def warm_keys() -> None:
    """Download Google's public signing keys before the first login question."""
    global _JWK_CLIENT
    import jwt

    if _JWK_CLIENT is None:
        _JWK_CLIENT = jwt.PyJWKClient(_JWK_URL, cache_keys=True, lifespan=3600)
    _JWK_CLIENT.fetch_data()


def _read_own_profile(token: str, email: str) -> dict | None:
    document_id = email.replace(".", "_")
    url = f"{university_data._base_url()}/users/{urllib.parse.quote(document_id, safe='')}"
    try:
        status, raw = university_data._firebase_bytes(
            "GET",
            url,
            headers={"Authorization": f"Bearer {token}"},
        )
    except university_data.UniversityDataUnavailable:
        return None
    if status != 200:
        return None
    try:
        payload = json.loads(raw.decode())
    except (json.JSONDecodeError, ValueError):
        return None
    fields = payload.get("fields") if isinstance(payload, dict) else None
    if not isinstance(fields, dict):
        return None
    return {key: university_data._unwrap(value) for key, value in fields.items()}
