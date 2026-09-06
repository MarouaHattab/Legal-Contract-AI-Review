import hashlib
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any


class UploadInputError(ValueError):
    pass


@dataclass(frozen=True)
class PreparedUpload:
    filename: str
    content: bytes
    sha256: str


def prepare_uploaded_files(
    files: Iterable[Any],
    *,
    max_files: int,
) -> list[PreparedUpload]:
    selected = list(files)
    if not selected:
        raise UploadInputError("Select at least one PDF file.")
    if len(selected) > max_files:
        raise UploadInputError(f"Select at most {max_files} PDF files.")

    prepared: list[PreparedUpload] = []
    for selected_file in selected:
        filename = str(getattr(selected_file, "name", "")).strip()
        content = selected_file.getvalue()
        if not filename:
            raise UploadInputError("Each selected PDF must have a filename.")
        if not content:
            raise UploadInputError(f"{filename} is empty.")
        prepared.append(
            PreparedUpload(
                filename=filename,
                content=content,
                sha256=hashlib.sha256(content).hexdigest(),
            )
        )
    return prepared


def api_upload_payload(
    files: Sequence[PreparedUpload],
) -> list[tuple[str, bytes]]:
    return [(file.filename, file.content) for file in files]


def upload_fingerprint_payload(
    files: Sequence[PreparedUpload],
) -> list[dict[str, str]]:
    return [
        {"filename": file.filename, "sha256": file.sha256}
        for file in files
    ]
