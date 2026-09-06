import streamlit as st
from components.layout import page_header, render_service_readiness
from ui_state import queue_navigation


def render_home() -> None:
    page_header(
        "Operations / overview",
        "Temporal Document Operations",
        (
            "Durable document work with explicit status, review, and terminal "
            "outcomes. The interface talks only to the FastAPI application boundary."
        ),
    )

    render_service_readiness()

    st.markdown("## Choose the workflow that matches the job")
    pdf_column, contract_column = st.columns(2, gap="large")
    with pdf_column:
        st.markdown("### PDF extraction")
        st.write(
            "Turn one source PDF in S3 into a derived Markdown artifact while "
            "keeping the source object untouched."
        )
        if st.button("Start PDF extraction", width="stretch"):
            queue_navigation(st.session_state, "Start PDF Workflow")
            st.rerun()
    with contract_column:
        st.markdown("### Contract review")
        st.write(
            "Analyze one or more contracts, inspect document-level outcomes, "
            "and make a revision-aware human decision."
        )
        if st.button("Start contract review", width="stretch"):
            queue_navigation(st.session_state, "Start Contract Review")
            st.rerun()

    st.divider()
    st.caption(
        "Long-running work continues in Temporal. This page never waits for a "
        "workflow to finish."
    )
