# Assistive Elicitation Experiment

Static GitHub Pages prototype for the Interior Design Task.

Version 7 changes:
- instruction landing page
- chat-style interaction
- randomized query type, k, and room options
- satisfaction/finalization available after three completed turns
- confirmation before finalizing
- uniform white/black buttons
- one proposed option for single-feature changes
- wall-hung decor only (photo frames, bicycle, bookshelf)
- longer L-shaped sofa
- clearer ceiling lights and chandelier

## Study 1 (`study1.html`)

What people learn about their own taste from seeing rooms. Three blocks in a random order: single rooms, comparisons, and feature tasks (change one thing). Settings are in `CONFIG` at the top of `study1.js`.

### URL options

| Option | What it does |
|---|---|
| `?block=feature` | run only these blocks, in this order, skipping the introduction (e.g. `?block=preference,single`; add `&full=1` to keep it) |
| `?tasks=2` | number of tasks per block (for testing) |
| `?wording=90` | ask for a range people are "90% sure" about instead of "lowest and highest" |
| `?debug=1` | one task per block, no waiting |
| `?viz=1` | the graphs of your answers beside the task |
| `?seed=123` | fixed randomisation |
| `?PROLIFIC_PID=…` or `?pid=…` | the participant ID (otherwise a random ID is made) |

### Saving the data

Each participant's answers are saved as one JSON file named after their ID. Without a server, people are asked to download the file at the end.

To save to a server with [DataPipe](https://pipe.jspsych.org) (free; files go to an OSF project):
1. Create an OSF project and an OSF personal access token (OSF settings → Personal access tokens, scope `osf.full_write`).
2. Sign in at pipe.jspsych.org, add the token, create a new experiment linked to the OSF project, and enable data collection.
3. Copy the experiment ID into `CONFIG.dataPipeId` in `study1.js`.

`CONFIG.saveUrl` can instead point at any endpoint that accepts the data as JSON by POST.
