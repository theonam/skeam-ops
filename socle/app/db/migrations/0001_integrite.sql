-- Garanties d'intégrité tenues par la base elle-même, quel que soit le code qui écrit :
-- un document émis est figé et ne se supprime jamais ; son numéro ne change plus ;
-- le journal d'audit est en ajout seul. TRUNCATE n'est pas concerné : il sert à l'effacement
-- de démonstration, protégé côté application (src/server/maintenance/purge.ts).

CREATE FUNCTION socle_documents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.number IS NOT NULL THEN
      RAISE EXCEPTION 'Document % numéroté : il s''annule, il ne se supprime pas', OLD.number USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.number IS NOT NULL AND NEW.number IS DISTINCT FROM OLD.number THEN
    RAISE EXCEPTION 'Le numéro % ne peut pas changer', OLD.number USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status <> 'draft' AND (
    NEW.type IS DISTINCT FROM OLD.type
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.subject IS DISTINCT FROM OLD.subject
    OR NEW.document_date IS DISTINCT FROM OLD.document_date
    OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.total_ht_cents IS DISTINCT FROM OLD.total_ht_cents
    OR NEW.total_vat_cents IS DISTINCT FROM OLD.total_vat_cents
    OR NEW.total_ttc_cents IS DISTINCT FROM OLD.total_ttc_cents
    OR NEW.buyer_name IS DISTINCT FROM OLD.buyer_name
    OR NEW.buyer_address IS DISTINCT FROM OLD.buyer_address
    OR NEW.iban IS DISTINCT FROM OLD.iban
    OR NEW.bic IS DISTINCT FROM OLD.bic
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
    OR NEW.status = 'draft'
    OR (OLD.pdf_storage_key IS NOT NULL AND NEW.pdf_storage_key IS DISTINCT FROM OLD.pdf_storage_key)
  ) THEN
    RAISE EXCEPTION 'Document % émis : son contenu est figé', OLD.number USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER documents_guard BEFORE UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION socle_documents_guard();
--> statement-breakpoint
CREATE FUNCTION socle_document_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status document_status;
BEGIN
  SELECT status INTO parent_status FROM documents WHERE id = COALESCE(NEW.document_id, OLD.document_id);
  -- Document absent : suppression en cascade d'un brouillon, déjà autorisée par socle_documents_guard.
  IF parent_status IS NOT NULL AND parent_status <> 'draft' THEN
    RAISE EXCEPTION 'Les lignes d''un document émis sont figées' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER document_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON document_lines
  FOR EACH ROW EXECUTE FUNCTION socle_document_lines_guard();
--> statement-breakpoint
CREATE TRIGGER document_vat_guard BEFORE INSERT OR UPDATE OR DELETE ON document_vat
  FOR EACH ROW EXECUTE FUNCTION socle_document_lines_guard();
--> statement-breakpoint
CREATE FUNCTION socle_audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Journal d''audit : ajout seul' USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION socle_audit_log_append_only();
