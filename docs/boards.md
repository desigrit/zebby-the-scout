# Boards (Beta)

Use **Add boards** to save public careers searches, including their filters. Paste one link per line, optionally enter a company and describe the roles you want. For example, “Look under the Product heading for product manager roles.” **Add and check** saves a starting point with zero new listings. Future checks count matching jobs when Zebby first sees them. **Mark as reviewed** clears the discoveries you have seen.

Zebby collects every results page before comparing job IDs. On Netflix, each batch must confirm the saved filters and the final count. On Figma, the reader captures the department heading and vacancy title. Changing a link or tracking instructions starts a new baseline. An interrupted or incomplete scan keeps its previous successful check.

## Storage

Choose your Applications file at setup. If it is named `Job Search.sqlite` or `Job Search.db`, Boards uses `Job Search-boards.sqlite` in the same folder. Settings shows both paths. Wait for both files to sync before switching computers.

To reuse your beta history, finish any pending save and close the beta. Copy its saved Boards file beside the Applications file with the companion name before opening the workspace. If an empty companion already exists, choose **Import Boards history** in Settings. A missing or conflicting companion offers recovery. Existing Applications files retain their schema.

## Analysis and billing

Boards uses your **Analyze with** selection. Verified listing IDs, local comparisons and marking jobs reviewed are free. Some sites need a model to identify navigation or listing links. Tracking instructions can require a model to classify unseen roles.

Personal OpenAI and Anthropic keys bill your provider account directly. Zebby credits use your existing wallet. A single check may use multiple paid batches. Each validated batch appears as **Boards analysis** in credit history. If the next batch needs more credits, choose **Top up**, then **Retry**. Zebby reuses completed batches and only commits the full scan after it succeeds.

The browser reads public pages in an isolated session. The model receives candidate IDs, links, short excerpts and applicable tracking instructions. It can select only observed IDs. See the [privacy guide](privacy.md) for provider and storage details.
