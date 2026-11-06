# Boards (Beta)

Use **Add boards** to save public careers searches, including their filters. Paste one link per line, optionally enter a company and describe the roles you want. For example, “Look under the Product heading for product manager roles.” **Add and check** shows **Indexing** while saving your starting point. The first complete check has zero new listings.

Each completed check shows its coverage, for example **59 listings checked · 7 match your instructions**. Choose **View matches** or **View listings** to inspect the saved titles, departments and locations. Switch between **Matches**, **New** and **All checked**. Separate posting IDs remain separate listings even when their titles are identical. Opening a listing does not mark it reviewed. **Mark as reviewed** clears the discoveries you have seen, including an unread posting that has since disappeared.

Zebby collects every results page before comparing job IDs. On Netflix, each batch must confirm the saved filters and the final count. On Figma, the reader captures the department heading and vacancy title. Changing a link or tracking instructions starts a new baseline. An interrupted or incomplete scan keeps its previous successful check.

## How pages are read

1. Use a published job feed when it preserves the saved search. Netflix's filtered batches and supported Greenhouse, Lever and Ashby searches provide explicit posting identities. Unknown query parameters and filters prevent a broader feed from replacing your saved search.
2. Read the rendered page when a feed is unavailable or unsuitable. This includes embedded results, open shadow components, headings, scrolling lists and pagination. A model can identify the results document and classify unfamiliar links.
3. Use visual reading when the text leaves jobs or navigation uncertain. Zebby scrolls its isolated browser and sends labelled page screenshots to the selected model. The model can return only links and controls the browser observed. It cannot invent a job URL or click arbitrary page elements.
4. Verify coverage before applying tracking instructions or saving history. Repeated pages, changed filters, contradictory counts and incomplete visual reads leave the last successful check intact.

Visual reading is available with the supported online models or an Ollama model that reports vision support. Downloaded text models continue to handle text-based checks. If a page requires vision, choose a compatible model in Settings and retry. Zebby keeps your selected provider until you change it. Very large or ambiguous boards may need a more specific results link.

## Storage

Choose your Applications file at setup. If it is named `Job Search.sqlite` or `Job Search.db`, Boards uses `Job Search-boards.sqlite` in the same folder. Settings shows both paths. Wait for both files to sync before switching computers.

To reuse your beta history, finish any pending save and close the beta. Copy its saved Boards file beside the Applications file with the companion name before opening the workspace. If an empty companion already exists, choose **Import Boards history** in Settings. If Zebby cannot find a previously opened Boards file, Boards and Settings show its exact filename and folder. Move or copy the file back beside Applications, then choose **Retry**. The filename must match, including spaces.

Choose **Create new Boards file** to start with an empty list. Zebby keeps any cached history in a separate `-saved-` file in that folder before starting fresh. **Import Boards history** in Settings can bring that saved history back. Pending changes must be saved or copied first. A file restored by sync during creation is opened instead of replaced. Existing Applications files retain their schema.

## Analysis and billing

Boards uses your **Analyze with** selection. Fetching pages and feeds, comparing verified IDs and marking jobs reviewed use no AI credits. Some sites need a model to identify the results document, navigation or listing links. Tracking instructions can require a model to classify unseen roles. Visual reading also uses the selected model, with screenshots included in its token quote.

Personal OpenAI and Anthropic keys bill your provider account directly. Zebby credits use your existing wallet. A single check may use multiple paid batches. Each validated batch appears as **Boards analysis** in credit history. If the next batch needs more credits, choose **Top up**, then **Retry**. Zebby reuses completed batches and only commits the full scan after it succeeds.

Screenshots stay in memory during the check. Zebby saves validated results and request hashes so an identical completed batch can be reused after an interruption. A changed page or screenshot can require fresh analysis. See the [privacy guide](privacy.md) for provider and storage details.
