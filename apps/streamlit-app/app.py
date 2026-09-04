import streamlit as st
from components.layout import render_sidebar_context
from config import get_streamlit_settings
from styles import apply_global_styles
from ui_state import initialize_session_state
from views.home import render_home

settings = get_streamlit_settings()
st.set_page_config(
    page_title=settings.application_title,
    page_icon=":material/account_tree:",
    layout="wide",
    initial_sidebar_state="expanded",
)

initialize_session_state(st.session_state)
apply_global_styles()

current_page = st.navigation(
    [
        st.Page(
            render_home,
            title="Dashboard",
            icon=":material/dashboard:",
            default=True,
        )
    ],
    position="sidebar",
    expanded=True,
)
render_sidebar_context()
current_page.run()
