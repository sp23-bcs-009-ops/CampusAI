# API contracts

`POST /ask` body: `{question, session_id?}`. Header: optional `Authorization: Bearer`. Response: `{answer, intent}`.

Other endpoints: `/health`, student/teacher timetable REST (unchanged). Frontend chat uses Expo `EXPO_PUBLIC_AI_SERVER_URL`. Chat history is AsyncStorage, not Firebase.
