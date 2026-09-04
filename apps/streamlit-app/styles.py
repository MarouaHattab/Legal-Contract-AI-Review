import streamlit as st

GLOBAL_STYLES = """
<style>
:root {
  --ui-blue: #002FA7;
  --ui-ink: #151515;
  --ui-muted: #626262;
  --ui-line: #D8D8D3;
  --ui-paper: #F6F6F3;
}
html, body, [class*="st-"] {
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
}
[data-testid="stAppViewContainer"] { background: var(--ui-paper); }
[data-testid="stMainBlockContainer"] {
  max-width: 1180px;
  padding-top: 2.25rem;
  padding-bottom: 4rem;
}
[data-testid="stSidebar"] {
  background: #FFFFFF;
  border-right: 1px solid var(--ui-line);
}
h1, h2, h3 { color: var(--ui-ink); letter-spacing: -0.025em; }
h1 { font-weight: 600; }
p, label, [data-testid="stCaptionContainer"] { color: var(--ui-muted); }
.ui-kicker {
  color: var(--ui-blue);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  margin: 0 0 0.5rem 0;
  text-transform: uppercase;
}
.ui-rule { border-top: 1px solid var(--ui-line); margin: 1.5rem 0; }
.ui-phase-panel {
  background: #FFFFFF;
  border-left: 4px solid var(--ui-blue);
  border-top: 1px solid var(--ui-line);
  border-bottom: 1px solid var(--ui-line);
  padding: 1.35rem 1.5rem 1.2rem;
  margin-bottom: 1rem;
}
.ui-phase-label {
  color: var(--ui-blue);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  margin: 0;
  text-transform: uppercase;
}
.ui-phase-word {
  color: var(--ui-ink);
  font-size: clamp(2.1rem, 5vw, 4.5rem);
  font-weight: 600;
  letter-spacing: -0.055em;
  line-height: 0.95;
  margin: 0.55rem 0 0.75rem;
}
.ui-phase-note { margin: 0; }
.stButton > button, .stFormSubmitButton > button {
  border-radius: 0;
  font-weight: 600;
}
.stButton > button[kind="primary"],
.stFormSubmitButton > button[kind="primary"] {
  background: var(--ui-blue);
  border-color: var(--ui-blue);
}
[data-testid="stMetric"] {
  background: #FFFFFF;
  border-top: 2px solid var(--ui-blue);
  padding: 1rem;
}
</style>
"""


def apply_global_styles() -> None:
    st.markdown(GLOBAL_STYLES, unsafe_allow_html=True)
