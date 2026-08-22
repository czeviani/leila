-- AGENDA: hub de compromissos e lembretes multiplataforma.
-- Nasce aqui (repo da Leila) porque é o repo com disciplina de migration,
-- mas as tabelas agenda_* são compartilhadas por qualquer app que publicar
-- uma view <app>_agenda_feed. Ver /root/projects/agenda/README.md.

-- ============================================================
-- Camada 1: tabelas do hub
-- ============================================================

CREATE TABLE IF NOT EXISTS agenda_sources (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  feed_view       TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  reminder_rules  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agenda_commitments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  source_id       TEXT NOT NULL REFERENCES agenda_sources(id),
  external_ref    TEXT NOT NULL,
  title           TEXT NOT NULL,
  subtitle        TEXT,
  starts_at       TIMESTAMPTZ,
  time_confirmed  BOOLEAN NOT NULL DEFAULT false,
  url             TEXT,
  amount          NUMERIC(14,2),
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled', 'cancelled', 'done')),
  cancel_reason   TEXT,
  fingerprint     TEXT,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, user_id, external_ref)
);

CREATE INDEX IF NOT EXISTS idx_agenda_commitments_user ON agenda_commitments(user_id);
CREATE INDEX IF NOT EXISTS idx_agenda_commitments_status_starts ON agenda_commitments(status, starts_at);

CREATE TABLE IF NOT EXISTS agenda_reminders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id  UUID NOT NULL REFERENCES agenda_commitments(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL DEFAULT 'lead_time',
  lead_seconds   INTEGER NOT NULL,
  fire_at        TIMESTAMPTZ NOT NULL,
  channel        TEXT NOT NULL DEFAULT 'whatsapp',
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'sent', 'cancelled', 'skipped')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (commitment_id, kind, lead_seconds)
);

CREATE INDEX IF NOT EXISTS idx_agenda_reminders_due ON agenda_reminders(status, fire_at);

CREATE TABLE IF NOT EXISTS agenda_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id   UUID REFERENCES agenda_reminders(id) ON DELETE CASCADE,
  digest_key    TEXT,
  fire_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel       TEXT NOT NULL,
  target        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error         TEXT,
  body          TEXT,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (reminder_id, digest_key, fire_at)
);

CREATE INDEX IF NOT EXISTS idx_agenda_deliveries_reminder ON agenda_deliveries(reminder_id);

-- ============================================================
-- RLS — leitura por dono, escrita só via service_role (dispatcher/sync)
-- ============================================================

ALTER TABLE agenda_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_sources_select ON agenda_sources;
CREATE POLICY agenda_sources_select ON agenda_sources FOR SELECT USING (true);
DROP POLICY IF EXISTS agenda_sources_service_all ON agenda_sources;
CREATE POLICY agenda_sources_service_all ON agenda_sources FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS agenda_commitments_owner ON agenda_commitments;
CREATE POLICY agenda_commitments_owner ON agenda_commitments FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS agenda_commitments_service_all ON agenda_commitments;
CREATE POLICY agenda_commitments_service_all ON agenda_commitments FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS agenda_reminders_owner ON agenda_reminders;
CREATE POLICY agenda_reminders_owner ON agenda_reminders FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM agenda_commitments c
    WHERE c.id = agenda_reminders.commitment_id AND c.user_id = auth.uid()
  ));
DROP POLICY IF EXISTS agenda_reminders_service_all ON agenda_reminders;
CREATE POLICY agenda_reminders_service_all ON agenda_reminders FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS agenda_deliveries_owner ON agenda_deliveries;
CREATE POLICY agenda_deliveries_owner ON agenda_deliveries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM agenda_reminders r
    JOIN agenda_commitments c ON c.id = r.commitment_id
    WHERE r.id = agenda_deliveries.reminder_id AND c.user_id = auth.uid()
  ));
DROP POLICY IF EXISTS agenda_deliveries_service_all ON agenda_deliveries;
CREATE POLICY agenda_deliveries_service_all ON agenda_deliveries FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Funções
-- ============================================================

-- Normaliza os três formatos de event_at vistos em auction_stages:
-- ISO com offset, "YYYY-MM-DD HH:MM:SS" sem fuso (assume America/Sao_Paulo),
-- e data pura (has_time = false).
CREATE OR REPLACE FUNCTION agenda_parse_ts(p_text text)
RETURNS TABLE(ts timestamptz, has_time boolean)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN QUERY SELECT NULL::timestamptz, false;
    RETURN;
  END IF;

  IF p_text ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$' THEN
    RETURN QUERY SELECT p_text::timestamptz, true;
    RETURN;
  END IF;

  IF p_text ~ '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$' THEN
    RETURN QUERY SELECT (p_text::timestamp AT TIME ZONE 'America/Sao_Paulo'), true;
    RETURN;
  END IF;

  IF p_text ~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN QUERY SELECT (p_text::date::timestamp AT TIME ZONE 'America/Sao_Paulo'), false;
    RETURN;
  END IF;

  BEGIN
    RETURN QUERY SELECT p_text::timestamptz, true;
  EXCEPTION WHEN others THEN
    RETURN QUERY SELECT NULL::timestamptz, false;
  END;
END;
$$;

-- Materializa os lembretes de um commitment a partir de agenda_sources.reminder_rules.
-- Regras com requires_time:true são puladas enquanto time_confirmed = false.
CREATE OR REPLACE FUNCTION agenda_generate_reminders(p_commitment uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_commitment agenda_commitments%ROWTYPE;
  v_source agenda_sources%ROWTYPE;
  v_rule jsonb;
  v_lead_seconds integer;
  v_requires_time boolean;
  v_channel text;
  v_kind text;
  v_fire_at timestamptz;
BEGIN
  SELECT * INTO v_commitment FROM agenda_commitments WHERE id = p_commitment;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_commitment.status <> 'scheduled' THEN
    UPDATE agenda_reminders SET status = 'cancelled', updated_at = now()
    WHERE commitment_id = p_commitment AND status = 'pending';
    RETURN;
  END IF;

  SELECT * INTO v_source FROM agenda_sources WHERE id = v_commitment.source_id;

  FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_source.reminder_rules, '[]'::jsonb))
  LOOP
    v_lead_seconds := (v_rule->>'lead_seconds')::integer;
    v_requires_time := COALESCE((v_rule->>'requires_time')::boolean, false);
    v_channel := COALESCE(v_rule->>'channel', 'whatsapp');
    v_kind := COALESCE(v_rule->>'kind', 'lead_time');

    IF v_requires_time AND NOT v_commitment.time_confirmed THEN
      CONTINUE;
    END IF;
    IF v_commitment.starts_at IS NULL THEN
      CONTINUE;
    END IF;

    v_fire_at := v_commitment.starts_at - make_interval(secs => v_lead_seconds);

    INSERT INTO agenda_reminders (commitment_id, kind, lead_seconds, fire_at, channel, status)
    VALUES (p_commitment, v_kind, v_lead_seconds, v_fire_at, v_channel, 'pending')
    ON CONFLICT (commitment_id, kind, lead_seconds) DO UPDATE SET
      fire_at = EXCLUDED.fire_at,
      status = CASE WHEN agenda_reminders.status = 'sent' THEN agenda_reminders.status ELSE 'pending' END,
      updated_at = now();
  END LOOP;
END;
$$;

-- Faz o diff da feed <source>.feed_view contra agenda_commitments: upsert do
-- que está presente, cancela o que sumiu, regenera reminders. Idempotente.
CREATE OR REPLACE FUNCTION agenda_sync_source(p_source text)
RETURNS TABLE(upserted integer, cancelled integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_source agenda_sources%ROWTYPE;
  v_sync_started_at timestamptz := now();
  v_upserted integer := 0;
  v_cancelled integer := 0;
  v_row record;
  v_commitment_id uuid;
  v_fingerprint text;
  v_cancelled_ids uuid[];
BEGIN
  SELECT * INTO v_source FROM agenda_sources WHERE id = p_source AND enabled;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  FOR v_row IN EXECUTE format(
    'SELECT user_id, external_ref, title, subtitle, starts_at, time_confirmed, url, amount, payload FROM %I',
    v_source.feed_view
  )
  LOOP
    v_fingerprint := md5(
      coalesce(v_row.title, '') || '|' || coalesce(v_row.starts_at::text, '') || '|' ||
      coalesce(v_row.amount::text, '') || '|' || coalesce(v_row.time_confirmed::text, '')
    );

    INSERT INTO agenda_commitments AS c
      (user_id, source_id, external_ref, title, subtitle, starts_at, time_confirmed,
       url, amount, payload, status, fingerprint, first_seen_at, last_seen_at, updated_at)
    VALUES
      (v_row.user_id, p_source, v_row.external_ref, v_row.title, v_row.subtitle, v_row.starts_at,
       v_row.time_confirmed, v_row.url, v_row.amount, v_row.payload, 'scheduled', v_fingerprint,
       now(), now(), now())
    ON CONFLICT (source_id, user_id, external_ref) DO UPDATE SET
      title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, starts_at = EXCLUDED.starts_at,
      time_confirmed = EXCLUDED.time_confirmed, url = EXCLUDED.url, amount = EXCLUDED.amount,
      payload = EXCLUDED.payload, status = 'scheduled', cancel_reason = NULL,
      fingerprint = EXCLUDED.fingerprint, last_seen_at = now(), updated_at = now()
    RETURNING c.id INTO v_commitment_id;

    PERFORM agenda_generate_reminders(v_commitment_id);
    v_upserted := v_upserted + 1;
  END LOOP;

  WITH gone AS (
    UPDATE agenda_commitments
    SET status = 'cancelled', cancel_reason = 'missing_from_feed', updated_at = now()
    WHERE source_id = p_source AND status = 'scheduled' AND last_seen_at < v_sync_started_at
    RETURNING id
  )
  SELECT array_agg(id), count(*) INTO v_cancelled_ids, v_cancelled FROM gone;
  v_cancelled := COALESCE(v_cancelled, 0);

  IF v_cancelled_ids IS NOT NULL THEN
    UPDATE agenda_reminders SET status = 'cancelled', updated_at = now()
    WHERE commitment_id = ANY(v_cancelled_ids) AND status = 'pending';
  END IF;

  RETURN QUERY SELECT v_upserted, v_cancelled;
END;
$$;

-- Claim-and-return: numa transação, seleciona lembretes vencidos, marca 'sent'
-- e já registra no ledger (agenda_deliveries) antes de devolver ao chamador.
-- Se o envio real falhar, o chamador usa agenda_mark_delivery_failed para
-- devolver o lembrete a 'pending' (retry no próximo tick, sem duplicar o que
-- já foi confirmado 'sent').
CREATE OR REPLACE FUNCTION agenda_claim_due(
  p_channel text DEFAULT 'whatsapp',
  p_target text DEFAULT NULL,
  p_window interval DEFAULT interval '2 minutes'
)
RETURNS TABLE(
  delivery_id uuid, reminder_id uuid, commitment_id uuid, user_id uuid,
  title text, subtitle text, starts_at timestamptz, url text, amount numeric,
  fire_at timestamptz, lead_seconds integer, payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT r.id
    FROM agenda_reminders r
    JOIN agenda_commitments c ON c.id = r.commitment_id
    WHERE r.status = 'pending' AND r.channel = p_channel AND c.status = 'scheduled'
      AND r.fire_at <= now() AND r.fire_at > now() - p_window
    ORDER BY r.fire_at
    FOR UPDATE OF r SKIP LOCKED
  ),
  claimed AS (
    UPDATE agenda_reminders r
    SET status = 'sent', updated_at = now()
    FROM due WHERE r.id = due.id
    RETURNING r.id AS reminder_id, r.commitment_id, r.fire_at, r.lead_seconds
  ),
  logged AS (
    INSERT INTO agenda_deliveries (reminder_id, fire_at, channel, target, status, delivered_at)
    SELECT claimed.reminder_id, claimed.fire_at, p_channel, COALESCE(p_target, 'unknown'), 'sent', now()
    FROM claimed
    RETURNING agenda_deliveries.id AS delivery_id, agenda_deliveries.reminder_id AS r_id
  )
  SELECT logged.delivery_id, claimed.reminder_id, claimed.commitment_id, c.user_id,
         c.title, c.subtitle, c.starts_at, c.url, c.amount, claimed.fire_at, claimed.lead_seconds, c.payload
  FROM claimed
  JOIN logged ON logged.r_id = claimed.reminder_id
  JOIN agenda_commitments c ON c.id = claimed.commitment_id;
END;
$$;

-- Preview não-destrutivo dos lembretes vencidos, sem claim/ledger.
-- Usado por `agenda due`; o claim de verdade é agenda_claim_due (usado por `agenda dispatch`).
CREATE OR REPLACE FUNCTION agenda_peek_due(p_channel text DEFAULT 'whatsapp', p_window interval DEFAULT interval '2 minutes')
RETURNS TABLE(
  reminder_id uuid, commitment_id uuid, user_id uuid,
  title text, subtitle text, starts_at timestamptz, url text, amount numeric,
  fire_at timestamptz, lead_seconds integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, c.id, c.user_id, c.title, c.subtitle, c.starts_at, c.url, c.amount, r.fire_at, r.lead_seconds
  FROM agenda_reminders r
  JOIN agenda_commitments c ON c.id = r.commitment_id
  WHERE r.status = 'pending' AND r.channel = p_channel AND c.status = 'scheduled'
    AND r.fire_at <= now() AND r.fire_at > now() - p_window
  ORDER BY r.fire_at;
$$;

-- Reverte um claim quando o envio real (fora do banco) falhou: marca a
-- entrega como 'failed' e devolve o lembrete a 'pending' para retry.
CREATE OR REPLACE FUNCTION agenda_mark_delivery_failed(p_delivery_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agenda_deliveries
  SET status = 'failed', error = p_error, delivered_at = NULL
  WHERE id = p_delivery_id;

  UPDATE agenda_reminders r
  SET status = 'pending', updated_at = now()
  FROM agenda_deliveries d
  WHERE d.id = p_delivery_id AND r.id = d.reminder_id;
END;
$$;

-- Compromissos de hoje/amanhã para o digest. starts_at nulo entra em 'today'
-- marcado como sem horário confirmado — nada é inventado.
CREATE OR REPLACE FUNCTION agenda_digest(p_user uuid, p_scope text DEFAULT 'today')
RETURNS TABLE(
  title text, subtitle text, starts_at timestamptz, time_confirmed boolean,
  url text, amount numeric, source_id text
)
LANGUAGE sql
STABLE
AS $$
  SELECT c.title, c.subtitle, c.starts_at, c.time_confirmed, c.url, c.amount, c.source_id
  FROM agenda_commitments c
  WHERE c.user_id = p_user AND c.status = 'scheduled'
    AND (
      (p_scope = 'today' AND (c.starts_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date)
      OR (p_scope = 'today' AND c.starts_at IS NULL)
      OR (p_scope = 'tomorrow' AND (c.starts_at AT TIME ZONE 'America/Sao_Paulo')::date = ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 1))
    )
  ORDER BY c.starts_at NULLS LAST;
$$;

-- Compromissos futuros (para `agenda list`).
CREATE OR REPLACE FUNCTION agenda_list(p_user uuid, p_days integer DEFAULT 30)
RETURNS TABLE(
  title text, subtitle text, starts_at timestamptz, time_confirmed boolean,
  url text, amount numeric, source_id text
)
LANGUAGE sql
STABLE
AS $$
  SELECT c.title, c.subtitle, c.starts_at, c.time_confirmed, c.url, c.amount, c.source_id
  FROM agenda_commitments c
  WHERE c.user_id = p_user AND c.status = 'scheduled'
    AND (c.starts_at IS NULL OR c.starts_at <= now() + make_interval(days => p_days))
  ORDER BY c.starts_at NULLS LAST;
$$;

-- ============================================================
-- Camada 2: Leila publica no hub
-- ============================================================

CREATE OR REPLACE VIEW leila_agenda_feed AS
SELECT
  f.user_id,
  p.id::text AS external_ref,
  p.title,
  NULLIF(concat_ws('/', NULLIF(p.city, ''), NULLIF(p.state, '')), '') AS subtitle,
  parsed.ts AS starts_at,
  COALESCE(parsed.has_time, false) AS time_confirmed,
  COALESCE(p.listing_url, p.edital_url) AS url,
  COALESCE(stage.price, p.auction_price) AS amount,
  jsonb_build_object(
    'property_id', p.id,
    'city', p.city,
    'state', p.state,
    'discount_pct', p.discount_pct,
    'target_stage', p.target_stage,
    'journey_confidence', p.journey_confidence,
    'stage_label', stage.label
  ) AS payload
FROM leila_favorites f
JOIN leila_properties p ON p.id = f.property_id
LEFT JOIN LATERAL (
  SELECT item->>'label' AS label, item->>'event_at' AS event_at, (item->>'price')::numeric AS price
  FROM jsonb_array_elements(p.auction_stages) item
  WHERE item->>'stage' = p.target_stage
  LIMIT 1
) stage ON true
LEFT JOIN LATERAL agenda_parse_ts(stage.event_at) parsed ON true
WHERE p.is_active AND p.availability_status <> 'unavailable';

-- ============================================================
-- Registro do source + pg_cron
-- ============================================================

INSERT INTO agenda_sources (id, label, feed_view, enabled, reminder_rules)
VALUES (
  'leila', 'Leila — leilões de imóveis', 'leila_agenda_feed', true,
  '[{"kind":"lead_time","lead_seconds":600,"channel":"whatsapp","requires_time":true}]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label, feed_view = EXCLUDED.feed_view, enabled = true,
  reminder_rules = EXCLUDED.reminder_rules, updated_at = now();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agenda-sync-leila') THEN
    PERFORM cron.unschedule('agenda-sync-leila');
  END IF;
END $$;

SELECT cron.schedule('agenda-sync-leila', '*/5 * * * *', $$SELECT agenda_sync_source('leila');$$);
