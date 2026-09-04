import streamlit as st
from api_client import (
    APIClientError,
    APIConflictError,
    APIRequestTimeout,
    BackendUnavailableError,
    InputValidationError,
    WorkflowNotFoundError,
)


def render_api_error(error: APIClientError) -> None:
    if isinstance(error, (APIRequestTimeout, APIConflictError)):
        st.warning(error.user_message, icon=":material/sync_problem:")
    elif isinstance(error, WorkflowNotFoundError):
        st.warning(error.user_message, icon=":material/search_off:")
    elif isinstance(error, InputValidationError):
        st.error(error.user_message, icon=":material/error:")
    elif isinstance(error, BackendUnavailableError):
        st.error(error.user_message, icon=":material/cloud_off:")
    else:
        st.error(error.user_message, icon=":material/error:")
