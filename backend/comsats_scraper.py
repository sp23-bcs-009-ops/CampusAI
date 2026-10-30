import json
import re
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


BASE_URL = "https://www.comsats.edu.pk/"
CACHE_PATH = Path(__file__).with_name("comsats_knowledge.json")
USER_AGENT = "CampusAI/1.0 (+local student assistant)"

SEED_URLS = [
    "https://www.comsats.edu.pk/default.aspx",
    "https://www.comsats.edu.pk/about-comsats.aspx",
    "https://www.comsats.edu.pk/campuses.aspx",
    "https://www.comsats.edu.pk/admissions.aspx",
    "https://www.comsats.edu.pk/academic-programs.aspx",
    "https://www.comsats.edu.pk/students.aspx",
]

COMSATS_KEYWORDS = [
    "comsats", "cui", "university", "campus", "campuses", "admission",
    "admissions", "program", "programs", "fee", "fees", "faculty",
    "faculties", "department", "departments", "research", "oric",
    "rector", "registrar", "islamabad", "attock", "lahore", "wah",
    "abbottabad", "sahiwal", "vehari", "virtual", "notice", "notices",
    "job", "jobs", "hiring", "auction",
]

OFFICIAL_CAMPUS_URL = "https://www.comsats.edu.pk/comsats-campuses.aspx"
OFFICIAL_ADMISSIONS_URL = "https://www.comsats.edu.pk/admissions.aspx"
OFFICIAL_PROGRAMS_URL = "https://www.comsats.edu.pk/academic-programs.aspx"
OFFICIAL_STUDENTS_URL = "https://www.comsats.edu.pk/students.aspx"
OFFICIAL_HOME_URL = "https://www.comsats.edu.pk/default.aspx"
OFFICIAL_FACULTIES_URL = "https://www.comsats.edu.pk/faculties-and-departments.aspx"
OFFICIAL_RECTOR_URL = "https://www.comsats.edu.pk/rector-comsats.aspx"
OFFICIAL_ISLAMABAD_ABOUT_URL = "https://www.islamabad.comsats.edu.pk/about-comsats.aspx"

OFFICIAL_CAMPUSES = [
    {"name": "Islamabad", "province": "Islamabad Capital Territory", "address": "Park Road, Tarlai Kalan, Islamabad 45550, Pakistan"},
    {"name": "Lahore", "province": "Punjab", "address": "1.5 KM Defence Road, Off Raiwind Road, Lahore Pakistan"},
    {"name": "Abbottabad", "province": "Khyber Pakhtunkhwa", "address": "University Road, Tobe Camp, Abbottabad"},
    {"name": "Wah", "province": "Punjab", "address": "GT Road, Quaid Avenue, Wah Cantt, Rawalpindi, Punjab"},
    {"name": "Attock", "province": "Punjab", "address": "Near Officers Colony, Kamra Road, Attock"},
    {"name": "Sahiwal", "province": "Punjab", "address": "COMSATS Road, Off GT Road, Sahiwal"},
    {"name": "Vehari", "province": "Punjab", "address": "Mailsi Road, Off Multan Road, Vehari"},
    {"name": "Virtual Campus", "province": "Online", "address": "Listed by COMSATS as its Virtual Campus"},
]


class _TextAndLinksParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self._skip_depth = 0
        self._href = None
        self._link_text = []
        self.text_parts = []
        self.links = []
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag == "title":
            self._in_title = True
        if tag == "a":
            self._href = attrs.get("href")
            self._link_text = []
        if tag in {"p", "div", "li", "br", "h1", "h2", "h3", "h4", "tr"}:
            self.text_parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "svg"} and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if tag == "title":
            self._in_title = False
        if tag == "a" and self._href:
            label = clean_text(" ".join(self._link_text))
            self.links.append((self._href, label))
            self._href = None
            self._link_text = []

    def handle_data(self, data):
        if self._skip_depth:
            return
        if self._in_title:
            self.title += data
        self.text_parts.append(data)
        if self._href:
            self._link_text.append(data)


def clean_text(text):
    text = re.sub(r"\s+", " ", text or "")
    return text.strip()


def _fetch(url, timeout=15):
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=timeout) as res:
        charset = res.headers.get_content_charset() or "utf-8"
        return res.read().decode(charset, errors="replace")


def _same_site_url(href, current_url):
    if not href:
        return None
    absolute = urljoin(current_url, href.split("#", 1)[0])
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"}:
        return None
    if parsed.netloc.lower() not in {"www.comsats.edu.pk", "comsats.edu.pk"}:
        return None
    if parsed.path and not parsed.path.lower().endswith((".aspx", "/")):
        return None
    return absolute


def _parse_page(url, html):
    parser = _TextAndLinksParser()
    parser.feed(html)
    title = clean_text(parser.title) or url
    text = clean_text(" ".join(parser.text_parts))
    links = []
    for href, label in parser.links:
        absolute = _same_site_url(href, url)
        if absolute and label:
            links.append({"url": absolute, "label": label[:120]})
    return {"url": url, "title": title, "text": text, "links": links}


def _chunk_page(page, chunk_size=900, overlap=120):
    words = page["text"].split()
    chunks = []
    if not words:
        return chunks
    step = max(1, chunk_size - overlap)
    for i in range(0, len(words), step):
        chunk_words = words[i:i + chunk_size]
        if len(chunk_words) < 25:
            continue
        chunks.append({
            "title": page["title"],
            "url": page["url"],
            "text": " ".join(chunk_words),
        })
    return chunks


def refresh_comsats_knowledge(max_pages=20):
    seen = set()
    queue = list(SEED_URLS)
    pages = []
    errors = []

    while queue and len(pages) < max_pages:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            page = _parse_page(url, _fetch(url))
            if len(page["text"]) > 200:
                pages.append(page)
            for link in page["links"]:
                if len(queue) + len(seen) >= max_pages * 3:
                    break
                label = link["label"].lower()
                if any(k in label for k in COMSATS_KEYWORDS) and link["url"] not in seen:
                    queue.append(link["url"])
        except Exception as exc:
            errors.append({"url": url, "error": str(exc)[:200]})

    chunks = []
    for page in pages:
        chunks.extend(_chunk_page(page))

    payload = {
        "source": BASE_URL,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "page_count": len(pages),
        "chunk_count": len(chunks),
        "pages": [{"title": p["title"], "url": p["url"]} for p in pages],
        "chunks": chunks,
        "errors": errors,
    }
    CACHE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def load_comsats_knowledge():
    if not CACHE_PATH.exists():
        return {"chunks": [], "page_count": 0, "chunk_count": 0, "updated_at": None}
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"chunks": [], "page_count": 0, "chunk_count": 0, "updated_at": None}


def is_comsats_question(text):
    t = (text or "").lower()
    words = set(re.findall(r"[a-z0-9]+", t))
    if "comsats" in words or "cui" in words:
        return True
    return any(k in words for k in COMSATS_KEYWORDS if " " not in k)


def _question_terms(question):
    return [
        w for w in re.findall(r"[a-z0-9]+", question.lower())
        if len(w) > 2 and w not in {
            "the", "and", "for", "with", "about", "what", "tell", "does",
            "have", "can", "you", "give", "show", "list", "page", "source",
            "url", "info", "information", "comsats", "university", "cui",
        }
    ]


def search_comsats_knowledge(question, limit=4):
    data = load_comsats_knowledge()
    chunks = data.get("chunks", [])
    if not chunks:
        return []

    terms = _question_terms(question)
    scored = []
    for chunk in chunks:
        title = chunk.get("title", "").lower()
        url = chunk.get("url", "").lower()
        text = chunk.get("text", "").lower()
        haystack = f"{title} {url} {text}"
        score = sum(text.count(term) for term in terms)
        score += sum(6 for term in terms if term in title)
        score += sum(4 for term in terms if term in url)
        if "campus" in terms or "campuses" in terms:
            if "campuses" in title or "comsats-campuses" in url:
                score += 25
        if "admission" in terms or "admissions" in terms:
            if "admission" in title or "admissions" in url:
                score += 25
        if "program" in terms or "programs" in terms:
            if "program" in title or "academic-program" in url:
                score += 25
        if "student" in terms or "students" in terms:
            if "student" in title or "students" in url:
                score += 25
        if any(term in terms for term in ["notice", "notices", "job", "jobs", "hiring", "auction", "faculty", "research"]):
            if any(term in title or term in url for term in terms):
                score += 20
        if "comsats" in haystack or "cui" in haystack:
            score += 1
        if score:
            scored.append((score, chunk))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [chunk for _, chunk in scored[:limit]]


def build_comsats_context(chunks):
    lines = []
    for idx, chunk in enumerate(chunks, start=1):
        text = chunk["text"][:1200]
        lines.append(f"Source {idx}: {chunk['title']}\nURL: {chunk['url']}\n{text}")
    return "\n\n".join(lines)


def _campus_list(include_source=True):
    names = ", ".join(c["name"] for c in OFFICIAL_CAMPUSES)
    suffix = f"\nSource: {OFFICIAL_CAMPUS_URL}" if include_source else ""
    return f"COMSATS University Islamabad campuses are: {names}.{suffix}"


def _matching_notice_links(question, limit=8):
    q = question.lower()
    if "visiting faculty" in q:
        terms = ["visiting", "faculty"]
    elif "research associate" in q:
        terms = ["research", "associate"]
    elif "auction" in q:
        terms = ["auction"]
    elif "hiring" in q or "job" in q or "jobs" in q:
        terms = ["hiring"]
    else:
        terms = [t for t in _question_terms(question) if t not in {"publish", "notice", "notices"}]
    try:
        page = _parse_page(BASE_URL, _fetch(BASE_URL, timeout=12))
    except Exception:
        return []
    matches = []
    seen = set()
    for link in page.get("links") or []:
        title = link.get("label") or ""
        url = link.get("url") or ""
        haystack = f"{title} {url}".lower()
        if terms and all(term in haystack for term in terms) and url not in seen:
            matches.append({"title": title or "COMSATS page", "url": url})
            seen.add(url)
        if len(matches) >= limit:
            break
    return matches[:limit]


class WebsiteUnavailable(RuntimeError):
    """Official COMSATS pages could not be read. This content is not in Firebase."""


def _urls_for_question(question: str) -> list[str]:
    q = (question or "").lower()
    urls = []
    if any(word in q for word in ("campus", "campuses")):
        urls.append(OFFICIAL_CAMPUS_URL)
    if any(word in q for word in ("admission", "admissions", "apply", "fee", "fees", "scholarship")):
        urls.append(OFFICIAL_ADMISSIONS_URL)
    if any(word in q for word in ("program", "programs", "bscs", "computer science")):
        urls.append(OFFICIAL_PROGRAMS_URL)
    if any(word in q for word in ("student", "students")):
        urls.append(OFFICIAL_STUDENTS_URL)
    if any(word in q for word in ("faculty", "faculties", "department", "departments")):
        urls.append(OFFICIAL_FACULTIES_URL)
    if "rector" in q:
        urls.append(OFFICIAL_RECTOR_URL)
    if not urls:
        urls = [OFFICIAL_HOME_URL, OFFICIAL_CAMPUS_URL, OFFICIAL_ADMISSIONS_URL]
    seen = []
    for url in urls:
        if url not in seen:
            seen.append(url)
    return seen


def fetch_official_pages(question: str, max_pages: int = 3) -> list[dict]:
    """Read live official COMSATS pages. Never uses the local JSON cache."""
    pages = []
    for url in _urls_for_question(question)[:max_pages]:
        try:
            pages.append(_parse_page(url, _fetch(url, timeout=12)))
        except Exception:
            continue
    if not pages:
        raise WebsiteUnavailable(
            "Official COMSATS website information is unavailable right now. "
            "This content is not stored in Firebase."
        )
    return pages


def probe_official_site(max_pages: int = 6) -> dict:
    """Reachability check for admin endpoints. Does not write local files."""
    pages = []
    errors = []
    for url in SEED_URLS[:max(1, min(max_pages, 20))]:
        try:
            page = _parse_page(url, _fetch(url, timeout=12))
            pages.append({"title": page["title"], "url": page["url"]})
        except Exception as exc:
            errors.append({"url": url, "error": str(exc)[:200]})
    return {
        "source": BASE_URL,
        "storage": "live official website; not stored in Firebase",
        "page_count": len(pages),
        "pages": pages,
        "errors": errors,
    }


def get_comsats_direct_answer(question):
    q = (question or "").lower()

    if "how many" in q and ("cache" in q or "pages" in q):
        return (
            "COMSATS website answers are fetched from the official site. "
            "They are not stored in Firebase or a local cache.\n"
            f"Source: {BASE_URL}"
        )

    if "last updated" in q or "knowledge updated" in q:
        return (
            "COMSATS website answers are fetched live from the official site, "
            "not from a stored knowledge cache.\n"
            f"Source: {BASE_URL}"
        )

    if "what pages" in q and "scraped" in q:
        lines = [f"- {url}" for url in SEED_URLS]
        return "COMSATS answers use these official pages when needed:\n" + "\n".join(lines)

    if "knowledge source" in q or "official source" in q or "official sources" in q:
        return f"COMSATS answers use the official COMSATS website. This content is not stored in Firebase.\nSource: {BASE_URL}"

    if "can you answer" in q and "official" in q:
        return f"Yes. For COMSATS questions, I answer from the official COMSATS website.\nSource: {BASE_URL}"

    if "history" in q and ("comsats" in q or "university" in q):
        return (
            "COMSATS University Islamabad (CUI) is a multi-campus higher education institution in Pakistan. "
            "Official pages describe CUI as being awarded its charter by the Government of Pakistan in 2000.\n"
            f"Source: {OFFICIAL_HOME_URL}"
        )

    if "what is comsats university" in q or "tell me about comsats university" in q or "summary of comsats" in q:
        return (
            "COMSATS University Islamabad (CUI) is a multi-campus higher education institution in Pakistan. "
            "Its listed campuses include Islamabad, Lahore, Abbottabad, Wah, Attock, Sahiwal, Vehari, and Virtual Campus.\n"
            f"Sources: {OFFICIAL_HOME_URL} and {OFFICIAL_CAMPUS_URL}"
        )

    if "what does cui stand for" in q or "cui stand for" in q:
        return f"CUI stands for COMSATS University Islamabad.\nSource: {OFFICIAL_HOME_URL}"

    if "established" in q or "when was comsats" in q:
        return (
            "Official COMSATS pages describe CUI as being awarded its charter by the Government of Pakistan in 2000. "
            "They do not list a separate founding date.\n"
            f"Source: {OFFICIAL_HOME_URL}"
        )

    if "public university" in q or "public or private" in q:
        return (
            "Official COMSATS pages checked here do not contain a clear line stating whether COMSATS is public or private. "
            "I should not guess beyond those pages.\n"
            f"Source checked: {BASE_URL}"
        )

    if "what kind of university" in q:
        return (
            "COMSATS University Islamabad is described on official pages as a quality institution of higher learning with eight listed campuses.\n"
            f"Sources: {OFFICIAL_HOME_URL} and {OFFICIAL_CAMPUS_URL}"
        )

    if "source url" in q or "source link" in q:
        if "admission" in q:
            return f"COMSATS admissions source URL: {OFFICIAL_ADMISSIONS_URL}"
        if "program" in q or "academic" in q:
            return f"COMSATS academic programs source URL: {OFFICIAL_PROGRAMS_URL}"
        if "student" in q:
            return f"COMSATS students source URL: {OFFICIAL_STUDENTS_URL}"
        if "campus" in q or "campuses" in q:
            return f"COMSATS campus information source URL: {OFFICIAL_CAMPUS_URL}"

    if "khyber pakhtunkhwa" in q or "kpk" in q:
        return f"Yes. COMSATS has an Abbottabad campus in Khyber Pakhtunkhwa.\nSource: {OFFICIAL_CAMPUS_URL}"

    if "punjab" in q and "campus" in q:
        punjab = ", ".join(c["name"] for c in OFFICIAL_CAMPUSES if c["province"] == "Punjab")
        return f"COMSATS campuses in Punjab include: {punjab}.\nSource: {OFFICIAL_CAMPUS_URL}"

    if "outside islamabad" in q and "campus" in q:
        outside = ", ".join(c["name"] for c in OFFICIAL_CAMPUSES if c["name"] != "Islamabad")
        return f"COMSATS campuses outside Islamabad are: {outside}.\nSource: {OFFICIAL_CAMPUS_URL}"

    if "how many" in q and "campus" in q:
        return f"COMSATS has {len(OFFICIAL_CAMPUSES)} listed campuses including the Virtual Campus.\nSource: {OFFICIAL_CAMPUS_URL}"

    if ("list" in q and "campus" in q) or "which campuses" in q or "campuses does comsats have" in q:
        return _campus_list()

    if "director" in q and "islamabad" in q:
        return f"The Islamabad Campus InCharge listed on the official Islamabad campus page is Professor Sohail Asghar.\nSource: {OFFICIAL_ISLAMABAD_ABOUT_URL}"

    for campus in OFFICIAL_CAMPUSES:
        name = campus["name"].lower().replace(" campus", "")
        if name in q and "campus" in q:
            if campus["name"] == "Virtual Campus":
                return f"COMSATS lists a Virtual Campus as one of its campuses.\nSource: {OFFICIAL_CAMPUS_URL}"
            return f"COMSATS {campus['name']} Campus is listed at {campus['address']}.\nSource: {OFFICIAL_CAMPUS_URL}"

    if any(word in q for word in ["notice", "notices", "job", "hiring", "auction", "visiting faculty", "research associate"]):
        matches = _matching_notice_links(question)
        if matches:
            lines = [f"- {m.get('title')}: {m.get('url')}" for m in matches]
            return "Yes. I found these relevant COMSATS official notice links:\n" + "\n".join(lines)
        return (
            "I could not find a matching notice on the official COMSATS website, "
            "and notices are not stored in Firebase.\n"
            f"Source: {BASE_URL}"
        )

    if "rector" in q:
        return f"The Rector of COMSATS University Islamabad is Prof. Dr. Raheel Qamar.\nSource: {OFFICIAL_RECTOR_URL}"

    if "fee" in q or "fees" in q or "tuition" in q:
        return f"COMSATS lists fee information under its admissions resources. Check the official fee structure/admissions page for current amounts.\nSource: {OFFICIAL_ADMISSIONS_URL}"

    if "scholarship" in q or "scholarships" in q:
        return f"COMSATS student/admissions resources include student support information; check the official students and admissions pages for scholarship details.\nSources: {OFFICIAL_STUDENTS_URL} and {OFFICIAL_ADMISSIONS_URL}"

    if "facult" in q:
        return (
            "COMSATS lists these faculties: Information Science & Technology, Business Administration, Engineering, Science, Architecture & Design, and Health Sciences.\n"
            f"Source: {OFFICIAL_FACULTIES_URL}"
        )

    if "department" in q or "departments" in q:
        return (
            "COMSATS lists faculties and departments on its official Faculties and Departments page, including Computer Science, Management Sciences, Engineering departments, Mathematics, Physics, Chemistry, and others.\n"
            f"Source: {OFFICIAL_FACULTIES_URL}"
        )

    if "bscs" in q or "bs cs" in q or "computer science" in q:
        return (
            "COMSATS provides official campus-wise academic program details on its Academic Programs page. "
            "Use that page to confirm BS Computer Science availability for the campus you need.\n"
            f"Source: {OFFICIAL_PROGRAMS_URL}"
        )

    if "how to apply" in q or "apply to comsats" in q:
        return (
            "To apply to COMSATS University Islamabad, use the official admissions page for the current application process and links for Pakistani or international applicants.\n"
            f"Source: {OFFICIAL_ADMISSIONS_URL}"
        )

    if "admission" in q or "admissions" in q:
        return (
            "COMSATS has official admissions pages for admission information, including international and Pakistani student admissions.\n"
            f"Sources: {OFFICIAL_ADMISSIONS_URL} and https://www.comsats.edu.pk/comsats-admissions.aspx"
        )

    if "academic program" in q or "academic programs" in q or "programs" in q:
        return (
            "COMSATS provides academic program information on its official Academic Programs page. "
            "For exact program names and campus-wise details, check the official page.\n"
            f"Source: {OFFICIAL_PROGRAMS_URL}"
        )

    if "students page" in q or "students section" in q or "student information" in q:
        return f"COMSATS has a Students page for student-related information.\nSource: {OFFICIAL_STUDENTS_URL}"

    return None
