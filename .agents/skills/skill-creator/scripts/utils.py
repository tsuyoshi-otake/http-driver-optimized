"""Shared utilities for skill-creator scripts."""

import json
import os
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, TextIO


def _is_relative_to(path: Path, root: Path) -> bool:
    """Return True when path is inside root."""
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def discover_workspace_roots() -> tuple[Path, ...]:
    """Discover default roots that CLI paths are allowed to use."""
    roots: list[Path] = [Path.cwd().resolve()]
    script_dir = Path(__file__).resolve().parent

    for parent in [script_dir, *script_dir.parents]:
        if (parent / ".git").exists() or (parent / "AGENTS.md").is_file():
            resolved = parent.resolve()
            if resolved not in roots:
                roots.append(resolved)
            break

    return tuple(roots)


def allowed_workspace_roots(*extra_roots: str | Path | None) -> tuple[Path, ...]:
    """Return deduplicated allowed roots for CLI path resolution."""
    roots = list(discover_workspace_roots())

    for extra in extra_roots:
        if extra is None:
            continue
        resolved = Path(extra).expanduser().resolve()
        if resolved not in roots:
            roots.append(resolved)

    return tuple(roots)


def resolve_user_path(
    raw_path: str | Path,
    *,
    expected: str = "any",
    must_exist: bool = False,
    allowed_roots: tuple[Path, ...] | None = None,
    label: str = "path",
) -> Path:
    """Resolve a CLI-supplied path and reject traversal outside allowed roots."""
    candidate = Path(raw_path).expanduser()
    if candidate.is_absolute():
        candidate = candidate.resolve()
    else:
        candidate = (Path.cwd() / candidate).resolve()

    roots = allowed_roots or discover_workspace_roots()
    if not any(_is_relative_to(candidate, root.resolve()) for root in roots):
        allowed = ", ".join(str(root) for root in roots)
        raise ValueError(f"{label.capitalize()} must stay within: {allowed}")

    if must_exist and not candidate.exists():
        raise ValueError(f"{label.capitalize()} not found: {candidate}")

    if expected == "file":
        if candidate.exists() and not candidate.is_file():
            raise ValueError(f"{label.capitalize()} must be a file: {candidate}")
    elif expected == "dir":
        if candidate.exists() and not candidate.is_dir():
            raise ValueError(f"{label.capitalize()} must be a directory: {candidate}")
    elif expected != "any":
        raise ValueError(f"Unsupported expected path type: {expected}")

    return candidate


def resolve_child_path(
    raw_path: str | Path,
    *,
    allowed_root: str | Path,
    expected: str = "any",
    must_exist: bool = False,
    label: str = "path",
) -> Path:
    """Resolve a derived child path against a single allowed root."""
    return resolve_user_path(
        raw_path,
        expected=expected,
        must_exist=must_exist,
        allowed_roots=(Path(allowed_root).expanduser().resolve(),),
        label=label,
    )


def ensure_path_within_root(
    raw_path: str | Path,
    *,
    allowed_root: str | Path,
    expected: str = "any",
    must_exist: bool = False,
    label: str = "path",
) -> Path:
    """Resolve a path and assert it stays under one specific root."""
    root = Path(allowed_root).expanduser().resolve()
    candidate = resolve_child_path(
        raw_path,
        expected=expected,
        must_exist=must_exist,
        allowed_root=root,
        label=label,
    )
    if os.path.commonpath([str(root), str(candidate)]) != str(root):
        raise ValueError(f"{label.capitalize()} must stay within: {root}")
    return candidate


def read_json_within(allowed_root: str | Path, raw_path: str | Path, *, label: str) -> Any:
    """Load JSON from a path that must stay within the allowed root."""
    safe_path = ensure_path_within_root(
        raw_path,
        allowed_root=allowed_root,
        expected="file",
        must_exist=True,
        label=label,
    )
    with safe_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json_within(allowed_root: str | Path, raw_path: str | Path, payload: Any, *, label: str) -> Path:
    """Write JSON to a path that must stay within the allowed root."""
    safe_path = ensure_path_within_root(
        raw_path,
        allowed_root=allowed_root,
        expected="file",
        must_exist=False,
        label=label,
    )
    safe_path.parent.mkdir(parents=True, exist_ok=True)
    with safe_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    return safe_path


def write_text_within(allowed_root: str | Path, raw_path: str | Path, content: str, *, label: str) -> Path:
    """Write text to a path that must stay within the allowed root."""
    safe_path = ensure_path_within_root(
        raw_path,
        allowed_root=allowed_root,
        expected="file",
        must_exist=False,
        label=label,
    )
    safe_path.parent.mkdir(parents=True, exist_ok=True)
    safe_path.write_text(content, encoding="utf-8")
    return safe_path


@contextmanager
def open_zipfile_within(
    allowed_root: str | Path,
    raw_path: str | Path,
    *,
    mode: str = "w",
    compression: int = zipfile.ZIP_DEFLATED,
    label: str = "zip file",
) -> Iterator[zipfile.ZipFile]:
    """Open a zip file whose path must stay within the allowed root."""
    safe_path = ensure_path_within_root(
        raw_path,
        allowed_root=allowed_root,
        expected="file",
        must_exist=False,
        label=label,
    )
    safe_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(safe_path, mode, compression) as handle:
        yield handle


@contextmanager
def open_text_file_within(
    allowed_root: str | Path,
    raw_path: str | Path,
    *,
    mode: str = "r",
    label: str = "text file",
) -> Iterator[TextIO]:
    """Open a text file whose path must stay within the allowed root."""
    safe_path = ensure_path_within_root(
        raw_path,
        allowed_root=allowed_root,
        expected="file",
        must_exist="r" in mode,
        label=label,
    )
    if any(flag in mode for flag in ("w", "a", "x", "+")):
        safe_path.parent.mkdir(parents=True, exist_ok=True)
    with safe_path.open(mode, encoding="utf-8") as handle:
        yield handle


def parse_skill_md(skill_path: Path) -> tuple[str, str, str]:
    """Parse a SKILL.md file, returning (name, description, full_content)."""
    content = (skill_path / "SKILL.md").read_text()
    lines = content.split("\n")

    if lines[0].strip() != "---":
        raise ValueError("SKILL.md missing frontmatter (no opening ---)")

    end_idx = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end_idx = i
            break

    if end_idx is None:
        raise ValueError("SKILL.md missing frontmatter (no closing ---)")

    name = ""
    description = ""
    frontmatter_lines = lines[1:end_idx]
    i = 0
    while i < len(frontmatter_lines):
        line = frontmatter_lines[i]
        if line.startswith("name:"):
            name = line[len("name:"):].strip().strip('"').strip("'")
        elif line.startswith("description:"):
            value = line[len("description:"):].strip()
            # Handle YAML multiline indicators (>, |, >-, |-)
            if value in (">", "|", ">-", "|-"):
                continuation_lines: list[str] = []
                i += 1
                while i < len(frontmatter_lines) and (frontmatter_lines[i].startswith("  ") or frontmatter_lines[i].startswith("\t")):
                    continuation_lines.append(frontmatter_lines[i].strip())
                    i += 1
                description = " ".join(continuation_lines)
                continue
            else:
                description = value.strip('"').strip("'")
        i += 1

    return name, description, content
