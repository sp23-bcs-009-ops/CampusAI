# Identity and permissions

Firebase RS256 JWT, aud/iss `universityassistentai`, `email_verified`, leeway 300s. Profile via Firestore REST with Authorization header (token not in URL). Student class key `BS({dept})-{roman}` from trusted profile. Request JSON `role` is ignored (`test_ask_api`). Guest public only. Notifications class-scoped. Teacher/staff personal schedule rules unchanged.
