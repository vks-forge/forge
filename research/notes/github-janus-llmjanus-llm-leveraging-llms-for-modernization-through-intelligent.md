---
title: 'GitHub - janus-llm/janus-llm: Leveraging LLMs for modernization through intelligent
  chunking, iterative prompting and reflection, and retrieval augmented generation
  (RAG). · GitHub'
id: github-janus-llmjanus-llm-leveraging-llms-for-modernization-through-intelligent
tags:
- ai-software-factory-architecture-58e4cc
- reverse-engineering
- decompilation
- open-source-tool
created: '2026-10-12T08:34:40.829318Z'
updated: '2026-10-12T08:34:58.437287Z'
source: https://github.com/janus-llm/janus-llm
source_domain: github.com
fetched_at: '2026-10-12T08:34:40.826722Z'
fetch_provider: builtin
status: draft
type: note
tier: ground_truth
content_type: code
deprecated: false
summary: 'Open-source MITRE Corporation tool (janus-llm, Apache-2.0 license, 42 stars/7
  forks as fetched) for LLM-assisted legacy IT modernization, used in the MITRE arXiv:2411.14971
  study. Directly relevant to the Reverse Engineering & Codebase Mastery pillar: capabilities
  include chunking code in 100+ programming languages into a Chroma vector database
  sized to fit model context windows, file-by-file LLM-driven source-to-source translation
  between languages, and BINARY-TO-SOURCE translation via Ghidra decompilation integration
  — a concrete real tool combining neural decompilation with LLM reasoning. Also generates
  requirements, UML diagrams, code comments, and summaries from source code, plus
  built-in evaluation of generated artifacts, exposed via a CLI tool (''janus'').
  Tech stack: Python, LangChain, ChromaDB, tree-sitter (for code parsing/chunking).
  This is a usable, installable (pip install janus-llm) building block for a reverse-engineering/legacy-codebase-ingestion
  pipeline in the software-factory architecture, not just a research prototype description.'
---

*Suggested by [[leveraging-llms-for-legacy-code-modernization-challenges-and-opportunities-for-l]] — open-source Janus framework used by MITRE for LLM-based legacy code comment generation*

GitHub - janus-llm/janus-llm: Leveraging LLMs for modernization through intelligent chunking, iterative prompting and reflection, and retrieval augmented generation (RAG). · GitHub
Skip to content
You signed in with another tab or window.
Reload
to refresh your session.
You signed out in another tab or window.
Reload
to refresh your session.
You switched accounts on another tab or window.
Reload
to refresh your session.
Dismiss alert
public
Branches
Tags
Go to file
Code
Open more actions menu
Latest commit
History
1,379 Commits
1,379 Commits
Folders and files
Name
Name
Last commit message
Last commit date
.github/
workflows
.github/
workflows
assets/
icons
assets/
icons
config
config
docs
docs
janus
janus
pipelines
pipelines
scripts
scripts
tests
tests
.flake8
.flake8
.gitignore
.gitignore
.gitlab-ci.yml
.gitlab-ci.yml
.pre-commit-config.yaml
.pre-commit-config.yaml
CITATION.cff
CITATION.cff
LICENSE
LICENSE
README.md
README.md
poetry.lock
poetry.lock
pyproject.toml
pyproject.toml
View all files
Repository files navigation
Overview
Janus (
`janus-llm`
) uses LLMs to aid in the modernization of legacy IT systems. The repository can currently do the following:
Chunk code of over 100 programming languages to fit within different model context windows and add to a
Chroma
vector database.
Translate from one programming language to another on a file-by-file basis using an LLM.
Translate from a binary file to a programming language using
Ghidra
decompilation.
Generate requirements, UML diagrams, code comments, and summaries from source code.
Evaluate the products that you generate.
Do 1-5 with a CLI tool (
`janus`
).
Installation
```
pip install janus-llm
```
Installing from Source
Clone the repository:
```
git clone git@github.com:janus-llm/janus-llm.git
```
Then, install the requirements:
```
curl -sSkL https://install.python-poetry.org | python -
export PATH=$PATH:$HOME/.local/bin
poetry install
```
Documentation
See
the documentation
for more information on how to use the package.
Contributing
See our
contributing pages
Copyright
Copyright ©2025 The MITRE Corporation. ALL RIGHTS RESERVED. Approved for Public Release; Distribution Unlimited. Public Release Case Number 23-4084.
About
Leveraging LLMs for modernization through intelligent chunking, iterative prompting and reflection, and retrieval augmented generation (RAG).
janus-llm.github.io/janus-llm/
Topics
chroma
chromadb
cli
langchain
llm
modernization
python
rag
tree-sitter
Resources
Readme
Apache-2.0 license
Cite this repository
Activity
Custom properties
Stars
42
stars
Watchers
4
watching
Forks
7
forks
Report repository
Releases
Used by
Contributors
Languages
You can’t perform that action at this time.