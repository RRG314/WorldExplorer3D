# Acknowledgements and annotated references

World Explorer 3D supplies the original environment and research direction. Codex assisted coding, debugging, test construction and drafting. Google Gemini supplied the live model responses in the recorded pilot. Use of a tool or API does not imply endorsement, collaboration, peer review or funding. No outside institution or reviewer is claimed.

The experiment reuses the project's Three.js rendering, walking/collision, Backpack and Block systems. Geographic context includes OpenStreetMap and other project data providers. Preserve © OpenStreetMap contributors and the applicable source notices. The repository ATTRIBUTION.md, DATA_SOURCES.md and ACKNOWLEDGEMENTS.md contain provider and asset-level context. Licensed third-party dependencies retain their own terms; this branch does not relicense them.

## Research references

**Joon Sung Park, Joseph C. O'Brien, Carrie J. Cai, Meredith Ringel Morris, Percy Liang and Michael S. Bernstein (2023). Generative Agents: Interactive Simulacra of Human Behavior.** [Primary paper and version history](https://arxiv.org/abs/2304.03442). Relevant to memory, reflection, planning and evaluating social behavior. Our current short recent-outcome buffer does not implement or reproduce their social-agent system.

**Guanzhi Wang, Yuqi Xie, Yunfan Jiang, Ajay Mandlekar, Chaowei Xiao, Yuke Zhu, Linxi Fan and Anima Anandkumar (2023). Voyager: An Open-Ended Embodied Agent with Large Language Models.** [Primary paper and version history](https://arxiv.org/abs/2305.16291). Relevant to tool progression and reusable skills in an embodied environment. Our fixed typed actions and declared recipes differ from its code-based skill library; no comparative performance claim is made.

**Xiao Liu and colleagues (2023). AgentBench: Evaluating LLMs as Agents.** [Primary paper and complete author list](https://arxiv.org/abs/2308.03688). Relevant to evaluating multi-step interaction across environments. The present integration pilot is not an AgentBench evaluation. The abbreviated author credit is deliberate; see the primary record for all authors.

## Implementation references

[Gemini structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output) describes the provider interface used to constrain response shape. Schema validity still requires independent world authorization. [Gemini API reference](https://ai.google.dev/api/generate-content) documents generation requests. These are implementation dependencies, not evidence that a resident action succeeded.

References were checked against primary paper records on September 11, 2026. Summaries describe relevance and differences; external papers and figures are linked, not redistributed. Machine-readable paper citations are in `references.bib`. Cite our report with its version and exact source commit; it has no DOI or peer-reviewed venue.
