"""
Leila — IA Micro-Enrichment (Camada 2)

Processa em batch as propriedades onde a heurística não conseguiu extrair
campos-chave (bedrooms IS NULL), usando claude-haiku para extração estruturada.

Estratégia de custo:
- Batches de 25 descrições por chamada
- ~6k input + ~2.5k output tokens por batch ≈ $0.015/batch (Haiku)
- 500 propriedades novas ≈ $0.30 por rodada de scrape
- Só processa properties sem ai_enriched_at (zero reprocessamento)
"""

import json
import os
import re
from datetime import datetime, timezone
from typing import Optional

import anthropic
from supabase import Client

HAIKU_MODEL = "claude-haiku-4-5-20251001"
BATCH_SIZE = 25
MAX_PROPERTIES = 500  # limite por rodada para controle de custo

_PROMPT_SYSTEM = """Você é um extrator de dados estruturados de descrições de imóveis brasileiros.
Retorne APENAS um JSON array válido, sem markdown, sem explicações."""

_PROMPT_USER_TEMPLATE = """Extraia dados de cada descrição de imóvel. Retorne um JSON array com {n} objetos na mesma ordem.

Campos por objeto:
- bedrooms: int ou null (quartos/dormitórios/suítes)
- bathrooms: int ou null (banheiros/wcs)
- parking: int ou null (vagas de garagem)
- occupied: true/false ou null (se menciona ocupação/desocupação)
- condition: "precario"|"habitavel"|"reformado"|"novo"|null
- useful_area_m2: float ou null (área útil/privativa em m²)
- features: array de strings (ex: ["piscina","elevador","churrasqueira"])

Descrições:
{descriptions}

Responda APENAS o JSON array."""


def _build_prompt(descriptions: list[tuple[str, Optional[str]]]) -> str:
    """Monta o prompt com as descrições numeradas."""
    lines = []
    for i, (prop_id, desc) in enumerate(descriptions, 1):
        text = (desc or "").strip().replace("\n", " ")[:500]  # limita tokens
        lines.append(f"[{i}] {text}")
    return _PROMPT_USER_TEMPLATE.format(
        n=len(descriptions),
        descriptions="\n".join(lines),
    )


def _parse_haiku_response(content: str, count: int) -> list[dict]:
    """
    Extrai o JSON array da resposta do Haiku.
    Retorna lista de dicts; em caso de erro retorna lista de dicts vazios.
    """
    # Remove possíveis blocos de markdown
    clean = re.sub(r"```(?:json)?", "", content).strip()
    try:
        data = json.loads(clean)
        if isinstance(data, list) and len(data) == count:
            return data
    except json.JSONDecodeError:
        pass
    # Fallback: retorna dicts vazios para não travar o pipeline
    return [{} for _ in range(count)]


def _coerce_int(value) -> Optional[int]:
    try:
        v = int(value)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def _coerce_float(value) -> Optional[float]:
    try:
        v = float(value)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def _coerce_condition(value) -> Optional[str]:
    valid = {"precario", "habitavel", "reformado", "novo"}
    if isinstance(value, str) and value.lower() in valid:
        return value.lower()
    return None


def _coerce_features(value) -> dict:
    if not isinstance(value, list):
        return {}
    return {str(f).lower().replace(" ", "_"): True for f in value if isinstance(f, str)}


def enrich_properties(supabase: Client, dry_run: bool = False) -> dict:
    """
    Busca propriedades sem enriquecimento IA e processa em batches com Haiku.

    Args:
        supabase: cliente Supabase já autenticado
        dry_run: se True, não salva no DB (útil para testes)

    Returns:
        dict com estatísticas da rodada
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY não configurado no scraper")

    client = anthropic.Anthropic(api_key=api_key)

    # Busca propriedades candidatas: bedrooms NULL e nunca enriquecidas por IA
    response = (
        supabase.table("leila_properties")
        .select("id, description")
        .is_("bedrooms", "null")
        .is_("ai_enriched_at", "null")
        .not_.is_("description", "null")
        .limit(MAX_PROPERTIES)
        .execute()
    )

    candidates = response.data or []
    if not candidates:
        print("[Enrichment] Nenhuma propriedade pendente.")
        return {"processed": 0, "enriched": 0, "errors": 0}

    print(f"[Enrichment] {len(candidates)} propriedades para enriquecer")

    stats = {"processed": 0, "enriched": 0, "errors": 0}
    now = datetime.now(timezone.utc).isoformat()

    # Processa em batches
    for batch_start in range(0, len(candidates), BATCH_SIZE):
        batch = candidates[batch_start : batch_start + BATCH_SIZE]
        descriptions = [(p["id"], p.get("description")) for p in batch]

        try:
            message = client.messages.create(
                model=HAIKU_MODEL,
                max_tokens=2048,
                system=_PROMPT_SYSTEM,
                messages=[{"role": "user", "content": _build_prompt(descriptions)}],
            )
            raw_content = message.content[0].text if message.content else "[]"
            parsed = _parse_haiku_response(raw_content, len(batch))
        except Exception as e:
            print(f"[Enrichment] Erro na chamada Haiku (batch {batch_start}): {e}")
            stats["errors"] += len(batch)
            continue

        # Salva resultados
        for prop, extracted in zip(batch, parsed):
            prop_id = prop["id"]
            stats["processed"] += 1

            update = {
                "ai_enriched_at": now,
                "updated_at": now,
            }

            # Só sobrescreve campos que heurística deixou NULL
            bedrooms = _coerce_int(extracted.get("bedrooms"))
            bathrooms = _coerce_int(extracted.get("bathrooms"))
            parking = _coerce_int(extracted.get("parking"))
            condition = _coerce_condition(extracted.get("condition"))
            useful_area = _coerce_float(extracted.get("useful_area_m2"))
            features = _coerce_features(extracted.get("features", []))

            if bedrooms is not None:
                update["bedrooms"] = bedrooms
            if bathrooms is not None:
                update["bathrooms"] = bathrooms
            if parking is not None:
                update["parking_spots"] = parking
            if extracted.get("occupied") is not None:
                update["is_occupied"] = bool(extracted["occupied"])
            if condition is not None:
                update["property_condition"] = condition
            if useful_area is not None:
                update["useful_area_m2"] = useful_area
            if features:
                update["features"] = features

            if dry_run:
                print(f"[DryRun] {prop_id}: {update}")
                stats["enriched"] += 1
                continue

            try:
                supabase.table("leila_properties").update(update).eq("id", prop_id).execute()
                stats["enriched"] += 1
            except Exception as e:
                print(f"[Enrichment] Erro ao salvar {prop_id}: {e}")
                stats["errors"] += 1

        batch_num = batch_start // BATCH_SIZE + 1
        total_batches = (len(candidates) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"[Enrichment] Batch {batch_num}/{total_batches} concluído")

    print(f"[Enrichment] Finalizado: {stats}")
    return stats
