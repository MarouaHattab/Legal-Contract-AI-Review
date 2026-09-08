# DurableLex README Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the DurableLex README title, add reliable document navigation, and embed the existing demo through GitHub's native attachment hosting without adding the video to Git.

**Architecture:** Preserve `assets/demo.mp4` as the 213.49 MiB source, create a temporary H.264/AAC derivative below 95,000,000 bytes, and upload that derivative to the repository's GitHub issue editor to obtain a `user-attachments` URL. Update only `README.md`, using GitHub-compatible HTML and Markdown.

**Tech Stack:** Markdown, PowerShell, FFmpeg/FFprobe, GitHub issue attachments, Git

---

## File structure

- Modify: `README.md` — centered H1, table of contents, and attachment-backed Demo section.
- Preserve: `assets/demo.mp4` — original 223,863,079-byte video; never stage it.
- Create temporarily: `assets/demo-github.mp4` — compressed upload derivative; never stage it.

### Task 1: Prepare the video encoder

**Files:**
- Verify only: `assets/demo.mp4`

- [ ] **Step 1: Confirm the source video and current tool availability**

Run:

```powershell
Get-Item -LiteralPath 'assets/demo.mp4' | Select-Object FullName,Length
Get-Command ffmpeg,ffprobe -ErrorAction SilentlyContinue | Select-Object Name,Source
```

Expected: the source exists with length `223863079`; FFmpeg commands are either listed or absent.

- [ ] **Step 2: Install FFmpeg if the commands are absent**

Run with user approval because this installs system software:

```powershell
choco install ffmpeg -y
```

Expected: Chocolatey reports that FFmpeg was installed successfully. Start a fresh PowerShell process if PATH changes are not visible to the current process.

- [ ] **Step 3: Inspect source streams**

Run:

```powershell
ffprobe -v error -show_entries format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate -of json 'assets/demo.mp4'
```

Expected: valid JSON with one video stream and the source duration.

### Task 2: Produce a GitHub-sized MP4

**Files:**
- Preserve: `assets/demo.mp4`
- Create temporarily: `assets/demo-github.mp4`

- [ ] **Step 1: Calculate a two-pass bitrate for a 95,000,000-byte ceiling**

Run:

```powershell
$duration = [double](ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 'assets/demo.mp4')
$targetBytes = 95000000
$audioBitrate = 128000
$videoBitrate = [math]::Floor((($targetBytes * 8 / $duration) - $audioBitrate) * 0.97)
if ($duration -le 0 -or $videoBitrate -le 0) { throw 'Unable to calculate a valid target bitrate.' }
$videoBitrate
```

Expected: a positive integer video bitrate.

- [ ] **Step 2: Run the first encoding pass**

Run in the same PowerShell session:

```powershell
ffmpeg -y -i 'assets/demo.mp4' -map 0:v:0 -c:v libx264 -preset slow -b:v $videoBitrate -pass 1 -an -f mp4 NUL
```

Expected: FFmpeg exits with code 0 and creates its pass log.

- [ ] **Step 3: Run the second encoding pass**

Run in the same PowerShell session:

```powershell
ffmpeg -y -i 'assets/demo.mp4' -map 0:v:0 -map '0:a?' -c:v libx264 -preset slow -b:v $videoBitrate -pass 2 -c:a aac -b:a 128k -movflags +faststart 'assets/demo-github.mp4'
```

Expected: `assets/demo-github.mp4` is created successfully.

- [ ] **Step 4: Remove exact temporary pass files**

Run:

```powershell
Remove-Item -LiteralPath 'ffmpeg2pass-0.log' -ErrorAction SilentlyContinue
Remove-Item -LiteralPath 'ffmpeg2pass-0.log.mbtree' -ErrorAction SilentlyContinue
```

Expected: the pass files no longer exist; both MP4 files remain.

- [ ] **Step 5: Verify size and codecs**

Run:

```powershell
$output = Get-Item -LiteralPath 'assets/demo-github.mp4'
if ($output.Length -ge 95000000) { throw "Compressed video is too large: $($output.Length) bytes" }
$output | Select-Object FullName,Length,@{Name='SizeMiB';Expression={[math]::Round($_.Length/1MB,2)}}
ffprobe -v error -show_entries stream=codec_name,codec_type -of json 'assets/demo-github.mp4'
```

Expected: fewer than `95000000` bytes, H.264 video, and AAC audio when the source contains audio.

### Task 3: Upload through GitHub's attachment host

**Files:**
- Upload only: `assets/demo-github.mp4`

- [ ] **Step 1: Open the target repository's new-issue editor**

Open:

```text
https://github.com/MarouaHattab/Hierarchical-RL-Agents-for-Legal-Contract-Analysis/issues/new
```

Expected: the authenticated GitHub issue editor appears.

- [ ] **Step 2: Attach the compressed video**

Drag `C:\Users\MSI\Desktop\temporal-101\assets\demo-github.mp4` into the issue body, or use the editor's file attachment control. Wait until GitHub replaces the local filename with a URL matching:

Expected: GitHub reports a completed upload and the issue body contains one generated attachment URL beginning with `https://github.com/user-attachments/assets/`. Copy that runtime URL exactly; submitting the issue is unnecessary.

### Task 4: Update the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Center the title**

Replace line 1 with:

```html
<h1 align="center">DurableLex — Agentic Contract Intelligence with Temporal</h1>
```

- [ ] **Step 2: Add the table of contents after the system-overview image**

Insert:

```markdown
## Table of contents

- [Why this matters](#why-this-matters)
- [Project at a glance](#project-at-a-glance)
- [What I built](#what-i-built)
- [Demo](#demo)
- [Architecture](#architecture)
  - [System boundaries](#system-boundaries)
  - [Task queues and worker isolation](#task-queues-and-worker-isolation)
- [PDF extraction workflow](#pdf-extraction-workflow)
- [Contract review workflow](#contract-review-workflow)
  - [Parallel document analysis](#1-parallel-document-analysis)
  - [Cross-contract synthesis](#2-cross-contract-synthesis)
  - [Human review](#3-human-review)
  - [Complete execution story](#complete-execution-story)
- [Reliability model](#reliability-model)
- [API](#api)
- [Run the project](#run-the-project)
- [Example contract review request](#example-contract-review-request)
- [Project structure](#project-structure)
- [Engineering decisions](#engineering-decisions)
- [Current limits](#current-limits)
- [Skills demonstrated](#skills-demonstrated)
- [Stack](#stack)
```

- [ ] **Step 3: Replace both stale local demo references**

Replace the opening `Video demo` destination and the current Demo-section body with the exact GitHub attachment URL copied in Task 3. The Demo section must have this shape, with the runtime URL alone in its paragraph:

The final section must contain the `## Demo` heading, the exact sentence `The video below shows the contract review workflow in action.`, and then the generated runtime URL alone in the following paragraph.

Expected: `README.md` contains no reference to `assets/temporal-contract-review-demo.mp4`, and its attachment URL matches `^https://github\.com/user-attachments/assets/[0-9a-f-]+$`.

### Task 5: Verify and commit the README

**Files:**
- Verify: `README.md`
- Exclude: `assets/demo.mp4`
- Exclude: `assets/demo-github.mp4`

- [ ] **Step 1: Verify the README structure and links**

Run:

```powershell
rg -n '^# |<h1|^## |user-attachments|assets/.*\.mp4' README.md
git diff --check
```

Expected: exactly one centered H1, a `Table of contents` section, one generated `user-attachments` URL used in the opening link and Demo section, no local MP4 reference, and no whitespace errors.

- [ ] **Step 2: Verify MP4 files are not staged**

Run:

```powershell
git status --short
git diff --cached --name-only
```

Expected: neither `assets/demo.mp4` nor `assets/demo-github.mp4` is staged.

- [ ] **Step 3: Commit only the README**

Run:

```powershell
git add -- README.md
git commit -m "docs: add README navigation and demo video"
```

Expected: one commit containing only `README.md`.
