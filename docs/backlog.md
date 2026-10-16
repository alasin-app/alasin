# Backlog

Ideas for future development of Alasin. Add one whenever it comes up; it doesn't have to be complete. When an idea is picked up, it moves into its own pull request (and, if it needs testing by hand, into [manual-tests.md](manual-tests.md)), and is removed from here.

Format: a short title, then a few lines on what and why. Add a date if it helps.

## Ideas

- **Rename and move categories** — rename a category (updating every post that uses it in one commit, with an alias from the old address) and move it under another parent.
- **Media browser** — browse the public media bucket by folder and insert existing images into a post.
- **Theme-styled preview** — preview a post with the site's own styles, and link to the hosting's preview build where there is one.
- **Swipe actions and pull to refresh** — the iOS gestures in the lists (e.g. swipe to delete, pull to read the list again).
- **Offline editing** — keep working without a connection beyond the local autosave, and save when back online.

## Decided against

Ideas that were considered and left out, so they aren't proposed again without a new reason.

- **Maintenance of the site and its media bucket** (e.g. reports or cleanup of images no post uses) — not in the scope of Alasin. Alasin never deletes from the public media bucket.
- **A list of allowed users in the configuration** — who can log in is managed only through the site repository's collaborators on GitHub.
