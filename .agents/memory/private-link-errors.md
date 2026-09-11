---
name: Private-link error handling
description: Show revoked, expired and wrong-account access states promptly in recipient experiences.
---

Treat terminal authorization failures as a visible end state, not a transient loading state.

**Why:** During real multi-account testing, automatic query retries delayed wrong-account and revoked-link messages enough to look like indefinite loading despite correct server protection. Server denial alone is not a complete recipient experience.

**How to apply:** For future private-sharing screens, avoid retrying terminal 4xx responses, remove stale private controls when access fails, and distinguish these failures from retryable network errors. Verify both first navigation and revocation after content has already loaded.

Account changes must invalidate local contexts and already-rendered private media, not only query caches.

**Why:** An auth listener clearing the shared cache can still leave account-scoped drafts and images visible when they are held in independent React state.

**How to apply:** Bind private provider lifetimes to identity and ignore in-flight responses after that scope changes.