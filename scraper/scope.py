"""Geographic contract shared by every collector.

The product is intentionally restricted to the city of Sao Paulo/SP.  The
filter is repeated at the persistence boundary so a source parser cannot leak
out-of-scope records into the platform.
"""

import hashlib
import os
import re
import unicodedata

from sources.base import ScrapedProperty


TARGET_STATE = os.getenv("SCRAPER_TARGET_STATE", "SP").strip().upper()
TARGET_CITY = os.getenv("SCRAPER_TARGET_CITY", "São Paulo").strip()


def normalize_text(value: str | None) -> str:
    ascii_value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_value).strip().casefold()


def is_target_location(state: str | None, city: str | None) -> bool:
    return (state or "").strip().upper() == TARGET_STATE and normalize_text(city) == normalize_text(TARGET_CITY)


def canonical_key(prop: ScrapedProperty) -> str:
    address = normalize_text(prop.address)
    neighborhood = normalize_text(prop.neighborhood)
    property_type = normalize_text(prop.property_type)
    identity = "|".join((TARGET_STATE, normalize_text(TARGET_CITY), address, neighborhood, property_type))
    if not address:
        identity = "|".join((TARGET_STATE, normalize_text(TARGET_CITY), normalize_text(prop.title), property_type))
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


def partition_scope(properties: list[ScrapedProperty]) -> tuple[list[ScrapedProperty], list[ScrapedProperty]]:
    accepted: list[ScrapedProperty] = []
    rejected: list[ScrapedProperty] = []
    for prop in properties:
        (accepted if is_target_location(prop.state, prop.city) else rejected).append(prop)
    return accepted, rejected
