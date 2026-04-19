# Security Specification for PenaRapi

## Data Invariants
1. A Chapter cannot exist without a parent Project.
2. Only the owner of a Project can read or write its metadata and chapters.
3. Timestamps (createdAt, updatedAt) must be server-generated.
4. Project ownerId must match the authenticated user's UID and be immutable.

## The "Dirty Dozen" Payloads (Denial Expected)
1. **Unauthenticated Read**: Attempting to read `projects/123` without logging in.
2. **Identity Spoofing**: Creating a project with `ownerId: "someone_else"`.
3. **Privilege Escalation**: Reading `projects/victim_project` as `attacker_user`.
4. **Shadow Field Injection**: Adding `isAdmin: true` to a project document.
5. **Timestamp Trust**: Sending a manual `updatedAt` string from the client.
6. **Orphan Chapter**: Writing to `projects/123/chapters/abc` when `projects/123` does not exist or belongs to someone else.
7. **Resource Poisoning**: Sending a 1MB string as a `projectId`.
8. **Size Bypass**: Sending a 2MB chapter content (Firestore limit is 1MB anyway, but we should cap strings).
9. **Bulk Scrape**: Attempting `db.collection('projects').get()` without a filter.
10. **Immutable Field Edit**: Changing the `ownerId` of an existing project.
11. **Format Violation**: Sending a number where a string title is expected.
12. **Status Shortcut**: (N/A for first pass, but good for future state flags).

## The Test Runner
Tests will verify that all above payloads return `PERMISSION_DENIED`.
