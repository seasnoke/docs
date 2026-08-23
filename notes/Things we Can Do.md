# Things we Can Do

## GitHub PR command bot

Let users mention SeaSnoke inside a GitHub PR to ask for follow-up work, for example:

```txt
@seasnoke fix the failing check
@seasnoke add tests for this edge case
@seasnoke address the reviewer feedback above
```

Required pieces:

- Enable GitHub App webhooks.
- Add a public webhook endpoint, e.g. `/api/webhooks/github`.
- Verify GitHub webhook signatures.
- Handle comment events:
  - `issue_comment.created`
  - `pull_request_review_comment.created`
  - `pull_request_review.submitted`
- Detect `@seasnoke` commands in PR comments.
- Map the GitHub installation, repo, PR, and branch back to the SeaSnoke tenant/project.
- Create a new SeaSnoke task/run from the command.
- Push follow-up commits to the same PR branch when possible.
- Comment back with status, run link, and final result.

Current state: SeaSnoke can open PRs as the GitHub App bot, but `@seasnoke` comments do not wake it up yet.
