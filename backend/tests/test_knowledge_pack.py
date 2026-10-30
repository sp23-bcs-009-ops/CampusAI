"""Approved Attock website knowledge pack retrieval."""
from knowledge_pack import format_pack_context, pack_status, search_pack
from pipeline import SessionMemory, route


def test_pack_loads_usable_documents():
    status = pack_status()
    assert status["document_count"] == 34
    assert status["dataset_id"] == "comsats_attock_official_seed_2026_10_24"


def test_limitation_note_is_not_retrieved_as_a_fact():
    hits = search_pack("attock homepage 403 scraping limitation")
    assert all(item.get("id") != "website_access_limitation" for item in hits)


def test_campus_list_comes_from_the_pack():
    hits = search_pack("which campuses does COMSATS have?")
    assert hits
    assert hits[0]["id"] == "university_campuses"


def test_archived_events_are_not_used_as_upcoming():
    upcoming = search_pack("what upcoming campus events are happening")
    assert all(item.get("category") != "event_archive" for item in upcoming)

    historical = search_pack("when was the silver jubilee at Attock")
    assert any(item.get("id") == "campus_event_silver_jubilee" for item in historical)
    context = format_pack_context(historical)
    assert "HISTORICAL ARCHIVE" in context


def test_department_question_includes_management_sciences():
    hits = search_pack("what departments are at Attock campus?")
    ids = {item.get("id") for item in hits}
    assert "management_sciences_department" in ids
    assert "department_index_attock" in ids


def test_cu_online_and_cwur_are_retrieved():
    online = search_pack("tell me about CU Online")
    assert online[0]["id"] == "student_academic_portals"
    cwur = search_pack("what is the CWUR 2026 ranking news?")
    assert cwur[0]["id"] == "university_news_cwur_2026"


def test_website_questions_still_route_to_comsats_info():
    memory = SessionMemory()
    assert route("tell me about COMSATS campuses", memory).intent == "comsats_info"
    assert route("who is the rector of COMSATS?", memory).intent == "comsats_info"
