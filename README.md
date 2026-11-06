# User study 1: prompt adherence

A static web page (works on GitHub Pages or from any web server). Participants see 20 pages. Each page
shows a text prompt, the original letter, and three looping animations of that letter made by
different methods, labelled only A, B and C. They pick the animation whose motion best performs the
action in the prompt.

- **Part 1 (10 pages):** the letter may be reshaped toward the prompt and animated.
- **Part 2 (10 pages):** the letter keeps its shape; only the motion differs.

The order of pages within each part, and the order of A/B/C on every page, are randomised per
participant and recorded with the answers.

## Collecting answers

There is no server. At the end each participant downloads a JSON file (or copies the same text) and
sends it to us. Put each file in `responses/` and commit it. Progress is kept in the participant's
browser, so reloading the page does not lose answers.

## Files

- `index.html`, `style.css`, `app.js`: the study page.
- `questions.js`: the prompts and clip files (generated).
- `assets/qNN/`: the original letter (`input.png`) and the three animations, under neutral names
  that do not reveal the method.
- `responses/`: collected answer files.

## Running it locally

From this folder: `python3 -m http.server 8000`, then open http://localhost:8000.
