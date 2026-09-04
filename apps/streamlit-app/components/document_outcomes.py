import streamlit as st
from models import ContractDocumentProgress, DocumentOutcome


def render_document_progress(documents: list[ContractDocumentProgress]) -> None:
    if not documents:
        st.caption("Document outcomes are not available yet.")
        return

    st.markdown("### Document processing")
    rows = [
        {
            "Source": document.s3_path,
            "Status": document.status,
            "Chunks": document.chunks_processed,
            "Characters": document.characters_processed,
            "Derived artifact": document.artifact_s3_path or "",
            "Failure": document.error,
        }
        for document in documents
    ]
    st.dataframe(rows, hide_index=True, use_container_width=True)
    failed = [document for document in documents if document.status == "failed"]
    if failed:
        st.warning(
            f"{len(failed)} document(s) failed. Any resulting report is partial.",
            icon=":material/warning:",
        )


def render_document_outcomes(documents: list[DocumentOutcome]) -> None:
    if not documents:
        st.caption("No document outcomes were returned.")
        return

    st.markdown("### Document outcomes")
    for index, document in enumerate(documents, start=1):
        label = f"{index:02d} / {document.status.upper()} / {document.s3_path}"
        with st.expander(label, expanded=document.status == "failed"):
            if document.status == "failed":
                st.error(
                    document.error or "Document processing failed.",
                    icon=":material/error:",
                )
                continue

            if document.analysis is None:
                st.info("No analysis payload was returned for this document.")
                continue

            st.markdown("#### Summary")
            st.write(document.analysis.summary)
            st.markdown("#### Key risks")
            st.write(document.analysis.key_risks)
            chunks, characters = st.columns(2)
            chunks.metric("Chunks processed", document.analysis.chunks_processed)
            characters.metric(
                "Characters processed",
                document.analysis.characters_processed,
            )
            st.caption("Derived artifact")
            st.code(document.analysis.artifact.s3_path, language=None, wrap_lines=True)
