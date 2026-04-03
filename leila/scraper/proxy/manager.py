"""
Proxy Manager — gerencia rotação de proxies brasileiros.

Formato da variável PROXY_LIST (env):
  ip1:port1:user1:pass1,ip2:port2:user2:pass2,...

Se PROXY_LIST não estiver configurada ou PROXY_ROTATION=false,
usa conexão direta (útil para dev local).
"""

import os
import random
from typing import Optional


def _parse_proxies() -> list[dict]:
    raw = os.getenv("PROXY_LIST", "").strip()
    if not raw:
        return []

    proxies = []
    for entry in raw.split(","):
        parts = entry.strip().split(":")
        if len(parts) == 4:
            ip, port, user, password = parts
            proxies.append({
                "http://":  f"http://{user}:{password}@{ip}:{port}",
                "https://": f"http://{user}:{password}@{ip}:{port}",
            })
        elif len(parts) == 2:
            ip, port = parts
            proxies.append({
                "http://":  f"http://{ip}:{port}",
                "https://": f"http://{ip}:{port}",
            })
    return proxies


_PROXIES = _parse_proxies()
_ROTATION_ENABLED = os.getenv("PROXY_ROTATION", "false").lower() == "true"


def get_proxy() -> Optional[dict]:
    """Retorna um proxy aleatório da lista, ou None se rotação desativada."""
    if not _ROTATION_ENABLED or not _PROXIES:
        return None
    return random.choice(_PROXIES)


def proxy_count() -> int:
    return len(_PROXIES)
