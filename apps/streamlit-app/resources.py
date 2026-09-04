import streamlit as st
from api_client import DocumentAPIClient
from config import get_streamlit_settings


@st.cache_resource(show_spinner=False)
def get_api_client() -> DocumentAPIClient:
    return DocumentAPIClient(get_streamlit_settings())
