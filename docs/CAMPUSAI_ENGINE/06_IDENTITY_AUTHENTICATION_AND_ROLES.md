# Identity, authentication, and roles

**Status:** Implemented and verified in unit tests. Live Student browser was verified in an earlier session, not repeated here.

- Tokens: Firebase RS256 JWT via Google JWK (`identity._tokeninfo` / PyJWKClient). `aud`/`iss` must match `universityassistentai`. `email_verified` required. Leeway 300s.
- Profile: `users/{email with dots as _}` using the same bearer. No admin SDK.
- Client `role` / `user_id` in JSON is ignored (`test_ask_verifies_the_bearer_token_and_ignores_a_json_role`).
- Guest: no token or failed verify → `identity is None`.
- Student/Teacher/Staff: `profile.type` from Firestore.
- Permissions: students get class key from dept+semester; teachers match timetable name; staff get no personal class.
- No credentials in this document.
