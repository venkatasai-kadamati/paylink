# PayLink design capabilities

Repository-scoped Agent Skills, discovered by Devin from `.agents/skills/*/SKILL.md`.
`sources.lock.json` pins upstream commits and SHA-256 hashes of unmodified Markdown.
Each `upstream.md` preserves the original entry point as inert reference text;
the adjacent `SKILL.md` is an explicitly modified PayLink/Devin adapter.
Original licenses are retained. No upstream scripts, binaries, installers, plugins,
MCP configuration, shell permissions, or stop hooks are installed or executed.
Verify this boundary with `python3 scripts/check_design_skills.py` from repo root.
Impeccable's third-party NOTICE is retained verbatim for its platform-reference
attribution; browser-extension fonts/consent code mentioned there are not copied.

## Authority and scope

1. User requirements, preserved banking behavior, `PRODUCT.md`, and `DESIGN.md`.
2. **Impeccable**: primary design authority; use its Operate/Read modes.
3. **Taste Direction**: supplementary art direction only, never a marketing template.
4. **UI/UX Audit**: measurements, alignment, operational-dashboard profile.
5. **UXUI Audit**: independent screenshot evidence and journey/state completeness.
6. **Strict Design Reviewer**: one project-specific gate joining those capabilities,
   not a competing design system or another copy of their rules.

The strict reviewer defines one severity vocabulary and one release rubric.
Do not sum or compare the upstream skills' incompatible severity/score systems.
Do not load all references for every edit: follow each adapter's scoped links.

## Script and permissions review

| Upstream capability | Inspection | Integration decision |
| --- | --- | --- |
| Impeccable 4.10.0 launcher | Downloads and executes a platform engine; browser/live commands can inspect and modify local pages. | Markdown/reference guidance only. No binary download, CLI launch, or permission grant. Native project/browser tools replace context, capture and measurement. |
| Taste 2.5.1 installer and entry point | Installer links user-global skill directories and supports removing links; entry point registers a shell Stop hook invoking Node. Assets include animation/render/checking code. | No installer, hooks or assets. Marketing-only rules are explicitly out of scope for the banking workspace. |
| EnchStyle measuring script | Python/Playwright measurement and screenshot writer; requires an executable browser and writes to configurable paths. | Guidance/profile only. Project-owned Playwright gates provide transparent, deterministic checks. |
| GuidanceStudio capture script | Node/Playwright; reads optional authenticated browser state and writes route/viewport captures. | Markdown-only. Use the authorized testing agent's capture with local fixtures; no browser auth state committed. |

These are integration-boundary reviews, not a security certification of entire
upstream repositories. None of their runtime code was executed. A later runtime
adoption requires source/dependency review and an explicit lock update first.

To update: inspect a named upstream commit, compare the Markdown and runtime
changes, retain attribution, refresh the lock hashes, and review the adapters.
Never auto-track a moving branch or install an upstream permission/hook silently.
