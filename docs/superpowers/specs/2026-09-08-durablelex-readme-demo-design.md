# DurableLex README Demo Design

## Objective

Update the root README so the DurableLex title is centered, readers can navigate the document from a table of contents, and the demo is presented through GitHub's native attachment player without committing a large video binary to the repository.

## Approved approach

- Render the exact project title with `<h1 align="center">DurableLex — Agentic Contract Intelligence with Temporal</h1>`.
- Add a `Table of contents` section after the introductory system-overview image and before `Why this matters`.
- Link every top-level README section using GitHub-compatible heading anchors. Include the three principal Architecture subsections and avoid listing every numbered setup subsection so the table remains readable.
- Replace the current local demo-video references with one GitHub `user-attachments` URL.
- Keep the Demo copy concise:

  ```markdown
  ## Demo

  The video below shows the contract review workflow in action.

  https://github.com/user-attachments/assets/<generated-id>
  ```

- Put the attachment URL alone in its paragraph so GitHub renders the native video player.

## Video preparation and upload

The source video is `assets/demo.mp4` and is 223,863,079 bytes (213.49 MiB). GitHub does not accept an attachment this large. Compress it to no more than 95,000,000 bytes, using H.264 video and AAC audio for broad browser compatibility.

Upload the compressed MP4 to an issue, pull request, or discussion editor in the target GitHub repository. GitHub uploads the file outside Git history and inserts an anonymized URL beginning with `https://github.com/user-attachments/assets/`. Copy that generated URL into the README.

Because the upload uses the user's GitHub account and changes external state, the local implementation stops after producing the compressed file and README structure if the final generated URL is not yet available. The placeholder must not be committed as a finished README link.

## Scope

- Modify `README.md`.
- Create a compressed derivative of `assets/demo.mp4`; preserve the original source video.
- Do not add either video to Git or Git LFS.
- Do not change application code, diagrams, API documentation, or runtime configuration.

## Verification

- Confirm the compressed video is below 95,000,000 bytes.
- Confirm its video codec is H.264 and its audio codec is AAC when audio is present.
- Confirm every table-of-contents link resolves to an existing heading.
- Confirm the README contains exactly one H1 and it is centered.
- Confirm no local `.mp4` file is staged for commit.
- Run `git diff --check` before completion.
