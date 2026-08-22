-- AGENDA: lembretes avulsos (fora de qualquer feed de plataforma).
-- Fecha o furo do plano original: F8 previa só consultar/cancelar pela
-- conversa, mas não havia nenhum jeito de CRIAR um compromisso pontual
-- ("me lembra às 15h de ligar pro banco"). Sem isso o AGENDA só serve
-- para leilões da Leila, não vira o hub geral que era a ideia.

INSERT INTO agenda_sources (id, label, feed_view, enabled, reminder_rules)
VALUES ('manual', 'Lembretes avulsos', '', false, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;
-- enabled=false de propósito: 'manual' nunca é alvo de agenda_sync_source
-- (não tem feed_view real) — os compromissos são inseridos diretamente por
-- agenda_add_reminder, nunca via diff de uma view.

CREATE OR REPLACE FUNCTION agenda_add_reminder(
  p_user uuid,
  p_title text,
  p_starts_at timestamptz,
  p_lead_minutes integer DEFAULT 10,
  p_subtitle text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_amount numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO agenda_commitments
    (user_id, source_id, external_ref, title, subtitle, starts_at, time_confirmed,
     url, amount, payload, status)
  VALUES
    (p_user, 'manual', gen_random_uuid()::text, p_title, p_subtitle, p_starts_at, true,
     p_url, p_amount, '{}'::jsonb, 'scheduled')
  RETURNING id INTO v_id;

  IF p_lead_minutes IS NOT NULL AND p_lead_minutes > 0 THEN
    INSERT INTO agenda_reminders (commitment_id, kind, lead_seconds, fire_at, channel, status)
    VALUES (v_id, 'lead_time', p_lead_minutes * 60,
            p_starts_at - make_interval(mins => p_lead_minutes), 'whatsapp', 'pending');
  END IF;

  RETURN v_id;
END;
$$;

-- Cancela um compromisso (de qualquer fonte) e seus lembretes pendentes.
CREATE OR REPLACE FUNCTION agenda_cancel_commitment(p_commitment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found boolean;
BEGIN
  UPDATE agenda_commitments
  SET status = 'cancelled', cancel_reason = 'cancelled_manually', updated_at = now()
  WHERE id = p_commitment_id AND status = 'scheduled';
  v_found := FOUND;

  UPDATE agenda_reminders SET status = 'cancelled', updated_at = now()
  WHERE commitment_id = p_commitment_id AND status = 'pending';

  RETURN v_found;
END;
$$;

-- Busca por título/subtítulo — usada por "cancela o lembrete do apê da Vila Carrão".
CREATE OR REPLACE FUNCTION agenda_search(p_user uuid, p_query text)
RETURNS TABLE(id uuid, title text, subtitle text, starts_at timestamptz, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.title, c.subtitle, c.starts_at, c.status
  FROM agenda_commitments c
  WHERE c.user_id = p_user
    AND (c.title ILIKE '%' || p_query || '%' OR c.subtitle ILIKE '%' || p_query || '%')
  ORDER BY (c.status = 'scheduled') DESC, c.starts_at NULLS LAST
  LIMIT 10;
$$;
