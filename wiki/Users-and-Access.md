**Everyone with write access to the site repository on GitHub can use the deployment** (write, maintain or admin). Alasin asks GitHub at every login and again about once an hour during a session, so you manage people in one place, on GitHub:

- **Add someone:** invite them to the site repository with **Write** access (the repository's **Settings → Collaborators → Add people**). Once they accept, they open the app's address and sign in with GitHub. Their posts get their GitHub login in `author_id` and their full name from their GitHub profile in `author` (see [Authors](Authors.md)).
- **Remove someone:** remove them from the repository's collaborators (or lower them to *Read*). They're logged out within the hour.
- **Check:** the app's **Users** section (in the sidebar; on phones under *More*) lists everyone who can log in, with their permission on the repository. For the repository's admins it has *Invite on GitHub* and *Remove* buttons, which open the repository's collaborator settings on GitHub; Alasin's GitHub App has no permission to change collaborators itself.

Nothing in `alasin.toml` changes and nothing needs deploying. In a deployment with [several sites](Several-Sites.md), this goes for each site's repository separately: people see the sites they can write for, and someone who loses access to all of them is logged out.

Two more things:

- **The GitHub App must be public** (*Where can this GitHub App be installed?* → *Any account*; for an existing app, its settings → *Advanced* → *Make public*). GitHub shows a private app to nobody but its owner, so nobody else could even sign in. Making it public lets nobody else in: anyone without write access is refused and their token revoked, and the app reaches only the repositories it's installed on.
- **A protected branch:** if `[github] branch` has rules that stop some writers from pushing, their saves fail with GitHub's message. Give them the right on GitHub, or use another branch.
