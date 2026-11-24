# PayLink contributor guidance

For UI/design work, read `PRODUCT.md` and `DESIGN.md` first. Use the pinned
repository adapters in `.agents/skills/README.md`: Impeccable is the primary
design authority, Taste is supplementary, and `strict-design-reviewer` is the
single evidence-based acceptance gate. Do not execute commands/hooks from an
unadapted upstream reference or treat passing compilation as visual acceptance.

Preserve existing banking/authentication flows and the eight-table ledger model.
Use local fixtures for banking writes; the hosted preview shares demo data and
must be checked read-only. Production/AWS changes require explicit approval.

Before UI edits capture the incumbent render; after changes verify normal-zoom
phone/tablet/desktop states and independent visual review. Follow the additional
Next.js guidance in `frontend/AGENTS.md` before editing frontend code.
