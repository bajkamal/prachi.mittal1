# Prachi Mittal — Portfolio

A communication design portfolio site. Static HTML/CSS/JS, no build step — open `index.html` directly or serve the folder with any static file server.

## Pages

| File | Section |
|---|---|
| `index.html` | Home — hero, About, Philosophy, Projects reel, Testimonials, Contact |
| `branding.html` | Branding case studies — Common Ground, BGL |
| `editorial.html` | Campaign case studies — Hamleys, Mattel Barbie |
| `motion.html` | Packaging case study — Toblerone |
| `research.html` | Research placeholder |

## Structure

```
index.html, branding.html, editorial.html, motion.html, research.html
styles.css
script.js
assets/
  logo.png, portrait.jpg, favicon.svg
  hero-tiles/        — homepage hero spiral images
  illustrations/      — decorative illustrations (About, WHY sections)
  tv/                  — WHY section showreel + frame graphic
  common-ground/       — Common Ground case study assets
  bgl/                 — BGL case study assets
  toblerone/           — Toblerone case study assets
  hamleys/             — Hamleys campaign assets
  barbie/              — Barbie campaign video
```

## Stack

GSAP 3 (ScrollTrigger, SplitText) + Lenis smooth scroll, loaded via CDN — no bundler or package manager needed.

## Local preview

```bash
python3 -m http.server 8000
```

then open `http://localhost:8000`.
