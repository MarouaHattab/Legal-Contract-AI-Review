import streamlit as st
from models import ContractReport


def render_contract_report(report: ContractReport | None, *, title: str) -> None:
    st.markdown(f"## {title}")
    if report is None:
        st.info("The report is not available yet.", icon=":material/info:")
        return

    risk, actions = st.columns([1, 2], gap="large")
    with risk:
        st.caption("Overall risk level")
        st.markdown(f"### {report.overall_risk_level}")
    with actions:
        st.caption("Recommended actions")
        st.markdown(report.recommended_actions)

    st.markdown("### Cross-contract risks")
    st.markdown(report.top_cross_contract_risks)
