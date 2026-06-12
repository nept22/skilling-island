# skilling-island

A Three.js skilling game. Work happens across **two Claude sessions** that share this
one repo:

- **Builder** (Sonnet) — implements features, writes the game code.
- **Thinker** (Opus) — design, reasoning, architecture, and shipping dev updates.

## Dev updates / changelog — read this, it's how the two sessions stay in sync

The changelog is sourced from **git commits**, not from chat history. This is the only
thing that keeps both sessions' work in one place: whatever you commit shows up in the
next Discord update, no matter which session did it.

### Rule 1 — every meaningful change must be a commit

Before you finish a unit of work, **commit it**. Uncommitted work is invisible to the
changelog and will be lost from the dev update. Prefix every commit subject with the
session that did it:

```
[builder] Add water shader to the island mesh
[thinker] Rework skill-progression curve to be logarithmic
```

The `[builder]` / `[thinker]` prefix is what groups the changelog by author. Use
`[builder]` in the Sonnet session and `[thinker]` in the Opus session.

**Before a session ends (especially when context is running low), commit everything.**
Sessions don't carry over — only git does. Committed work is visible to every future
session and to the changelog; work left only in the chat dies with that session. When
wrapping up or near a full context window, commit all outstanding changes first.

### Rule 2 — never POST to Discord yourself

Do **not** call the Discord webhook directly from either session, and do not add
auto-posting hooks. Posting is a single, deliberate step run only when the user asks
to "ship the changelog." This prevents split/duplicate updates.

### Rule 3 — shipping (thinker session, on user request only)

When the user says to ship the changelog:

```
npm run ship          # post everything since the last update to Discord
npm run ship -- --dry # preview the post without sending
```

`ship` reads `last-changelog..HEAD`, posts one grouped update to Discord, appends it to
`CHANGELOG.md`, and moves the `last-changelog` git tag to HEAD. Commit the updated
`CHANGELOG.md` + tag afterward so the marker stays in sync across sessions.

The webhook URL lives in `.dev/discord-webhook` (gitignored — never commit it).
