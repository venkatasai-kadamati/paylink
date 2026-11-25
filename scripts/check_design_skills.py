"""Verify pinned Markdown-only design integrations without executing upstream code."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1] / ".agents" / "skills"


def main() -> None:
    lock = json.loads((ROOT / "sources.lock.json").read_text())
    assert lock["format"] == 1, "Unknown design-skill lock format"
    expected = {"impeccable", "taste-direction", "ui-ux-audit", "uxui-audit"}
    sources = lock["sources"]
    assert {source["name"] for source in sources} == expected
    assert len(sources) == len(expected), "Duplicate source entry"
    checked = 0
    for source in sources:
        assert re.fullmatch(r"[a-f0-9]{40}", source["commit"]), source["name"]
        assert source["repository"].startswith("https://github.com/")
        assert source["license"] in {"MIT", "Apache-2.0"}
        assert (ROOT / source["name"] / "LICENSE").is_file()
        for relative, checksum in source["files"].items():
            path = (ROOT / relative).resolve()
            assert path.is_relative_to(ROOT.resolve()), relative
            assert path.suffix == ".md", f"Unexpected runtime file: {relative}"
            assert re.fullmatch(r"[a-f0-9]{64}", checksum), relative
            assert hashlib.sha256(path.read_bytes()).hexdigest() == checksum, relative
            checked += 1

    entries = list(ROOT.glob("*/SKILL.md"))
    assert len(entries) == 5, "Expected four source adapters and the strict reviewer"
    for entry in entries:
        raw = entry.read_text()
        assert raw.startswith("---\n"), str(entry)
        metadata = raw.split("\n---\n", 1)[0]
        assert f"\nname: {entry.parent.name}\n" in metadata + "\n", str(entry)
        assert "\ndescription:" in metadata
        assert not re.search(r"(?m)^(hooks|allowed-tools|permissions):", metadata), str(entry)

    for path in ROOT.rglob("*"):
        assert not path.is_symlink(), f"Mutable external link: {path}"
        if path.is_file():
            allowed = path.suffix == ".md" or path == ROOT / "sources.lock.json"
            allowed = allowed or (path.name == "LICENSE" and path.parent.name in expected)
            assert allowed, f"Unexpected runtime or unregistered file: {path}"
            assert not path.stat().st_mode & 0o111, f"Executable permission: {path}"
    print(f"Design capabilities verified: {len(sources)} pinned sources, "
          f"{checked} immutable references, {len(entries)} permission-free adapters.")


if __name__ == "__main__":
    main()
