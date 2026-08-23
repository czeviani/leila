"""
Descoberta e coleta de documentos oficiais de um imóvel (edital, matrícula,
laudo de avaliação) — expostos ao backend Node via POST /documents/discover e
POST /documents/fetch (ver main.py).

Diferente da coleta em lote (source.scrape()), roda sob demanda: só quando o
usuário clica em "Ler condições oficiais" para UM imóvel específico. Por isso
pode pagar o custo de uma sessão dedicada por chamada (aquecimento de cookies
contra o WAF da Caixa) sem impacto na coleta em massa de 26 mil imóveis.

Antes disto, nenhuma fonte coletava matrícula ou laudo: Caixa/Mega/Zuk só
guardavam a página HTML de anúncio (edital_url), e o Superbid pegava
arbitrariamente o primeiro PDF da lista de anexos e descartava o resto.
"""
import base64
import hashlib
import json
import os
import re
from typing import Any, Optional
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession

from proxy.manager import get_proxy

# Mesmo teto de tamanho aceito pela Messages API para blocos "document".
MAX_DOCUMENT_BYTES = 32 * 1024 * 1024

CAIXA_WARMUP_URL = "https://venda-imoveis.caixa.gov.br/sistema/login-site.asp"

# Sem PROXY_ROTATION configurado na VPS, todo request direto a caixa.gov.br
# volta 403 (WAF bloqueia IP não-BR). r.jina.ai roda de infraestrutura própria
# e fura esse bloqueio — testado manualmente em 2026-08-23: página, HTML cru
# (via X-Return-Format: html) e PDF do edital vieram 200; só a matrícula
# (certidão digital com fonte protegida) volta ilegível, ver fetch_document_bytes.
# Quando LEILA_PROXY_LIST for configurado aqui, o caminho direto volta a
# funcionar e este fallback deixa de ser exercitado — mantido como rede de
# segurança, não removido.
READER_BASE_URL = os.getenv("DOCUMENT_READER_BASE_URL", "https://r.jina.ai").rstrip("/")
_READER_FALLBACK_HOSTS = ("caixa.gov.br",)

# Presente em toda página de imóvel da Caixa, não é documento do imóvel.
_BOILERPLATE_URL_SUFFIXES = ("/editais/regras-vol/comocomprar.pdf",)


def _needs_reader_fallback(url: str) -> bool:
    return any(host in url for host in _READER_FALLBACK_HOSTS)


async def _fetch_via_reader(url: str, *, as_html: bool = False) -> Optional[str]:
    """Busca uma URL através do leitor externo — usa a infra dele, não a
    nossa, para furar o WAF. as_html=True pede o HTML cru (preserva
    onclick="ExibeDoc(...)"); em markdown esses links de documento colapsam
    em texto puro e ficam inutilizáveis para _extract_document_links."""
    headers = {"Accept": "text/plain", "User-Agent": "LeilaRadar/1.0"}
    if as_html:
        headers["X-Return-Format"] = "html"
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(f"{READER_BASE_URL}/{url}", headers=headers)
            response.raise_for_status()
            return response.text
    except Exception as error:
        print(f"[documents] Falha ao buscar via leitor externo {url}: {error}")
        return None

DocumentType = str  # 'edital' | 'matricula' | 'laudo' | 'errata' | 'certificate' | 'attachment' | 'unknown'

# Ordem importa: termos mais específicos primeiro, para não classificar uma
# "errata do edital" como edital genérico, por exemplo.
_TYPE_KEYWORDS: list[tuple[str, DocumentType]] = [
    (r"matr[ií]cula", "matricula"),
    (r"laudo", "laudo"),
    (r"avalia[cç][aã]o", "laudo"),
    (r"errata", "errata"),
    (r"certid[aã]o", "certificate"),
    (r"edital", "edital"),
    (r"regras?\s+de\s+venda", "edital"),
]


def classify_document(url: str, label: Optional[str] = None) -> DocumentType:
    haystack = f"{label or ''} {url}".lower()
    for pattern, doc_type in _TYPE_KEYWORDS:
        if re.search(pattern, haystack):
            return doc_type
    if url.lower().endswith(".pdf"):
        return "attachment"
    return "unknown"


_EXIBEDOC_RE = re.compile(r"""ExibeDoc\(\s*['"]([^'"]+)['"]""")


def _extract_document_links(html: str, base_url: str) -> list[dict]:
    """Varre <a href> por anexos prováveis — PDF/DOC, ou texto de âncora que
    nomeia edital/matrícula/laudo mesmo sem extensão explícita na URL. Também
    entende o padrão da Caixa onclick="javascript:ExibeDoc('/editais/...pdf')",
    que usa href="#" e por isso nunca aparece num <a href> de verdade."""
    soup = BeautifulSoup(html, "html.parser")
    documents: list[dict] = []
    seen: set[str] = set()

    def add(absolute: str, label: Optional[str]):
        if absolute in seen:
            return
        if absolute.lower().split("?")[0].endswith(_BOILERPLATE_URL_SUFFIXES):
            return
        seen.add(absolute)
        documents.append({
            "url": absolute,
            "type": classify_document(absolute, label),
            "label": label,
            "content_type": "application/pdf" if absolute.lower().split("?")[0].endswith(".pdf") else None,
        })

    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        label = anchor.get_text(" ", strip=True) or None
        onclick = anchor.get("onclick") or ""
        exibedoc = _EXIBEDOC_RE.search(onclick)
        if exibedoc:
            add(urljoin(base_url, exibedoc.group(1)), label)
            continue
        if not href or href.startswith("#") or href.lower().startswith("javascript:"):
            continue
        absolute = urljoin(base_url, href)
        is_file = absolute.lower().split("?")[0].endswith((".pdf", ".doc", ".docx"))
        mentions_document = bool(re.search(
            r"matr[ií]cula|laudo|edital|avalia[cç][aã]o|errata|certid[aã]o|regras?\s+de\s+venda",
            f"{label or ''} {href}".lower(),
        ))
        if is_file or mentions_document:
            add(absolute, label)
    return documents


def _find_attachment_lists(node: Any) -> list[dict]:
    """Busca recursiva por listas de anexos dentro do JSON __NEXT_DATA__ da
    Superbid/Sold — evita depender de um caminho fixo (props.pageProps.offer
    vs. offersList), que difere entre a página de catálogo e a de detalhe do
    lote, e que nunca foi documentado. Antes disto, o scraper pegava só o
    primeiro PDF de attachments (next(...) em superbid.py) e descartava o resto —
    tipicamente a matrícula e o laudo, ficando só com o edital (ou pior, com
    qualquer um desses três ao acaso, já que a ordem da lista não é garantida)."""
    found: list[dict] = []
    if isinstance(node, dict):
        attachments = node.get("attachments")
        if isinstance(attachments, list) and attachments and all(
            isinstance(item, dict) and item.get("link") for item in attachments
        ):
            found.extend(attachments)
        for value in node.values():
            found.extend(_find_attachment_lists(value))
    elif isinstance(node, list):
        for item in node:
            found.extend(_find_attachment_lists(item))
    return found


def _extract_next_data_attachments(html: str) -> list[dict]:
    """Anexos publicados via __NEXT_DATA__ (Superbid/Sold) — não são <a href>,
    são dados embutidos num <script> JSON, então _extract_document_links não os vê."""
    soup = BeautifulSoup(html, "html.parser")
    script = soup.select_one("script#__NEXT_DATA__")
    if not script or not script.string:
        return []
    try:
        data = json.loads(script.string)
    except (json.JSONDecodeError, TypeError):
        return []

    documents: list[dict] = []
    seen: set[str] = set()
    for item in _find_attachment_lists(data):
        link = item.get("link")
        if not link or link in seen:
            continue
        seen.add(link)
        label = item.get("name") or item.get("title") or item.get("description") or item.get("fileName")
        documents.append({
            "url": link,
            "type": classify_document(link, label),
            "label": label,
            "content_type": item.get("contentType"),
        })
    return documents


async def _fetch_html(url: str, *, warm_up_caixa: bool = False) -> Optional[str]:
    """Busca uma página HTML com o mesmo fingerprint/proxy usado na coleta em lote.
    Sem proxy BR configurado, a Caixa devolve 403 aqui — cai no leitor externo,
    pedindo HTML cru para preservar os onclick="ExibeDoc(...)" dos documentos."""
    async with AsyncSession(impersonate="chrome120") as session:
        try:
            if warm_up_caixa:
                await session.get(CAIXA_WARMUP_URL, timeout=15, proxy=get_proxy())
            response = await session.get(url, timeout=30, proxy=get_proxy())
            response.raise_for_status()
            return response.text
        except Exception as error:
            print(f"[documents] Falha ao buscar HTML de {url}: {error}")
            if _needs_reader_fallback(url):
                return await _fetch_via_reader(url, as_html=True)
            return None


async def discover_documents(source_id: str, listing_url: str, event_url: Optional[str] = None) -> dict:
    """Retorna {"documents": [...], "listing_text": str|None} para a página de
    anúncio de um imóvel. listing_text serve de fallback quando nenhum anexo
    é encontrado — evita uma segunda chamada de rede pelo backend.

    `event_url` é usado pela Mega Leilões: o edital do certame vive na página
    do EVENTO (leilão), não na página do lote — o scraper já captura essa URL
    em raw_data.event_url durante a coleta em lote, mas antes disto ela nunca
    era seguida."""
    is_caixa = "caixa.gov.br" in listing_url
    html = await _fetch_html(listing_url, warm_up_caixa=is_caixa)
    if html is None:
        return {"documents": [], "listing_text": None}

    documents = _extract_document_links(html, listing_url)
    if source_id in ("superbid", "sold"):
        documents.extend(_extract_next_data_attachments(html))

    if event_url:
        event_html = await _fetch_html(event_url)
        if event_html:
            documents.extend(_extract_document_links(event_html, event_url))

    listing_text = BeautifulSoup(html, "html.parser").get_text("\n", strip=True)

    unique: dict[str, dict] = {}
    for doc in documents:
        unique.setdefault(doc["url"], doc)

    return {"documents": list(unique.values()), "listing_text": listing_text[:80_000] if listing_text else None}


async def fetch_document_bytes(url: str) -> Optional[dict]:
    """Baixa um documento (tipicamente PDF) e devolve em base64 para o backend
    Node repassar como bloco `document` nativo à Messages API. Sem proxy BR,
    cai no leitor externo para hosts que bloqueiam — nesse caso o resultado é
    texto extraído (markdown), não o PDF binário original, sinalizado por
    content_type='text/plain' e via='reader'."""
    is_caixa = "caixa.gov.br" in url
    async with AsyncSession(impersonate="chrome120") as session:
        try:
            if is_caixa:
                await session.get(CAIXA_WARMUP_URL, timeout=15, proxy=get_proxy())
            response = await session.get(url, timeout=45, proxy=get_proxy())
            response.raise_for_status()
        except Exception as error:
            print(f"[documents] Falha ao baixar {url}: {error}")
            if _needs_reader_fallback(url):
                return await _fetch_document_via_reader(url)
            return None

    content = response.content
    if len(content) > MAX_DOCUMENT_BYTES:
        print(f"[documents] {url} tem {len(content)} bytes, acima do limite de {MAX_DOCUMENT_BYTES} — descartado")
        return None

    content_type = (response.headers.get("content-type") or "").split(";")[0].strip()
    if not content_type:
        content_type = "application/pdf" if url.lower().split("?")[0].endswith(".pdf") else "text/html"

    return {
        "content_base64": base64.b64encode(content).decode("ascii"),
        "content_type": content_type,
        "bytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "via": "direct",
    }


async def _fetch_document_via_reader(url: str) -> Optional[dict]:
    text = await _fetch_via_reader(url, as_html=False)
    if not text or not text.strip():
        return None
    content = text.encode("utf-8")
    if len(content) > MAX_DOCUMENT_BYTES:
        content = content[:MAX_DOCUMENT_BYTES]
    return {
        "content_base64": base64.b64encode(content).decode("ascii"),
        "content_type": "text/plain",
        "bytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "via": "reader",
    }
