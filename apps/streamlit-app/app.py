import streamlit as st
from components.layout import render_sidebar_context
from config import get_streamlit_settings
from styles import apply_global_styles
from ui_state import initialize_session_state
from views.home import render_home
from views.start_contract import render_start_contract
from views.start_pdf import render_start_pdf
from views.workflow_status import render_workflow_status

settings = get_streamlit_settings()
st.set_page_config(
    page_title=settings.application_title,
    page_icon=":material/account_tree:",
    layout="wide",
    initial_sidebar_state="expanded",
)

initialize_session_state(st.session_state)
apply_global_styles()

pages = {
    "Dashboard": render_home,
    "Start PDF Workflow": render_start_pdf,
    "Start Contract Review": render_start_contract,
    "Workflow Status": render_workflow_status,
}
with st.sidebar:
    current_page = st.radio(
        "Navigate",
        list(pages),
        key="active_page",
    )
render_sidebar_context()
pages[current_page]()
