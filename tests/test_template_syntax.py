"""Catch Jinja syntax errors before the match page is loaded in a browser."""
from pathlib import Path

from jinja2 import Environment, FileSystemLoader


def test_match_template_compiles():
    template_dir = Path(__file__).resolve().parents[1] / "templates"
    environment = Environment(loader=FileSystemLoader(str(template_dir)))
    # Compilation detects malformed Jinja statements without requiring a
    # database, a configured login session or any application fixtures.
    environment.get_template("match.html")
