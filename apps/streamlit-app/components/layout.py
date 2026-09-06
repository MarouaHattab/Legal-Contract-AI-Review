import streamlit as st
from api_client import APIClientError
from resources import get_api_client


def page_header(kicker: str, title: str, description: str) -> None:
    st.caption(kicker)
    st.title(title)
    st.write(description)
    st.divider()


def render_service_readiness() -> None:
    try:
        get_api_client().readiness()
    except APIClientError as exc:
        st.warning(exc.user_message, icon=":material/cloud_off:")
        return
    st.success(
        "FastAPI and the workflow service are ready.",
        icon=":material/check_circle:",
    )


def render_sidebar_context() -> None:
    with st.sidebar:
        st.markdown("### Document operations")
        st.caption("Streamlit → FastAPI → Temporal")
        workflow_id = st.session_state.get("selected_workflow_id", "")
        if workflow_id:
            st.divider()
            st.caption("Selected workflow")
            st.code(workflow_id, language=None, wrap_lines=True)
