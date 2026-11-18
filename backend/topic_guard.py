"""
Off-topic guard for the chatbot.

A question is blocked only when it ASKS FOR something outside the campus
(a movie, a song, a recipe, world trivia, homework code...) and nothing in it
points back to the campus. Single words are not enough: "location" is not a
cat, a "cricket tournament on campus" is a campus event, and "who teaches
Physics?" is a timetable question.

    off_topic_category(question)  → "entertainment", "trivia", ... or None
    has_campus_anchor(question)   → True when the question is about the campus

Neither function downloads the timetable or calls a model.
"""
from __future__ import annotations

import re

# What the user is asking for. Each pattern describes a request, not a stray word.
_OFF_TOPIC_INTENTS: dict[str, re.Pattern] = {
    "creative_writing": re.compile(
        r"\b(tell|write|give|share|make|compose|say|recite|sing|create|generate)\b"
        r"(\s+\w+){0,3}?\s+(jokes?|poems?|poetry|story|stories|lyrics|riddles?|shayari|essay)\b"
        r"|^\s*(jokes?|poems?|riddles?)\b"
    ),
    "entertainment": re.compile(
        r"\b(movies?|films?|netflix|web ?series|tv (show|series)|dramas?|anime|cartoons?|"
        r"songs?|music|singers?|albums?|actors?|actress(es)?|celebrit(y|ies)|bollywood|hollywood|"
        r"video ?games?|play (a )?game|tiktok|instagram reels?)\b"
    ),
    "sports_results": re.compile(
        r"\b(world cup|fifa|psl|ipl|premier league|champions league|match (score|result)|"
        r"live score|who won (the )?(match|cup|game)|cricket (score|match|team)|"
        r"football (score|match|team|club))\b"
    ),
    "world_trivia": re.compile(
        r"\b(capital (city )?of|who invented|who discovered|population of|"
        r"(president|prime minister|king|queen|ceo) of (?!(the )?(comsats|cui|university|campus|society|club))|"
        r"(tallest|largest|biggest|longest|smallest) \w+ (in|of) the world|"
        r"how far is the (moon|sun)|black holes?|solar system|planets?)\b"
    ),
    "news_politics_religion": re.compile(
        r"\b(politics|political|elections?|government of|prime minister|stock market|"
        r"bitcoin|crypto(currency)?|dollar rate|gold (price|rate)|share price|religious debate)\b"
    ),
    "weather": re.compile(r"\b(weather|temperature (today|tomorrow|outside)|forecast|will it rain)\b"),
    "food_health_lifestyle": re.compile(
        r"\b(recipes?|how (to|do i) (cook|bake|make (biryani|pizza|tea|coffee))|"
        r"lose weight|gain weight|diet plan|workout plan|skin ?care|hair ?care|"
        r"relationship advice|dating|horoscope|zodiac)\b"
    ),
    "shopping": re.compile(
        r"\b(best (phone|mobile|laptop|car|bike|watch|headphones?)|"
        r"price of (a |an |the )?(phone|mobile|iphone|laptop|car|bike)|buy (a|an) (phone|car|bike|laptop))\b"
    ),
    "animals": re.compile(
        r"\b(cats?|dogs?|animals?|birds?|lions?|tigers?|elephants?|snakes?|horses?|cows?|pets?|wildlife|zoo)\b"
    ),
    "homework_tutoring": re.compile(
        r"\b(write|give|generate|fix|debug)\b(\s+\w+){0,4}?\s+(code|program|script|function|query)\b"
        r"|\b(python|java|javascript|c\+\+|html|css|sql) code\b"
        r"|\bsolve (this|the|my)? ?(equation|integral|problem|question|sum)\b"
        r"|\b(explain|define|teach me|what is|what are|how does)\b.*\b("
        r"quantum|relativity|photosynthesis|gravity|thermodynamics|calculus|integration|"
        r"differentiation|recursion|linked lists?|binary trees?|neural networks?|"
        r"physics|chemistry|biology|mathematics|economics)\b"
    ),
    "translation": re.compile(r"\btranslate\b|\bin (french|spanish|german|chinese|arabic)\b"),
}

# Words that tie a question to the campus. Whole words only, so "classic"
# is not "class" and "location" is not "cat". Day words are left out on purpose:
# "weather today" is still about the weather.
_CAMPUS_ANCHOR = re.compile(
    r"\b(comsats|cui|attock|university|uni|campus|department|dept|hod|dean|rector|registrar|"
    r"faculty|teachers?|teach(es|ing)?|taught|sir|madam|maam|professor|lecturer|instructor|"
    r"dr|mr|ms|miss|"
    r"timetable|schedule|class(es)?|lectures?|semester|subjects?|courses?|credit hours?|"
    r"exams?|midterms?|finals|datesheet|quiz(zes)?|assignments?|"
    r"rooms?|labs?|lt ?\d+|cr ?\d+|"
    r"students?|admissions?|fee|fees|scholarships?|hostel|library|cafeteria|canteen|transport|"
    r"convocation|society|societies|club|events?|seminars?|workshops?|announcements?|"
    r"notifications?|notices?|lost and found|portal|cu online|campusai|cwur|prospectus)\b"
)


def off_topic_category(question: str) -> str | None:
    """The kind of unrelated request the question makes, or None."""
    text = (question or "").lower()
    for category, pattern in _OFF_TOPIC_INTENTS.items():
        if pattern.search(text):
            return category
    return None


def has_campus_anchor(question: str) -> bool:
    return bool(_CAMPUS_ANCHOR.search((question or "").lower()))


def is_creative_request(question: str) -> bool:
    """Jokes, poems and stories are declined even when they mention the campus."""
    return bool(_OFF_TOPIC_INTENTS["creative_writing"].search((question or "").lower()))
