---
name: Design delegation paths
description: Avoid misplaced frontend output when delegating artifact builds.
---
State the workspace-relative target directory explicitly in delegated implementation requests and confirm returned files landed there before starting the managed workflow.

**Why:** A design build wrote to root `src/` despite an artifact outputDir, leaving the running artifact scaffold unchanged. Its report did not reveal the mismatch.

**How to apply:** When a completed build still displays the scaffold, compare actual file locations first rather than repeatedly restarting or investigating proxy routing.