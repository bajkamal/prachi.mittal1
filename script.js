(() => {
  // The nav itself no longer collapses (see .primary-nav__categories
  // in styles.css — always visible now that it's just 4 short links),
  // but this breakpoint still gates the magnetic-nav hover behavior
  // and the spiral tiles' mobile timeScale/hide adjustment below.
  const STACK_BP = 720;

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const prefersReducedMotion = () => reduceMotionQuery.matches;

  // Set inside initLenis when a Lenis instance actually exists (desktop,
  // fine pointer, motion not reduced) — nav-link smooth-scroll-to-anchor
  // uses this instead of window.scrollTo so it drives the same smoothed
  // scroll everything else on the page already goes through, instead of
  // the two fighting over the scroll position each frame.
  let lenisInstance = null;

  gsap.registerPlugin(...[window.ScrollTrigger, window.SplitText].filter(Boolean));

  /* ---------------- Header theme swap (glass navbar over dark marquee) ----------------
     .site-header is fixed at the very top of the viewport, so it can
     end up sitting over any section as the page scrolls — including
     .projects-strip's dark band, where the header's light glass tint
     would otherwise pick up that dark color through backdrop-filter
     and read as a muddy gray. An IntersectionObserver watches
     whether .projects-strip currently overlaps just the header's own
     height at the top of the viewport (via a negative rootMargin
     that shrinks the observed area down to that band) and toggles
     .site-header--on-dark accordingly — cheaper than a scroll
     listener, and it naturally recomputes on resize. */
  function initHeaderTheme() {
    const header = document.querySelector('.site-header');
    const inner = document.querySelector('.site-header__inner');
    const logo = document.querySelector('.logo');
    const navLinks = Array.from(document.querySelectorAll('.nav-link'));
    const darkSection = document.querySelector('.projects-strip');
    if (!header || !inner || !darkSection || typeof IntersectionObserver === 'undefined') return;

    // Applied as inline styles directly (not a toggled class) — the
    // relevant CSS transitions (.site-header__inner's background/
    // border-color, .nav-link's color) still animate these smoothly
    // since transitions apply to inline style changes too.
    function applyDark(isDark) {
      inner.style.background = isDark ? 'rgba(33, 26, 20, 0.55)' : '';
      inner.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.14)' : '';
      if (logo) logo.style.color = isDark ? 'var(--color-on-ink)' : '';
      navLinks.forEach((link) => {
        link.style.color = isDark ? 'var(--color-on-ink)' : '';
      });
    }

    let observer;
    const setup = () => {
      if (observer) observer.disconnect();
      const headerHeight = Math.ceil(header.getBoundingClientRect().height) || 80;
      // innerHeight can be unreliable this early (some environments
      // report 0 before first layout) — a non-finite bottom margin
      // makes the IntersectionObserver constructor throw, which would
      // otherwise abort every init call still queued after this one.
      const bottomMargin = Number.isFinite(window.innerHeight) ? Math.max(0, window.innerHeight - headerHeight) : 0;
      observer = new IntersectionObserver(
        ([entry]) => applyDark(entry.isIntersecting),
        { rootMargin: `0px 0px -${bottomMargin}px 0px`, threshold: 0 }
      );
      observer.observe(darkSection);
    };

    setup();

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(setup, 200);
    });
  }

  /* ---------------- Mobile nav dropdown (hamburger toggle) ----------------
     Guarded on .nav-toggle so this is a no-op if it's ever missing.
     aria-expanded on the button is still the real accessibility state,
     but the dropdown's actual visibility is driven by inline styles
     set directly here rather than the [aria-expanded="true"] ~ CSS
     rule in styles.css alone — same reasoning already established on
     this site's .site-header--on-dark (see that comment): a state
     change expressed purely through a CSS attribute-selector cascade
     doesn't reliably take effect in the WebKit build used for this
     site's own screenshot QA despite correct specificity, where a
     direct inline style always does. The CSS rule stays in place as
     the semantic baseline for any environment without that quirk;
     this is belt-and-suspenders on top of it, not a replacement.
     Closes on: clicking a link (so an in-page #anchor click doesn't
     leave the dropdown sitting open over the section it just jumped
     to), clicking outside the header, and Escape — all standard
     dropdown-menu expectations, not just "click the button again". */
  function initNavToggle() {
    const toggle = document.querySelector('.nav-toggle');
    const header = document.querySelector('.site-header');
    const list = document.getElementById('primary-nav-list');
    if (!toggle || !header) return;

    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      if (list) {
        list.style.opacity = open ? '1' : '0';
        list.style.transform = open ? 'translateY(0)' : 'translateY(-8px)';
        list.style.pointerEvents = open ? 'auto' : 'none';
      }
    };

    toggle.addEventListener('click', () => {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    // Guarded the same way as the click-outside/Escape handlers below —
    // setOpen(false) writes inline opacity/transform/pointer-events onto
    // #primary-nav-list, which isn't scoped to the mobile media query,
    // so calling it unconditionally on every nav-link click (including
    // on desktop, where aria-expanded never becomes "true" since the
    // hamburger button is display:none and unclickable there) baked in
    // permanent inline opacity:0/pointer-events:none the first time
    // anyone clicked Project/About Me/Resume/Contact — hiding the whole
    // desktop nav list for the rest of the session with no way for CSS
    // to override it back.
    header.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        if (toggle.getAttribute('aria-expanded') === 'true') setOpen(false);
      });
    });

    document.addEventListener('click', (event) => {
      if (toggle.getAttribute('aria-expanded') === 'true' && !header.contains(event.target)) {
        setOpen(false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });

    // setOpen's inline styles only mean anything at the mobile
    // breakpoint where .nav-toggle is even visible — but they're
    // written directly onto #primary-nav-list with no media-query
    // scoping of their own, so closing the menu on mobile (a real tap,
    // or the click-outside/Escape handlers above) leaves an inline
    // opacity:0/pointer-events:none sitting on it. That's invisible
    // until the viewport crosses back above 640px WITHOUT a full page
    // reload — a phone rotated to landscape, a foldable, a desktop
    // window resized wider — at which point .nav-toggle itself becomes
    // display:none (no hamburger left to reopen it with), while the
    // leftover inline styles keep silently hiding the now-desktop nav
    // list forever: "I clicked somewhere and the four options
    // disappeared." Clearing the inline overrides the instant the
    // breakpoint is crossed hands rendering back to the desktop CSS,
    // which never had an opacity rule to override in the first place.
    const mobileMq = window.matchMedia('(max-width: 640px)');
    const clearInlineStateIfDesktop = (isMobile) => {
      if (isMobile) return;
      toggle.setAttribute('aria-expanded', 'false');
      if (list) {
        list.style.opacity = '';
        list.style.transform = '';
        list.style.pointerEvents = '';
      }
    };
    clearInlineStateIfDesktop(mobileMq.matches);
    mobileMq.addEventListener('change', (e) => clearInlineStateIfDesktop(e.matches));
  }

  /* ---------------- Magnetic nav links (desktop hover only) ---------------- */
  function initMagneticNav() {
    const links = gsap.utils.toArray('.nav-link');
    if (!links.length) return;
    const mq = window.matchMedia(`(min-width: ${STACK_BP}px) and (hover: hover) and (pointer: fine)`);
    const setters = new Map();
    let active = false;

    function onMove(e) {
      const link = e.currentTarget;
      const rect = link.getBoundingClientRect();
      const relX = e.clientX - (rect.left + rect.width / 2);
      const relY = e.clientY - (rect.top + rect.height / 2);
      const s = setters.get(link);
      if (!s) return;
      s.qx(relX * 0.35);
      s.qy(relY * 0.6);
    }
    function onLeave(e) {
      const s = setters.get(e.currentTarget);
      if (!s) return;
      s.qx(0);
      s.qy(0);
    }

    function enable() {
      if (active || prefersReducedMotion()) return;
      active = true;
      links.forEach((link) => {
        setters.set(link, {
          qx: gsap.quickTo(link, 'x', { duration: 0.35, ease: 'power3.out' }),
          qy: gsap.quickTo(link, 'y', { duration: 0.35, ease: 'power3.out' }),
        });
        link.addEventListener('mousemove', onMove);
        link.addEventListener('mouseleave', onLeave);
      });
    }
    function disable() {
      active = false;
      links.forEach((link) => {
        link.removeEventListener('mousemove', onMove);
        link.removeEventListener('mouseleave', onLeave);
        gsap.set(link, { x: 0, y: 0 });
      });
      setters.clear();
    }

    mq.addEventListener('change', () => (mq.matches ? enable() : disable()));
    if (mq.matches) enable();
  }

  /* ---------------- Lenis smooth scroll ---------------- */
  function initLenis() {
    const pointerFine = window.matchMedia('(pointer: fine)').matches;
    if (!pointerFine || prefersReducedMotion() || typeof window.Lenis === 'undefined') return;

    const lenis = new window.Lenis({ smoothWheel: true, syncTouch: false });
    lenisInstance = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    // Lenis measures the page's scrollable height once on init and never
    // re-checks it on its own. Every pinned section (philosophy, the
    // projects reel) inserts a tall pin-spacer via ScrollTrigger *after*
    // that initial measurement, so without this Lenis's cached scroll
    // limit falls badly short of the real document height — scrolling
    // would hard-stop partway through a pinned section (reads as a
    // "clash" there, with dead space below it that's never reachable).
    // Re-measuring on every ScrollTrigger refresh (initial layout, the
    // fonts.ready refresh, resize) keeps the two in sync.
    ScrollTrigger.addEventListener('refresh', () => lenis.resize());
  }

  /* ---------------- Hero entrance ---------------- */
  function initEntrance() {
    const header = document.querySelector('.site-header__inner');
    const headline = document.querySelector('.hero__headline');

    if (prefersReducedMotion()) {
      gsap.set([header, headline], { opacity: 1, clearProps: 'scale,y,filter' });
      return;
    }

    // navbar: fade in + settle down from -18px while sharpening out of
    // a slight blur — a soft optical "focus pull," not a spring/bounce
    if (header) {
      gsap.set(header, { opacity: 0, y: -18, filter: 'blur(6px)' });
      gsap.to(header, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8, ease: 'power3.out' });
    }

    // headline blurs in on load, same "focus pull" as the navbar above —
    // plays once automatically, not tied to scroll. .hero already has
    // its own CSS position:sticky (see styles.css) for staying in place
    // while .why-section slides over it — no separate GSAP pin needed
    // or wanted here; a second, ScrollTrigger-driven pin on the same
    // element fights that CSS sticky behavior and is what was causing
    // this and other scroll-driven elements elsewhere on the page to
    // read their positions against a shifting, inconsistent layout.
    if (typeof SplitText !== 'undefined' && headline) {
      const split = new SplitText(headline, { type: 'words', wordsClass: 'word' });
      gsap.set(split.words, { filter: 'blur(10px)' });

      gsap.to(split.words, {
        filter: 'blur(0px)',
        duration: 1,
        stagger: 0.05,
        ease: 'power3.out',
      });
    } else if (headline) {
      gsap.set(headline, { filter: 'blur(10px)' });

      gsap.to(headline, {
        filter: 'blur(0px)',
        duration: 1,
        ease: 'power3.out',
      });
    }
  }

  /* ---------------- Spiral background layer ----------------
     Ported from the client-supplied reference implementations
     (portfolio_hero (12).html / (13).html) — every constant matches
     literally: 24 tiles, 3.5 revolutions, 0.008 speed, 0.15/0.9 fade
     thresholds, maxR=1000, theta+90 rotation, the radial-gradient
     edge-fade mask (on .spiral-field in styles.css). No safety floor
     on maxR — it's the literal reference value, scaled proportionally
     for viewport width since the reference itself has no responsive
     handling at all (fixed 1000px/176px, no media queries). Because
     it's literal, tiles CAN pass behind the headline at typical
     desktop widths before fading out (u<0.15) — that's a direct
     consequence of matching the reference exactly on a site with a
     wider headline than the reference's demo copy, not a bug.
     The one thing the reference didn't handle is responsiveness — so
     maxR and tile size (in CSS) are scaled by viewport width instead
     of hardcoded, reaching those exact reference values at a 1440px
     baseline and scaling fluidly below it, the same way the rest of
     this codebase handles responsive sizing (clamp()-style, not a
     breakpoint snap).

     Each tile has one fixed starting offset (initialU = i/N). Every
     frame:
       u     = (initialU - globalProgress) mod 1   — counts down, so
                                                       a tile drifts
                                                       from edge to
                                                       centre as time
                                                       advances, then
                                                       wraps
       t     = sqrt(u)
       r     = maxR * t                             — 0 at the centre
       theta = (1-t) * REVOLUTIONS * 2π              — angular sweep
                                                       accelerates as
                                                       r shrinks, the
                                                       "water down a
                                                       drain" curve
       x,y   = cos(theta)*r, sin(theta)*r
     Rotation is set to theta+90 directly every frame (not a fixed
     tilt) — tiles visibly spin as they travel, edge-first toward the
     centre, matching the reference's path-aligned rotation exactly.
     Opacity ramps in just after spawning (u just under 1) and back
     out just before reaching the centre (u under 0.15). The edge-fade
     vignette (radial-gradient mask on .spiral-field in styles.css,
     also lifted from the reference) handles the rest of the fade-out
     as tiles approach the hero's boundary — no extra wrapper element,
     applied directly to the existing container.

     zIndex follows r (nearer/larger tiles on top) — the reference
     left stacking to DOM order, this makes depth deterministic
     instead of arbitrary. */
  function initSpiralField() {
    const field = document.querySelector('.spiral-field');
    const tiles = gsap.utils.toArray('.spiral-tile');
    if (!field || !tiles.length) return;

    // was 3.5/1000 (the reference's exact values) — on a laptop-width
    // hero the 40 tiles read as thin/widely-gapped rings around a
    // large empty core; one extra loop plus a smaller max radius packs
    // the same tile count into a visibly denser, more filled circle
    // instead of just spreading the existing gaps further out
    const REVOLUTIONS = 4;
    const CYCLE_SPEED = 0.008; // progress units/sec, matches reference exactly — 125s per full loop
    // tightened back down (was 0.3/0.72, widened from the reference's
    // 0.15/0.9 for the old flat-color tiles) — now that tiles carry
    // real photo thumbnails, spending over half of every cycle mid-
    // fade read as permanently washed-out/low-opacity rather than a
    // deliberate spawn/despawn moment, per direct request to fix that
    const FADE_IN_END = 0.05; // u threshold
    const FADE_OUT_START = 0.95; // u threshold
    // Below this width, tiles fade to fully transparent much earlier in
    // their inward journey — per direct request, after a first attempt
    // that instead raised a hard minimum radius read as wrong: that
    // compressed the *whole* 0..maxR range the spiral operates over,
    // which squashed all four revolutions' rings together into one
    // dense blob instead of the loose, separated "rabbit hole" loops
    // this is supposed to read as. This way the geometry (radius,
    // revolutions, ring spacing) is untouched at every width — tiles
    // still travel the full path to r=0 like always — only *how much
    // of that final stretch is invisible* changes, so the mobile hero
    // still reads as the same spiral, just with its innermost tiles
    // faded out early enough to clear the centered text.
    const MOBILE_BREAKPOINT = 640;
    const MOBILE_FADE_IN_END = 0.45;
    const REFERENCE_VIEWPORT = 1440; // width at which maxR hits the reference's own scale
    const REFERENCE_MAX_R = 900; // was 1000 (reference's exact value), pulled in to 820 then eased back out a bit — 820/4.5 packed noticeably denser than intended, this is the middle ground

    let half = 0;
    let maxR = 0;
    let fadeInEnd = FADE_IN_END;

    function measure() {
      const rect = field.getBoundingClientRect();
      half = tiles[0].offsetWidth / 2;
      // literal proportional scaling of the reference's fixed 1000 —
      // this IS exactly 1000 at a 1440px hero, same as the file
      maxR = REFERENCE_MAX_R * (rect.width / REFERENCE_VIEWPORT);
      fadeInEnd = rect.width <= MOBILE_BREAKPOINT ? MOBILE_FADE_IN_END : FADE_IN_END;
    }
    measure();

    // Fixed starting offset per tile, rolled once, read forever.
    const entries = tiles.map((tile, i) => ({
      tile,
      initialU: i / tiles.length,
    }));

    function apply(entry, globalProgress) {
      let u = (entry.initialU - globalProgress) % 1;
      if (u < 0) u += 1;

      const t = Math.sqrt(u);
      const r = maxR * t;
      const theta = (1 - t) * REVOLUTIONS * Math.PI * 2;

      const x = Math.cos(theta) * r;
      const y = Math.sin(theta) * r;
      // +90 so a tile's edge faces the center as it travels, not its
      // face — matches the reference's path-aligned rotation exactly
      const rotationDeg = theta * (180 / Math.PI) + 90;

      let opacity = 1;
      if (u < fadeInEnd) opacity = u / fadeInEnd;
      else if (u > FADE_OUT_START) opacity = (1 - u) / (1 - FADE_OUT_START);

      gsap.set(entry.tile, {
        x: x - half,
        y: y - half,
        rotate: rotationDeg,
        opacity: Math.max(0, opacity),
        zIndex: Math.round(r),
      });
    }

    if (prefersReducedMotion()) {
      entries.forEach((entry) => {
        apply(entry, 0);
        gsap.set(entry.tile, { opacity: 1 }); // static frame — no motion to hide via fade
      });
      return;
    }

    let elapsed = 0;
    let lastTime = performance.now();
    let baseSpeed = 1;

    // Constant rotation, always — deliberately not tied to scroll or
    // cursor/hover: the loop spins at the same baseSpeed regardless of
    // user input, so it never speeds up, slows down, or pauses.
    function tick() {
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      elapsed += delta * baseSpeed;
      const globalProgress = elapsed * CYCLE_SPEED;
      entries.forEach((entry) => apply(entry, globalProgress));
    }
    gsap.ticker.add(tick);

    function applyMobileAdjust() {
      baseSpeed = window.innerWidth < STACK_BP ? 0.6 : 1;
    }
    applyMobileAdjust();

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        measure();
        applyMobileAdjust();
      }, 200);
    });
  }

  /* ---------------- Scroll reveals (pink section) ----------------
     "WHY?" pops in character-by-character with a slight random tilt
     and back-ease overshoot — a kinetic, confident entrance for a
     short display word. The statement follows as characters sliding
     up while sharpening out of a blur, echoing the same blur-focus
     language as the navbar's own entrance for consistency. Both use
     SplitText (already loaded for the hero headline) rather than
     animating the whole line as one block.

     The statement's characters also sit on a static arc (independent
     of the reveal animation below) that echoes the dip in
     .projects-viewport's hourglass mask directly beneath this text —
     per the ask, the statement should visually follow the same curve
     as the marquee's pinched top edge, not sit on a flat baseline
     above it. That arc lives on SplitText's own per-char span (set
     once, never animated); a second, manually-created span nested
     inside each one carries GSAP's reveal transform, so the static
     curve and the animated slide-up never fight over the same
     `transform` property on the same element. The arc math treats the
     sentence as one continuous line from t=0 to t=1, so it only makes
     sense while the statement actually fits on one line — checked via
     each char's pre-transform offsetTop (transform doesn't affect
     layout, so this reads the real, untransformed line the browser
     wrapped it to) before committing to the curve. fitWhyStatement,
     called first below, is what guarantees that condition at every
     viewport width now (see its own comment) — per direct request,
     the arc should never degrade to a flat baseline, not even on the
     narrowest phones. */
  function fitWhyStatement() {
    const statement = document.querySelector('.why-statement');
    // .why-pause (not statement.parentElement, .why-grid) is the
    // measurement reference — .why-pause has this section's real,
    // padding-defined width (padding-inline: var(--container-pad)),
    // while .why-grid is a plain display:flex block with no explicit
    // width of its own, so it just shrink-wraps to fit its content
    // (the statement plus the two flanking icons) — measuring *that*
    // to decide the statement's own size is circular: shrink the
    // text, .why-grid shrinks too, so the "available width" the next
    // measurement sees keeps moving, and it can settle short of
    // actually fitting. .why-pause's width is real, layout-level
    // padding, not shrink-wrapped around anything below it.
    const pause = statement && statement.closest('.why-pause');
    if (!statement || !pause) return;

    // Reset to the CSS-authored size first so repeat calls (resize,
    // orientation change) measure fresh rather than compounding
    // shrinkage from a previous, narrower measurement.
    statement.style.fontSize = '';

    // clientWidth (not getBoundingClientRect().width) so .why-pause's
    // own padding-inline is already excluded — what's left is the
    // real space available for its centered content row.
    let availableWidth = pause.clientWidth;
    // The two .why-statement__icon flank the text as flex siblings
    // inside .why-grid (gap between each) — leaving those out of
    // "available width" would let the icons push the whole row wider
    // than .why-pause even once the text itself technically fits.
    const icons = pause.querySelectorAll('.why-statement__icon');
    const gap = parseFloat(getComputedStyle(statement.parentElement).columnGap) || 0;
    icons.forEach((icon) => {
      availableWidth -= icon.getBoundingClientRect().width + gap;
    });

    const naturalWidth = statement.scrollWidth; // CSS already sets white-space:nowrap
    if (naturalWidth <= availableWidth || naturalWidth === 0) return;

    // Measured against the real rendered width rather than a hand-
    // tuned CSS clamp() — this sentence's exact character widths at
    // this exact font/weight aren't something a linear vw-based guess
    // reproduces precisely at every width, and a guess that's ever
    // even slightly too generous would let it wrap again right when
    // it's least visible (deep in testing on one specific device). A
    // small (0.97) margin so it doesn't sit pixel-perfect against the
    // container edge.
    const cssSize = parseFloat(getComputedStyle(statement).fontSize);
    const fitSize = cssSize * (availableWidth / naturalWidth) * 0.97;
    statement.style.fontSize = `${fitSize}px`;
  }

  function initScrollReveals() {
    fitWhyStatement();
    const whyHeading = document.querySelector('.why-heading');
    const statement = document.querySelector('.why-statement');
    if (!whyHeading && !statement) return;

    const canSplit = typeof SplitText !== 'undefined';
    // 'words, chars' (not just 'chars') — SplitText wraps each *word*
    // in its own inline-block div first, then splits chars inside
    // that. Splitting straight to chars left every character as its
    // own independent inline-block with nothing tying same-word
    // characters together, so on narrower viewports (where this no
    // longer fits one line) the browser was free to wrap between any
    // two characters, including mid-word. The word-level wrapper is
    // what makes a word an atomic, unbreakable unit for line-wrapping
    // again, same as plain text — the per-char split/animation below
    // is unaffected either way, still one span per character.
    const statementSplit = canSplit && statement ? new SplitText(statement, { type: 'words, chars' }) : null;
    const statementChars = statementSplit ? statementSplit.chars : [];
    const isSingleLine = statementChars.length > 1
      && statementChars.every((c) => Math.abs(c.offsetTop - statementChars[0].offsetTop) < 2);

    const ARC_DIP = 14; // px, how far the middle characters drop below the ends
    const ARC_TILT = 8; // deg, how far the end characters tilt to follow the curve
    const statementInnerTargets = statementChars.map((charEl, i) => {
      const t = statementChars.length > 1 ? (i + 0.5) / statementChars.length : 0.5;
      charEl.style.display = 'inline-block';
      if (isSingleLine) {
        charEl.style.transform = `translateY(${ARC_DIP * Math.sin(t * Math.PI)}px) rotate(${ARC_TILT * Math.cos(t * Math.PI)}deg)`;
      }
      const inner = document.createElement('span');
      inner.style.display = 'inline-block';
      inner.textContent = charEl.textContent;
      charEl.textContent = '';
      charEl.appendChild(inner);
      return inner;
    });

    if (prefersReducedMotion()) {
      gsap.set([whyHeading, ...statementInnerTargets].filter(Boolean), { opacity: 1, clearProps: 'y,scale,rotate,filter' });
      return;
    }

    const headingSplit = canSplit && whyHeading ? new SplitText(whyHeading, { type: 'chars' }) : null;
    const headingTargets = headingSplit ? headingSplit.chars : [whyHeading].filter(Boolean);
    const statementTargets = statementInnerTargets.length ? statementInnerTargets : [statement].filter(Boolean);
    if (!headingTargets.length && !statementTargets.length) return;

    gsap.set(headingTargets, { opacity: 0, y: 40, scale: 0.7, rotate: () => gsap.utils.random(-8, 8) });
    gsap.set(statementTargets, { opacity: 0, y: 10, filter: 'blur(6px)' });

    // ---- "curious" letters: once the pop-in has actually settled,
    // each character of "WHY?" leans/tilts away from the cursor as it
    // passes nearby, like it's flinching in surprise — a small bit of
    // personality on top of a heading that otherwise just sits there
    // once revealed. Desktop/mouse only (pointer:fine, same gating as
    // the custom cursor); a plain quickTo per char driving x/y/rotate,
    // which is safe to hand control of those same properties to *after*
    // the entrance tween above has finished with them (see
    // enableMagnetic below — never active while that tween is running).
    let enableMagnetic = () => {};
    if (headingTargets.length && window.matchMedia('(pointer: fine)').matches) {
      const REPEL_RADIUS = 90; // px — how close the cursor has to get
      const REPEL_STRENGTH = 26; // px — how far a fully-close char shifts
      const quickX = headingTargets.map((el) => gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' }));
      const quickY = headingTargets.map((el) => gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' }));
      const quickRotate = headingTargets.map((el) => gsap.quickTo(el, 'rotate', { duration: 0.5, ease: 'power3.out' }));
      let active = false;
      enableMagnetic = () => { active = true; };
      window.addEventListener('mousemove', (e) => {
        if (!active) return;
        headingTargets.forEach((el, i) => {
          const rect = el.getBoundingClientRect();
          const dx = rect.left + rect.width / 2 - e.clientX;
          const dy = rect.top + rect.height / 2 - e.clientY;
          const dist = Math.hypot(dx, dy);
          if (dist < REPEL_RADIUS) {
            const power = (1 - dist / REPEL_RADIUS) * (REPEL_STRENGTH / (dist || 1));
            quickX[i](dx * power);
            quickY[i](dy * power);
            quickRotate[i](dx * power * 0.4);
          } else {
            quickX[i](0);
            quickY[i](0);
            quickRotate[i](0);
          }
        });
      });
    }

    // Plain trigger-once reveal — no pin, no scroll-locking. The
    // scroll choreography (pausing mid-section, scrubbing the reveal
    // to scroll position, etc.) is deferred; this just plays once
    // when the section comes into view.
    ScrollTrigger.create({
      trigger: '.why-section',
      start: 'top 70%',
      once: true,
      onEnter: () => {
        gsap.timeline({ onComplete: enableMagnetic })
          .to(headingTargets, {
            opacity: 1,
            y: 0,
            scale: 1,
            rotate: 0,
            duration: 0.9,
            stagger: 0.045,
            ease: 'back.out(1.7)',
          })
          .to(statementTargets, {
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
            duration: 0.8,
            stagger: 0.015,
            ease: 'power3.out',
          }, '-=0.5');
      },
    });
  }

  /* ---------------- Project category chip ----------------
     .project-category__chip (in the Projects section's label-row
     heading above the masonry grid) cycles through one thumbnail per
     project on a plain timer — a crossfade via opacity, not scroll-
     driven. Each frame carries the project's category as a data-label
     attribute; the two .project-category__label spans either side of
     the chip update to match on every tick, so the chip image and the
     labels always change together as one unit (Common Ground's
     thumbnail + "Branding", then BGL's + "Branding" again, then
     Hamleys' + "Campaign", then Toblerone's + "Packaging") rather than
     the chip cycling independently of static label text. The label
     swap itself is a "plank on a hinge" swing — outgoing text tips up
     and away, incoming tips up from below into focus (rotationX +
     opacity + blur + scale, .project-category__label's transform-
     origin:center bottom is the hinge) — rather than an instant
     textContent replace. Skipped under reduced motion — the chip just
     shows its first (already .is-active) frame and label, statically,
     no animation. Removed once, restored per a direct follow-up
     request to bring the heading back above the new plain grid. The
     label swap was a "plank on a hinge" swing (rotationX + blur +
     scale, left/right mirrored) — replaced with a plain opacity
     fade-out/fade-in per direct request for something simpler. */
  function initProjectChips() {
    const chips = gsap.utils.toArray('.project-category__chip');
    if (!chips.length || prefersReducedMotion()) return;

    const CYCLE_MS = 2600;
    // Was 0.35s each (0.7s round trip) — the chip's own image crossfade
    // is a single 0.7s opacity transition (see .project-category__chip-img
    // in styles.css), so at the 0.35s mark the chip is only half-blended
    // while the label had already gone fully invisible: the label was
    // fading twice as fast as the chip. Matching each phase to the
    // chip's 0.7s duration makes both change at the same rate, per
    // direct request — the label's full round trip is now 1.4s, still
    // well inside the 2.6s cycle.
    const FADE_OUT = { opacity: 0, duration: 0.7, ease: 'power1.in' };
    const FADE_IN = { opacity: 1, duration: 0.7, ease: 'power1.out' };

    chips.forEach((chip) => {
      const frames = gsap.utils.toArray('.project-category__chip-img', chip);
      if (frames.length < 2) return;

      const labelRow = chip.closest('.project-category__label-row');
      const labels = labelRow ? gsap.utils.toArray('[data-cycle-label]', labelRow) : [];

      let activeIndex = frames.findIndex((el) => el.classList.contains('is-active'));
      if (activeIndex < 0) activeIndex = 0;

      const setLabelText = () => {
        const text = frames[activeIndex].dataset.label;
        if (text) labels.forEach((el) => { el.textContent = text; });
      };
      setLabelText();

      setInterval(() => {
        frames[activeIndex].classList.remove('is-active');
        activeIndex = (activeIndex + 1) % frames.length;
        frames[activeIndex].classList.add('is-active');

        if (!labels.length) return;
        gsap.to(labels, {
          ...FADE_OUT,
          onComplete: () => {
            setLabelText();
            gsap.fromTo(labels, { opacity: 0 }, FADE_IN);
          },
        });
      }, CYCLE_MS);
    });
  }

  /* ---------------- Case study cycling image slots ----------------
     .case2-shot--cycle (the "(gif)" slots in the case2 template) —
     a plain crossfade through several still frames, same mechanic as
     initProjectChips' chip above but simpler (no label text to swap
     in lockstep, no swing motion). Real animated .gif files weren't
     available for these slots, so this is the stand-in per direct
     request. Skipped under reduced motion — the slot just shows
     whichever frame is already .is-active, statically. */
  function initCaseCycles() {
    const groups = gsap.utils.toArray('.case2-shot--cycle');
    if (!groups.length || prefersReducedMotion()) return;

    const CYCLE_MS = 2200;
    groups.forEach((group) => {
      const frames = gsap.utils.toArray('.case2-cycle__frame', group);
      if (frames.length < 2) return;

      let activeIndex = frames.findIndex((el) => el.classList.contains('is-active'));
      if (activeIndex < 0) activeIndex = 0;

      setInterval(() => {
        frames[activeIndex].classList.remove('is-active');
        activeIndex = (activeIndex + 1) % frames.length;
        frames[activeIndex].classList.add('is-active');
      }, CYCLE_MS);
    });
  }

  /* ---------------- Footer wordmark marquee ----------------
     Same seamless-loop mechanics as initProjectsMarquee (two
     identical .footer__wordmark-group copies inside one track, x
     wraps back by one group-width the instant it's scrolled fully
     out of view) applied to the single "PRACHI MITTAL" track instead
     of a per-category list. */
  function initFooterMarquee() {
    const track = document.querySelector('.footer__wordmark-track');
    if (!track || prefersReducedMotion()) return;

    const group = track.querySelector('.footer__wordmark-group');
    if (!group) return;

    const BASE_SPEED = 60; // px/s, right-to-left

    let groupWidth = 0;
    const measure = () => {
      groupWidth = group.getBoundingClientRect().width;
    };
    measure();

    let x = 0;
    let lastTime = performance.now();
    gsap.ticker.add(() => {
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      if (groupWidth <= 0) return;

      x -= BASE_SPEED * delta;
      if (x <= -groupWidth) x += groupWidth;
      gsap.set(track, { x });
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 200);
    });
  }

  /* ---------------- About stats (cards emerging from behind the portrait) ----------------
     Ported from the client reference's own technique — a plain
     IntersectionObserver toggling a class, with CSS transitions doing
     the actual animating. (Verified the underlying styling logic
     directly rather than trusting screenshots here: this project's
     screenshot-based QA tooling appears unable to let CSS
     transitions progress past their starting frame at all — checked
     with transition:none forced on, which showed the exact right
     computed opacity/transform/on-screen position instantly. With
     the transition active it stayed frozen at the start frame no
     matter how long a wait was given, which matches a similar
     transition/tween-timing limitation hit earlier with this site's
     GSAP entrance animation and the navbar's dark-mode swap — a tool
     limitation, not a bug in the CSS.) prefers-reduced-motion doesn't
     need special-casing: the site-wide reduced-motion rule already
     forces all transition-durations to ~0, so the cards still reach
     their spread positions when .show-stats lands, just without the
     animated motion. */
  function initAboutStats() {
    const statsSection = document.getElementById('stats-section');
    if (!statsSection || typeof IntersectionObserver === 'undefined') return;

    positionStatCards();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          statsSection.classList.toggle('show-stats', entry.isIntersecting);
        });
      },
      { root: null, rootMargin: '0px', threshold: 0.65 }
    );
    observer.observe(statsSection);
  }

  /* --stat-offset-x (styles.css) clears the portrait for a *generic*
     card, but a wide two-line label like "35+ Brands / & Clients" can
     still occupy nearly the card's full box — at some viewport widths
     the label itself, not just the card's blank tucked corner, ended
     up sitting behind the portrait and reading as missing/cut-off
     text. Rather than hand-tune yet another CSS clamp() per card (the
     same trap --stat-offset-x itself was already in), measure each
     card's actual rendered label against the actual rendered portrait
     rect and push it out by exactly however much it's short — content-
     aware and viewport-proof by construction instead of by guesswork.

     One shared push, not four separate ones: an earlier version set a
     different --card-extra-x per card (whatever that card's own label
     needed), which cleared the text fine but broke the four cards'
     shared symmetry — each one ended up sitting a different distance
     from the portrait, reading as randomly staggered instead of one
     aligned set. Using the single largest requirement for all four
     keeps every card the same distance from center (so their tilted
     inner corner all lines up) while still clearing the widest label. */
  function positionStatCards() {
    const statsSection = document.getElementById('stats-section');
    const portrait = document.querySelector('.portrait-placeholder');
    if (!statsSection || !portrait) return;
    const cards = statsSection.querySelectorAll('.stat-card');
    if (!cards.length) return;

    const wasShown = statsSection.classList.contains('show-stats');
    statsSection.classList.add('show-stats');
    statsSection.style.setProperty('--card-extra-x-left', '0px');
    statsSection.style.setProperty('--card-extra-x-right', '0px');
    cards.forEach((card) => {
      card.style.transition = 'none';
    });
    // eslint-disable-next-line no-unused-expressions
    statsSection.offsetHeight; // force layout so the reset above is measured, not last frame's transform

    const portraitRect = portrait.getBoundingClientRect();
    const isLeftCard = (card) => card.classList.contains('stat-card--1') || card.classList.contains('stat-card--2');
    const BUFFER = 6;

    let maxLeft = 0;
    let maxRight = 0;
    cards.forEach((card) => {
      const textNode = [...card.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      const range = document.createRange();
      if (textNode) {
        range.selectNodeContents(textNode);
      } else {
        range.selectNodeContents(card);
      }
      const textRect = range.getBoundingClientRect();
      if (isLeftCard(card)) {
        const overlap = textRect.right - portraitRect.left;
        if (overlap > maxLeft) maxLeft = overlap;
      } else {
        const overlap = portraitRect.right - textRect.left;
        if (overlap > maxRight) maxRight = overlap;
      }
    });
    const extraLeft = maxLeft > 0 ? Math.ceil(maxLeft + BUFFER) : 0;
    const extraRight = maxRight > 0 ? Math.ceil(maxRight + BUFFER) : 0;
    statsSection.style.setProperty('--card-extra-x-left', `${extraLeft}px`);
    statsSection.style.setProperty('--card-extra-x-right', `${extraRight}px`);

    // Undo the temporary forced reveal before re-enabling transitions,
    // so a card that wasn't actually on screen yet doesn't visibly
    // spring open and then snap back before its real reveal later.
    if (!wasShown) {
      statsSection.classList.remove('show-stats');
      // eslint-disable-next-line no-unused-expressions
      statsSection.offsetHeight;
    }
    cards.forEach((card) => {
      card.style.transition = '';
    });
  }

  /* ---------------- Testimonials accordion ----------------
     Exactly one card expanded at a time — click a collapsed one to
     expand it and collapse whichever was open. aria-expanded is both
     the a11y state and what styles.css keys its CSS off of, so there
     isn't a separate visual-only class to keep in sync with it.
     .testimonial-row is wide enough to need its own horizontal scroll
     below ~860px (7 cards, one expanded, don't all fit) — scrolling
     the newly-expanded card into view there is what keeps this
     feeling like the same considered interaction as desktop, where it
     always just fits, instead of leaving a mobile visitor to hunt for
     what they just opened. */
  function initTestimonials() {
    const cards = gsap.utils.toArray('.testimonial-card');
    if (!cards.length) return;

    cards.forEach((card) => {
      card.addEventListener('click', () => {
        if (card.getAttribute('aria-expanded') === 'true') return;
        cards.forEach((c) => c.setAttribute('aria-expanded', c === card ? 'true' : 'false'));
        card.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          inline: 'nearest',
          block: 'nearest',
        });
      });
    });
  }

  /* ---------------- Philosophy pinned scene ----------------
     One continuous passage, not four discrete slides that fully exit
     before the next enters (that's what the previous, (3).html-ported
     version did — each stage tweened to y:-100/opacity:0 and the next
     tweened in from y:100/opacity:0, which reads as separate "new"
     screens arriving one after another). Instead #philosophy-text-
     track holds every beat stacked in normal flow, and the whole
     track's translateY is driven directly off scroll progress so it
     scrolls vertically past a fixed focus line inside the
     .philosophy-text-col window — a teleprompter, not a slideshow.
     Fade is per BLOCK (heading + paragraph + badge/tags together),
     not per word — each .philosophy-block's opacity is set every
     frame from its own single center point's distance to the focus
     line, so a whole passage arrives and reads at full opacity
     together instead of only the line or two nearest the focus point
     being legible while the rest of that same passage is still
     fading in/out (a word-level version of this was tried first and
     read as hard to read for exactly that reason, per direct
     feedback). Block positions are measured once up front (relative
     to the track, before any transform is applied) rather than
     re-read every frame. #ph-photo gets a slow continuous drift (not
     per-stage jumps) tied to the same progress value, so it matches
     the same "one continuous pass" feel instead of visibly stepping
     between poses. Skipped entirely under reduced motion — a pinned,
     scroll-jacked, continuously-transformed track is exactly the kind
     of motion that preference exists to avoid; the CSS reduced-motion
     block unwinds everything to plain stacked, always-visible content
     instead (see styles.css). */
  function initPhilosophyScroll() {
    const wrapper = document.querySelector('.philosophy-pin-wrapper');
    const photo = document.getElementById('ph-photo');
    const col = document.querySelector('.philosophy-text-col');
    const track = document.getElementById('philosophy-text-track');
    if (!wrapper || !photo || !col || !track) return;
    if (prefersReducedMotion()) return;

    const blocks = gsap.utils.toArray('.philosophy-block');
    if (!blocks.length) return;

    // Wide plateau — a block stays at full opacity for a generous
    // stretch of scroll on either side of dead-center, since the goal
    // is "fully readable while it's the one in focus," not a knife-
    // edge peak.
    const FOCUS_RANGE = 130; // px — full opacity while a block's center is within this of the focus line
    const MIN_OPACITY = 0.18;
    const EASE = gsap.parseEase('power1.out');

    let fadeRange = 220;
    let focusY = 0;
    let trackHeight = 0;
    let cache = []; // { el, center } — center is this block's vertical midpoint, track-relative, measured once

    function measure() {
      const colRect = col.getBoundingClientRect();
      const windowHeight = colRect.height;
      focusY = windowHeight * 0.42;
      fadeRange = Math.max(280, windowHeight * 0.42);

      // measured with the track at its natural (untransformed) flow
      // position, so every offset below is relative to the track's
      // own top regardless of whatever translateY is currently applied
      const prevTransform = track.style.transform;
      track.style.transform = 'none';
      const trackRect = track.getBoundingClientRect();
      trackHeight = trackRect.height;
      cache = blocks.map((el) => {
        const r = el.getBoundingClientRect();
        return { el, center: r.top - trackRect.top + r.height / 2 };
      });
      track.style.transform = prevTransform;
    }
    measure();

    function render(progress) {
      // track's top starts FADE_RANGE below the focus line (so even
      // the very first block begins dim, not already lit) and ends
      // FADE_RANGE above it once the last block has cleared — see the
      // long comment above for the lead-in/lead-out derivation.
      const trackY = focusY + fadeRange - progress * (trackHeight + fadeRange * 2);
      track.style.transform = `translateY(${trackY}px)`;

      for (let i = 0; i < cache.length; i++) {
        const { el, center } = cache[i];
        const screenY = center + trackY;
        const dist = Math.abs(screenY - focusY);
        let t = (dist - FOCUS_RANGE) / (fadeRange - FOCUS_RANGE);
        t = t < 0 ? 0 : t > 1 ? 1 : EASE(t);
        // Set once on the block itself — opacity on a parent visually
        // fades every descendant (heading, paragraph, badge, tags)
        // together as a single unit, which is the whole point here.
        el.style.opacity = String(1 - t * (1 - MIN_OPACITY));
      }

      // slow continuous drift, tied straight to progress rather than
      // stepping at per-stage checkpoints — a small sine wobble reads
      // as "alive" without ever looking like a discrete pose change
      gsap.set(photo, {
        rotation: Math.sin(progress * Math.PI * 2.5) * 2.5,
        scale: 1 + Math.sin(progress * Math.PI * 5) * 0.02,
      });
    }
    render(0);

    ScrollTrigger.create({
      trigger: wrapper,
      start: 'top top',
      end: '+=400%',
      scrub: 1,
      pin: true,
      anticipatePin: 1,
      onUpdate: (self) => render(self.progress),
      // ScrollTrigger already listens for resize itself and calls
      // this — no separate manual resize listener needed on top of it.
      onRefresh: (self) => { measure(); render(self.progress); },
    });
  }

  /* ---------------- Illustration field (About -> Philosophy) ----------------
     A fixed-position layer (.about-doodle-field, not scoped to any one
     section — see the long comment on it in Index.html/styles.css)
     carrying 4 illustrations, each with three independent motions
     split across two nested elements so none of them fight over
     `transform`:
       .about-doodle        — a continuous per-doodle idle drift (a
                               unique little closed loop via layered
                               sine/cosine, so it reads as organic
                               "flowing" rather than a robotic back-
                               and-forth) PLUS a scroll-linked diagonal
                               sweep — this second part is what flies
                               each one in from an off-screen corner as
                               #about arrives and back out the same
                               diagonal, in reverse, by the time
                               #philosophy-section begins (see
                               driftX/driftY and DOODLE_MOTION below).
                               Each doodle's corner is fixed, not
                               random, specifically so 2 of the 4 travel
                               one diagonal and the other 2 travel the
                               opposite one — reading as an "X" of
                               paths crossing near the centre, the same
                               way on every load and at every viewport
                               width, per direct request.
       .about-doodle__inner — cursor-proximity repel + scale-up, same
                               "flinch away" language as the WHY
                               heading's magnetic letters. */
  function initAboutDoodles() {
    const field = document.getElementById('about-doodle-field');
    const doodles = gsap.utils.toArray('.about-doodle');
    if (!field || !doodles.length) return;

    if (prefersReducedMotion()) {
      gsap.set(field, { opacity: 1 });
      return;
    }

    // Fixed (not random) per-doodle diagonal corner + drift magnitude —
    // per direct request, the entrance/exit needs to look identical on
    // every load and at every viewport width instead of reading
    // differently depending on which way gsap.utils.random happened to
    // roll that time (sometimes all 4 drifting the same way, sometimes
    // split — the split version is the "cross" look that was actually
    // wanted, every time). Two doodles share one diagonal (top-left <->
    // bottom-right), the other two share the other (top-right <->
    // bottom-left), entering from opposite corners of their own
    // diagonal so their paths visibly cross near the centre as all 4
    // fly in together — see driftX/driftY below for how dirX/dirY
    // become actual off-screen corner positions.
    const DOODLE_MOTION = {
      'about-doodle--1': { dirX: 1, dirY: 1, parallaxRange: 260 }, // flower: enters bottom-right
      'about-doodle--6': { dirX: -1, dirY: -1, parallaxRange: -300 }, // enters top-left (crosses --1)
      'about-doodle--2': { dirX: -1, dirY: 1, parallaxRange: -220 }, // enters bottom-left
      'about-doodle--3': { dirX: 1, dirY: -1, parallaxRange: 340 }, // key: enters top-right (crosses --2)
    };

    const entries = doodles.map((el) => {
      const key = [...el.classList].find((c) => DOODLE_MOTION[c]);
      const motion = DOODLE_MOTION[key] || { dirX: 1, dirY: 1, parallaxRange: 260 };
      return {
        el,
        inner: el.querySelector('.about-doodle__inner'),
        freqX: gsap.utils.random(0.12, 0.22),
        freqY: gsap.utils.random(0.1, 0.2),
        phase: gsap.utils.random(0, Math.PI * 2),
        ampX: gsap.utils.random(10, 20),
        ampY: gsap.utils.random(8, 16),
        // two overlapping tilt waves at different speeds/amplitudes,
        // not one — a single sine reads as a metronome; layering a
        // slow big wave with a faster small one is what makes it read
        // as an organic tilting float, like a leaf drifting down,
        // rather than a mechanical back-and-forth
        tiltAmp1: gsap.utils.random(10, 18),
        tiltFreq1: gsap.utils.random(0.05, 0.09),
        tiltAmp2: gsap.utils.random(4, 8),
        tiltFreq2: gsap.utils.random(0.15, 0.24),
        ...motion,
      };
    });

    // 0.14/0.86 read fine on the original About->Projects range (much
    // longer in scroll distance), but this range shrank to About->
    // Philosophy per direct request (see the ScrollTrigger below) —
    // the same fraction now covers far less actual scroll, so the
    // enter/exit swept past in a fraction of the scroll distance and
    // read as an abrupt snap rather than a smooth glide. Widened here
    // to spend proportionally more of the (now shorter) range on the
    // transition itself.
    const ENTER_END = 0.32; // scroll-progress fraction spent flying in from off-screen
    const EXIT_START = 0.68; // and flying back out, symmetrically, at the other end
    const enterEase = gsap.parseEase('power2.out');
    const exitEase = gsap.parseEase('power2.in');

    // The mid-scroll drift value a doodle would have at progress p
    // (same formula the old parallax used for its whole 0-1 range) —
    // now only actually used between ENTER_END and EXIT_START, with
    // the entrance/exit phases easing to/from *outside the viewport*
    // on either side of it, so those two segments join up smoothly
    // rather than popping.
    function midDrift(p, range) {
      return (p - 0.5) * range;
    }

    // Genuinely off the fixed viewport regardless of a given doodle's
    // own resting position — read live (not cached) so a window resize
    // is reflected on the very next frame with no extra listener.
    function offscreenX() {
      return window.innerWidth * 0.85 + 220;
    }
    function offscreenY() {
      return window.innerHeight * 0.85 + 220;
    }

    // e.dirX/dirY (fixed per doodle, see DOODLE_MOTION above) name the
    // off-screen *corner* this doodle flies in from — e.g. dirX:1,
    // dirY:1 starts at (+offX, +offY), off the bottom-right, and eases
    // in to (its horizontal mid-drift, 0) i.e. plain rest position.
    // Exit reverses back to that exact same corner, not the opposite
    // one, so the whole trip reads as one diagonal line travelled
    // forward then backward — this is what makes 4 doodles on 2
    // opposing diagonals actually cross paths as they all fly in.
    function driftX(progress, e) {
      const off = offscreenX();
      if (progress <= ENTER_END) {
        const t = enterEase(Math.max(0, progress) / ENTER_END);
        return gsap.utils.interpolate(e.dirX * off, midDrift(ENTER_END, e.parallaxRange), t);
      }
      if (progress >= EXIT_START) {
        const t = exitEase((Math.min(1, progress) - EXIT_START) / (1 - EXIT_START));
        return gsap.utils.interpolate(midDrift(EXIT_START, e.parallaxRange), e.dirX * off, t);
      }
      return midDrift(progress, e.parallaxRange);
    }

    function driftY(progress, e) {
      const off = offscreenY();
      if (progress <= ENTER_END) {
        const t = enterEase(Math.max(0, progress) / ENTER_END);
        return gsap.utils.interpolate(e.dirY * off, 0, t);
      }
      if (progress >= EXIT_START) {
        const t = exitEase((Math.min(1, progress) - EXIT_START) / (1 - EXIT_START));
        return gsap.utils.interpolate(0, e.dirY * off, t);
      }
      return 0;
    }

    // 0 before #about arrives, 1 once #philosophy-section's own pin
    // engages ("The Way I See The World") — per direct request, the
    // doodles belong to #about specifically and should be gone by the
    // moment that next section takes over, not linger all the way
    // through it to #projects. Drives both the field's own (now very
    // brief — position carries the real enter/exit) opacity safety-
    // fade and every doodle's drift/tilt, recomputed continuously
    // (scrub, not once) so it always matches however far the user has
    // actually scrolled, including mid-scroll direction reversals.
    let scrollProgress = 0;
    // 'top bottom' (About's top touching the viewport's own bottom
    // edge) is a fixed point in the *page's* scroll distance, but how
    // early that lands relative to whatever's still on screen above
    // it (the WHY/TV section, right before About) depends on viewport
    // *height* — a short phone viewport reaches that condition while
    // WHY/TV is still fully visible, so the doodles' entrance (first
    // ENTER_END fraction of this range, above) was fading tiles in on top
    // of the still-on-screen TV scene instead of after it. A tall
    // desktop viewport doesn't hit this — WHY/TV has already scrolled
    // well clear by the time this condition is met there. Mobile-only:
    // start later, once About's top has actually scrolled some real
    // distance into view, by which point WHY/TV is behind it.
    const doodleStart = window.matchMedia('(max-width: 768px)').matches ? 'top 40%' : 'top bottom';
    // Not endTrigger:'.philosophy-pin-wrapper', end:'top top' — that
    // element is itself pinned (initPhilosophyScroll), and referencing
    // an already-pinned element as another trigger's endTrigger this
    // way measures garbage (a large negative start), not the sane
    // number philosophy's own pin trigger reports for the exact same
    // position. Reading that existing trigger's own .start instead
    // sidesteps the conflict entirely; a function (not a plain number)
    // so it re-reads the current value on every ScrollTrigger refresh
    // rather than freezing whatever it was at creation time.
    const philTrigger = ScrollTrigger.getAll().find(
      (t) => t.vars.pin && t.trigger && t.trigger.classList && t.trigger.classList.contains('philosophy-pin-wrapper')
    );
    ScrollTrigger.create({
      trigger: '.about-section',
      start: doodleStart,
      end: () => (philTrigger ? philTrigger.start : '+=2000'),
      scrub: true,
      onUpdate: (self) => { scrollProgress = self.progress; },
    });

    gsap.ticker.add(() => {
      const t = gsap.ticker.time;
      const fadeIn = Math.min(1, scrollProgress / 0.02);
      const fadeOut = Math.min(1, (1 - scrollProgress) / 0.02);
      gsap.set(field, { opacity: Math.min(fadeIn, fadeOut) });

      entries.forEach((e) => {
        gsap.set(e.el, {
          x: Math.sin(t * e.freqX + e.phase) * e.ampX + driftX(scrollProgress, e),
          y: Math.cos(t * e.freqY + e.phase * 1.3) * e.ampY + driftY(scrollProgress, e),
          rotate:
            Math.sin(t * e.tiltFreq1 + e.phase) * e.tiltAmp1 +
            Math.sin(t * e.tiltFreq2 + e.phase * 1.7) * e.tiltAmp2,
        });
      });
    });

    if (!window.matchMedia('(pointer: fine)').matches) return;

    const REPEL_RADIUS = 150; // px
    const REPEL_STRENGTH = 30; // px, at zero distance
    const quick = entries.map((e) => ({
      x: gsap.quickTo(e.inner, 'x', { duration: 0.5, ease: 'power3.out' }),
      y: gsap.quickTo(e.inner, 'y', { duration: 0.5, ease: 'power3.out' }),
      rotate: gsap.quickTo(e.inner, 'rotate', { duration: 0.5, ease: 'power3.out' }),
      scale: gsap.quickTo(e.inner, 'scale', { duration: 0.4, ease: 'power3.out' }),
    }));
    document.addEventListener('mousemove', (ev) => {
      entries.forEach((e, i) => {
        const rect = e.el.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - ev.clientX;
        const dy = rect.top + rect.height / 2 - ev.clientY;
        const dist = Math.hypot(dx, dy);
        if (dist < REPEL_RADIUS) {
          const power = (1 - dist / REPEL_RADIUS) * (REPEL_STRENGTH / (dist || 1));
          quick[i].x(dx * power);
          quick[i].y(dy * power);
          quick[i].rotate(dx * power * 0.5);
          quick[i].scale(1 + (1 - dist / REPEL_RADIUS) * 0.2);
        } else {
          quick[i].x(0);
          quick[i].y(0);
          quick[i].rotate(0);
          quick[i].scale(1);
        }
      });
    });
  }

  /* ---------------- Flying/flipping portrait card ----------------
     Ported near-verbatim from the client reference. #start-placeholder
     (in #about) and #end-placeholder (in #philosophy-section) are
     invisible same-size anchors; this measures their real document
     position and interpolates #flying-card's translate3d/rotateY/
     scale between them based on how far the user has scrolled from
     one to the other — see the long comment on #philosophy-section
     in Index.html for why this exists as a separate fixed element
     rather than just animating the portrait in place. */
  function initFlyingCard() {
    const startEl = document.getElementById('start-placeholder');
    const endEl = document.getElementById('end-placeholder');
    const flyingCard = document.getElementById('flying-card');
    const flipper = document.getElementById('flying-card-flipper');
    const fadeElements = document.querySelectorAll('.fade-element');
    if (!startEl || !endEl || !flyingCard || !flipper) return;

    if (prefersReducedMotion()) {
      // No flight/flip — the card just sits statically, in normal
      // document flow, exactly where the portrait belongs in #about,
      // so it scrolls like any other element instead of a scroll-
      // driven transform tracking two different sections at once.
      // #flying-card never leaves #about under this path, so
      // #end-placeholder needs its own static reveal here — otherwise
      // .philosophy-pin-wrapper would have no visible portrait at all.
      endEl.classList.add('is-visible');
      const placeStatic = () => {
        const sRect = startEl.getBoundingClientRect();
        if (sRect.width === 0) return;
        flyingCard.style.position = 'absolute';
        flyingCard.style.top = `${sRect.top + window.scrollY}px`;
        flyingCard.style.left = `${sRect.left + window.scrollX}px`;
        flyingCard.style.width = `${sRect.width}px`;
        flyingCard.style.height = `${sRect.height}px`;
        flyingCard.style.transform = 'none';
        flyingCard.style.opacity = '1';
      };
      placeStatic();
      window.addEventListener('resize', placeStatic);
      window.addEventListener('load', placeStatic);
      setTimeout(placeStatic, 100);
      return;
    }

    // updateCard below only ever *computes* a target — it never writes
    // to the DOM directly. A fast scroll (a big Lenis-smoothed jump in
    // scrollY between one onUpdate call and the next) used to snap the
    // card straight from one rotateY to a very different one in a
    // single frame, which read as the card glitching/distorting mid-
    // flip rather than sweeping through it. The ticker below instead
    // eases the applied transform toward whatever the latest target
    // is, every animation frame regardless of whether a new scroll
    // event has even arrived yet — so a big jump in the target still
    // renders as a fast but continuous sweep, never a discontinuous
    // jump. hasTarget gets the very first call to snap instantly
    // instead of lerping in from these zeroed defaults (which would
    // itself look like the card flying in from the top-left on load).
    // opacity deliberately isn't part of this position/rotation lerp —
    // see the direct-opacity comment inside updateCard below for why.
    const target = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotateY: 0 };
    const current = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotateY: 0 };
    let hasTarget = false;

    function applyCard() {
      flyingCard.style.transform = `translate3d(${current.x}px, ${current.y}px, 0) scale(${current.scaleX}, ${current.scaleY})`;
      flipper.style.transform = `rotateY(${current.rotateY}deg)`;
    }

    gsap.ticker.add(() => {
      if (!hasTarget) return;
      const LERP = 0.35;
      current.x += (target.x - current.x) * LERP;
      current.y += (target.y - current.y) * LERP;
      current.scaleX += (target.scaleX - current.scaleX) * LERP;
      current.scaleY += (target.scaleY - current.scaleY) * LERP;
      current.rotateY += (target.rotateY - current.rotateY) * LERP;
      applyCard();
    });

    function updateCard(progress) {
      // Measured fresh every call rather than cached — a cached
      // document-space snapshot (the previous approach) goes stale the
      // moment anything above #start-placeholder or #end-placeholder
      // reflows after the snapshot was taken (a pinned section's
      // spacer settling late, a web font swapping in), and unlike the
      // flight's timing (now driven by a real ScrollTrigger — see
      // flightTrigger below), there was no equivalent fix for *where*
      // the card actually renders: it would keep drawing at whatever
      // position the stale snapshot implied, floating over whatever
      // section happens to be there instead of tracking the real
      // placeholders. getBoundingClientRect() is cheap enough to call
      // twice per scroll-driven frame — the same cost ScrollTrigger
      // itself already pays for plenty of other elements on this page.
      const sRect = startEl.getBoundingClientRect();
      const eRect = endEl.getBoundingClientRect();

      // Bail (keeping the card hidden) if the DOM hasn't painted real
      // dimensions yet — dividing by a zero width later would produce
      // NaN transforms.
      if (sRect.width === 0 || eRect.width === 0) {
        flyingCard.style.opacity = '0';
        return;
      }

      flyingCard.style.width = `${sRect.width}px`;
      flyingCard.style.height = `${sRect.height}px`;

      // Sine-mapped ease in/out, not linear, for a premium feel.
      const easeProgress = -(Math.cos(Math.PI * progress) - 1) / 2;

      const startCenterX = sRect.left + sRect.width / 2;
      const startCenterY = sRect.top + sRect.height / 2;
      const endCenterX = eRect.left + eRect.width / 2;
      const endCenterY = eRect.top + eRect.height / 2;

      const currentCenterX = startCenterX + (endCenterX - startCenterX) * easeProgress;
      const currentCenterY = startCenterY + (endCenterY - startCenterY) * easeProgress;

      const currentWidth = sRect.width + (eRect.width - sRect.width) * easeProgress;
      const currentHeight = sRect.height + (eRect.height - sRect.height) * easeProgress;

      const scaleX = currentWidth / sRect.width;
      const scaleY = currentHeight / sRect.height;

      const x = currentCenterX - sRect.width / 2;
      const y = currentCenterY - sRect.height / 2;

      // split across the two elements — see the long comment on
      // .flying-card in styles.css for why the rotateY specifically
      // has to live on .flying-card__flipper (one level in) rather
      // than here, alongside the position/scale.
      // These only set `target` — the gsap.ticker loop above is what
      // actually writes to the DOM, easing `current` toward whatever
      // target was last computed here so a big scrollY jump between
      // two onUpdate calls still renders as a continuous sweep.
      target.x = x;
      target.y = y;
      target.scaleX = scaleX;
      target.scaleY = scaleY;
      target.rotateY = easeProgress * -180;

      // Fade out the dev-note "fade-element" text right before/during
      // the flip so it doesn't clip awkwardly against the moving card.
      const opacity = progress < 0.1 ? 1 - progress * 10 : progress > 0.9 ? (progress - 0.9) * 10 : 0;
      fadeElements.forEach((el) => { el.style.opacity = opacity; });

      // The card itself fades out right as it lands (last 5% of the
      // flight), while #end-placeholder — a real, visible element now,
      // not an invisible measurement anchor like #start-placeholder —
      // fades in as its exact complement. Both set directly here, from
      // the same progress value in the same frame, deliberately NOT
      // run through the position/rotation lerp above and NOT left to
      // a CSS transition on #end-placeholder's side (see the long
      // comment on .portrait-placeholder in styles.css): two
      // independently-timed fades (a smoothed JS one for the card, a
      // separate fixed-duration CSS one for the photo) can drift apart
      // on a fast or reversed scroll — a gap where both read as
      // nearly transparent (a flash/momentary disappearance right as
      // the flip lands), or an overlap where both are partly visible
      // at once (two portraits on screen together on the way back).
      // Setting both, unsmoothed, from one shared value removes any
      // window for either.
      const cardOpacity = progress > 0.95 ? Math.max(0, 1 - (progress - 0.95) * 20) : 1;
      flyingCard.style.opacity = String(cardOpacity);
      endEl.style.opacity = String(1 - cardOpacity);

      // The lerp smoothing in the ticker above (position/scale/rotate
      // only now — see above) exists solely to keep a FAST scroll
      // *through* the actual 0..1 flight from visibly glitching
      // between frames — it was never meant to add drag while the
      // card is simply at rest, glued to a placeholder that itself is
      // just scrolling normally with the page. ScrollTrigger clamps
      // progress to exactly 0 before the flight starts and exactly 1
      // after it ends, so outside that open interval nothing is "in
      // flight": snap current straight to target on every such frame
      // (not just the very first ever) instead of leaving it to the
      // ticker to slowly catch up. Without this, scrolling back up
      // past #about (or fast-forwarding through the flight) let the
      // card visibly lag behind the placeholder's real, continuously-
      // changing position — reading as the photo floating/trailing
      // through the TV and hero sections instead of staying glued to
      // where it actually belongs.
      if (!hasTarget || progress <= 0 || progress >= 1) {
        hasTarget = true;
        current.x = target.x;
        current.y = target.y;
        current.scaleX = target.scaleX;
        current.scaleY = target.scaleY;
        current.rotateY = target.rotateY;
        applyCard();
      }

      // Still toggled for .philosophy-photo-container:has(...)'s own
      // shadow rule in styles.css — unrelated to opacity now (the
      // inline value above already overrides whatever this class sets).
      endEl.classList.toggle('is-visible', progress > 0.95);
    }

    // Progress (0 at #start-placeholder's center crossing viewport
    // center, 1 once the flight lands) used to be computed by hand from
    // a one-time window.scrollY + getBoundingClientRect snapshot of
    // each placeholder — that snapshot going stale (a pin-spacer
    // settling late, a web-font swap) was one source of the card and
    // the paragraph text drifting out of sync. Switching to a real
    // ScrollTrigger fixed *that*, but end:'center center' on endTrigger
    // (#end-placeholder) is its own, separately-measured scroll
    // position — #end-placeholder's centre crossing viewport centre is
    // simply a different point than .philosophy-pin-wrapper's top
    // crossing viewport top (the paragraph timeline's own start, see
    // initPhilosophyScroll), even though the two usually land close
    // together. That gap is exactly the window where the flight was
    // reporting "done" while the text hadn't started yet, or the text
    // had already started while the card was still mid-handoff — two
    // independently-true measurements that just don't have to agree.
    // end is locked directly to the paragraph timeline's own trigger
    // instead (same technique already used for the about-doodles exit
    // — see initAboutDoodles), so the flight can only ever finish at
    // the exact scroll position the text timeline calls its own start:
    // one shared reference instead of two that can drift apart.
    const philTrigger = ScrollTrigger.getAll().find(
      (t) => t.vars.pin && t.trigger && t.trigger.classList && t.trigger.classList.contains('philosophy-pin-wrapper')
    );
    const flightTrigger = ScrollTrigger.create({
      trigger: startEl,
      start: 'center center',
      end: () => (philTrigger ? philTrigger.start : '+=2000'),
    });
    updateCard(flightTrigger.progress);

    // flightTrigger's own onUpdate (not used above) only fires when
    // ITS progress numerically changes — which it doesn't for any
    // scroll that stays entirely before the flight starts or entirely
    // after it ends, since GSAP clamps and reports the same 0 or 1
    // both times. That's most of the page (everything from the very
    // top through #about, and everything from #philosophy-section
    // onward), so updateCard would simply stop being called while
    // scrolling around in either of those zones — freezing the card
    // at whatever position it last computed, which is stale the
    // moment startEl (or endEl) has since moved for any other reason
    // (this section's own idle float, a layout shift elsewhere). A
    // second, no-op ScrollTrigger spanning the ENTIRE page always has
    // continuously-changing progress, so its onUpdate reliably fires
    // on every real scroll tick everywhere — used here purely to force
    // a fresh repaint each time, reading flightTrigger's current
    // progress rather than trusting a stale cached value.
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: () => updateCard(flightTrigger.progress) });

    // updateCard measures startEl/endEl fresh every call now, so there's
    // no separate rect cache left to warm — these just repaint with the
    // current progress in case the very first call above landed before
    // layout had real dimensions yet (0-width placeholders would have
    // bailed to opacity:0 and stayed there with nothing else to retry).
    window.addEventListener('load', () => updateCard(flightTrigger.progress));
    setTimeout(() => updateCard(flightTrigger.progress), 100);
    setTimeout(() => updateCard(flightTrigger.progress), 1000);

    // Resize doesn't necessarily produce a new scroll event for
    // flightTrigger's own onUpdate to fire from, so repaint explicitly —
    // same reasoning as the Lenis resize hook elsewhere on the page.
    // flightTrigger's own start/end are already kept current by
    // ScrollTrigger's normal resize handling, and updateCard's fresh
    // getBoundingClientRect() calls mean this repaint always reflects
    // the post-resize layout, not a stale one.
    window.addEventListener('resize', () => {
      requestAnimationFrame(() => updateCard(flightTrigger.progress));
    });

    // Same idea on every ScrollTrigger refresh (fonts.ready, other
    // sections' pin-spacers finishing sizing, etc.) — repaint with
    // whatever the now-current layout implies instead of waiting for
    // the next scroll event.
    ScrollTrigger.addEventListener('refresh', () => updateCard(flightTrigger.progress));
  }

  /* ---------------- Curve parallax + float (pink section transition) ----------------
     Two motion sources on one element (a gentle continuous float, and
     a scroll-linked parallax drift) combined through one custom
     ticker rather than two separate GSAP tweens — two tweens both
     animating the same transform property fight each other (last-set
     wins, causing jitter); summing them into one gsap.set() per frame
     avoids that entirely, same pattern the spiral field already uses. */
  function initCurveFloat() {
    const curve = document.querySelector('.curve');
    const curvePath = curve ? curve.querySelector('path') : null;
    if (!curve || prefersReducedMotion()) return;

    // The curve sits right at .why-section's own top edge (bottom:100%
    // — see styles.css), which is also exactly where .hero, sticky
    // underneath, would otherwise show through the wave's troughs once
    // .why-section has scrolled all the way up to fully cover the
    // viewport. A wavy seam reads fine while it's still low on screen
    // with .hero visible around it (that's the point of it), but at
    // full coverage those same troughs would leave thin slivers of
    // .hero peeking through right at the top edge — so the wave
    // flattens out to a dead-straight line over the same scroll range
    // (why-section's own entrance, top bottom -> top top) that carries
    // it from "just appearing" to "fully covering," reaching zero
    // amplitude exactly when it needs to seal solid.
    const AMPLITUDE_MAX = 55; // px, matches the static path baked into Index.html
    const buildPath = (amplitude) => {
      const crest = 60 - amplitude;
      const trough = 60 + amplitude;
      return `M0,60 C180,${crest} 540,${crest} 720,60 C900,${trough} 1260,${trough} 1440,60 L1440,120 L0,120 Z`;
    };

    let scrollProgress = 0;
    ScrollTrigger.create({
      trigger: '.why-section',
      start: 'top bottom',
      end: 'top top',
      onUpdate: (self) => {
        scrollProgress = self.progress;
        if (curvePath) curvePath.setAttribute('d', buildPath(AMPLITUDE_MAX * (1 - self.progress)));
      },
    });

    const FLOAT_AMPLITUDE = 8; // px, gentle idle bob
    const FLOAT_PERIOD = 4.5; // seconds per cycle
    const PARALLAX_RANGE = 40; // px of extra drift across the scroll transition
    const startTime = performance.now();

    gsap.ticker.add(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      const floatY = Math.sin((elapsed / FLOAT_PERIOD) * Math.PI * 2) * FLOAT_AMPLITUDE;
      const parallaxY = scrollProgress * PARALLAX_RANGE;
      gsap.set(curve, { y: floatY + parallaxY });
    });
  }

  /* ---------------- Section background colour transitions ----------------
     Each section's own background-color scrubs from the PRECEDING
     section's colour to its own real colour, over the scroll range as
     its top edge travels from the bottom of the viewport to the top
     (trigger:top bottom -> top top) — not the section's full height,
     just its entrance. That's the trick: right as a section starts
     appearing at the bottom edge, it's still colored like whatever is
     already on screen above it, so there's no hard cut at the seam;
     by the time it's fully taken over the viewport, the tween has
     finished and it's sitting at its own true colour. Colours are
     read from the real CSS custom properties at runtime (not
     hardcoded hex here) so this can't drift out of sync with the
     design tokens in :root. .hero is skipped — it's the first section
     and already starts at the page's own base cream, so there's no
     preceding colour to blend from. .why-section is also skipped —
     unlike every other seam here, it doesn't slide up from below the
     viewport; .hero is sticky underneath it and .why-section covers it
     via z-index stacking (see the long comment on .hero in styles.css),
     with its own dedicated floating .curve already smoothing that
     particular seam. That curve has a fixed blush fill; scrubbing
     .why-section's background-color independently of it meant the two
     were very briefly two visibly different shades of pink at the same
     moment mid-scroll — a seam this was supposed to remove, not add. */
  function initSectionColorTransitions() {
    if (prefersReducedMotion()) return;

    const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const blush = token('--color-blush');
    const cream = token('--color-cream');
    const ink = token('--color-ink');
    const pink = token('--color-pink');

    // order matches the current DOM order (why -> about -> philosophy ->
    // projects -> testimonials -> contact) — each entry's "from" is
    // the section immediately before it in that chain
    const chain = [
      { sel: '.about-section', from: blush, to: cream },
      // .philosophy-pin-wrapper is skipped for the same reason
      // .why-section is above — it has its own dedicated curve
      // (.curve--about-bottom, painted a fixed solid pink) already
      // doing the visual transition right at its top edge. An earlier
      // version of this chain also scrubbed the section's own
      // background from cream to pink on top of that, tuned to finish
      // by 'top 92%' so it would already be resolved by the time the
      // section was visible — but measured live, the section's top
      // edge actually enters the viewport well before that scrub
      // finishes (e.g. still rgb(235,145,170) — a visibly lighter pink
      // — against the curve's fixed rgb(220,52,110) at a scroll
      // position where the section is already clearly on screen),
      // which is exactly the two-different-shades seam this system
      // exists to prevent, not cause. Leaving this section's
      // background as its own static CSS color (already the same
      // --color-pink the curve uses) removes the redundant, briefly-
      // out-of-sync second transition entirely.
      { sel: '.projects-section', from: pink, to: ink },
      { sel: '.testimonials-section', from: ink, to: cream },
      { sel: '.contact-section', from: cream, to: ink },
    ];

    chain.forEach(({ sel, from, to, start, end, scrub }) => {
      const el = document.querySelector(sel);
      if (!el) return;
      gsap.fromTo(el,
        { backgroundColor: from },
        {
          backgroundColor: to,
          ease: 'none',
          // delayed start (instead of 'top bottom') so the section sits in
          // its solid "from" color for the first stretch of scroll and is
          // actually visible before it begins shifting, rather than most of
          // the transition happening while still below the fold
          scrollTrigger: {
            trigger: el,
            start: start || 'top 75%',
            end: end || 'top top',
            // numeric scrub smooths the color out over ~0.6s of catch-up
            // instead of snapping to the raw scroll position every frame,
            // which is what read as an abrupt/uneven change on fast or
            // janky scroll input
            scrub: scrub === undefined ? 0.6 : scrub,
          },
        }
      );
    });
  }

  /* ---------------- Projects marquee ----------------
     Continuous auto-scroll driven by one ticker (elapsed-time based,
     same pattern as every other custom animation in this file). The
     track holds two identical groups of cards; the instant `x` would
     scroll the first group fully out of view, it wraps by exactly one
     group-width — invisible, since group two is a copy of group one.

     Dragging never sets `x` directly. Per the explicit ask, the
     auto-scroll must never stop — a pointer down/move/up sequence
     only nudges speedState.multiplier (eased, not snapped) based on
     drag velocity: dragging the same direction as the scroll speeds
     it up, dragging the opposite direction slows or reverses it, and
     releasing eases the multiplier back to the steady baseline. The
     ticker is the only thing that ever touches the track's position. */
  /* ---------------- TV showcase (Index.html) ----------------
     EXPERIMENTAL — see the HTML comment above .tv-showcase. Autoplay
     has to start muted (every major browser blocks autoplay-with-
     sound without prior user interaction); this button is what
     actually gets it playing "with the sound," per the direct
     request that the video keep its audio — a real user click/tap
     counts as the interaction that unlocks it. */
  function initTvShowcase() {
    const video = document.querySelector('.tv-frame__video');
    const button = document.querySelector('.tv-frame__sound');
    const frame = document.querySelector('.tv-frame');
    if (!video || !button) return;

    button.addEventListener('click', () => {
      video.muted = !video.muted;
      button.setAttribute('aria-pressed', String(!video.muted));
      button.setAttribute('aria-label', video.muted ? 'Turn sound on' : 'Turn sound off');
      // autoplay's own gesture requirement can leave the element
      // paused on some browsers even once unmuted — this is a no-op
      // if it's already playing
      if (video.paused) video.play().catch(() => {});
    });

    if (!frame || prefersReducedMotion()) return;

    // "Turning on" — the set sits dark/small/off-brightness until the
    // section scrolls into view, then flickers up to full brightness
    // like an old CRT warming up, instead of just appearing already
    // playing. Plays once.
    gsap.set(frame, { opacity: 0, scale: 0.9, filter: 'brightness(0)' });
    ScrollTrigger.create({
      trigger: '.tv-showcase',
      start: 'top 80%',
      once: true,
      onEnter: () => {
        gsap.timeline()
          .to(frame, { opacity: 1, scale: 1, duration: 0.4, ease: 'power2.out' })
          .to(frame, {
            filter: 'brightness(1)',
            duration: 0.7,
            // stepped (not smooth) — a few uneven brightness snaps on
            // the way up read as a CRT flicker, a linear ramp doesn't
            ease: 'steps(6)',
          }, '<');
      },
    });

    // The set itself stays static (no bob/sway, no cursor-driven tilt)
    // — only the antenna's own CSS keyframe sway (styles.css) still
    // moves, independent of this element.
  }

  function initProjectsMarquee() {
    const strip = document.querySelector('.projects-strip');
    const track = document.querySelector('.projects-track');
    const group = document.querySelector('.projects-track__group');
    // strip.hidden — the TV showcase experiment (Index.html) hides
    // this rather than removing it, specifically so reverting is just
    // dropping that attribute again; no need for this drag/autoscroll
    // setup to run against a hidden element in the meantime.
    if (!strip || !track || !group || strip.hidden) return;

    if (prefersReducedMotion()) return; // stays at its rest position, no auto-scroll, no drag

    const BASE_SPEED = 50; // px/s baseline, right-to-left
    const VELOCITY_SCALE = 400; // px/s of drag velocity that shifts the multiplier by 1
    const MAX_MULTIPLIER = 6;
    const MIN_MULTIPLIER = -4;

    let groupWidth = 0;
    function measure() {
      groupWidth = group.getBoundingClientRect().width;
    }
    measure();

    let x = 0;
    const speedState = { multiplier: 1 };
    let lastTime = performance.now();

    function tick() {
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      if (groupWidth <= 0) return;

      x -= BASE_SPEED * speedState.multiplier * delta;
      if (x <= -groupWidth) x += groupWidth;
      if (x > 0) x -= groupWidth;

      gsap.set(track, { x });
    }
    gsap.ticker.add(tick);

    let dragging = false;
    let lastPointerX = 0;
    let lastPointerTime = 0;

    function onPointerDown(e) {
      dragging = true;
      lastPointerX = e.clientX;
      lastPointerTime = performance.now();
      strip.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e) {
      if (!dragging) return;
      const now = performance.now();
      const deltaX = e.clientX - lastPointerX;
      const deltaTime = Math.max(1, now - lastPointerTime) / 1000;
      const velocity = deltaX / deltaTime; // px/s — positive = pointer moving right
      lastPointerX = e.clientX;
      lastPointerTime = now;

      // moving the same direction as the scroll (left, negative
      // velocity) pushes the multiplier above 1 — speeds up; moving
      // right pulls it below 1, through 0, and negative — slows down
      // then reverses
      const target = Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, 1 - velocity / VELOCITY_SCALE));
      gsap.to(speedState, { multiplier: target, duration: 0.2, ease: 'power2.out', overwrite: true });
    }
    function onPointerUp() {
      if (!dragging) return;
      dragging = false;
      gsap.to(speedState, { multiplier: 1, duration: 1.2, ease: 'power2.out', overwrite: true });
    }

    strip.addEventListener('pointerdown', onPointerDown);
    strip.addEventListener('pointermove', onPointerMove);
    strip.addEventListener('pointerup', onPointerUp);
    strip.addEventListener('pointercancel', onPointerUp);
    strip.addEventListener('pointerleave', () => { if (dragging) onPointerUp(); });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measure, 200);
    });
  }

  /* ---------------- Case-study reveals (project.html) ----------------
     Guarded on .case-hero so this is a no-op on every other page.
     Hero copy fades in immediately on load (it's the first thing
     visible, nothing to scroll for); each .case-row fades + rises in
     once as it crosses into view, same trigger-once pattern as
     initScrollReveals. The image hover treatment itself is
     pure CSS (see .case-image__frame::before in styles.css) — no JS
     needed there. */
  function initCaseStudyReveals() {
    // toArray (not querySelector) — a page can now stack more than one
    // case study (e.g. the campaigns page: Hamleys' hero, then Barbie's
    // further down), so every .case-hero on the page needs its own
    // independent reveal rather than only the first one found.
    const heroes = gsap.utils.toArray('.case-hero');
    if (!heroes.length) return;

    const heroTargetsFor = (hero) => [
      hero.querySelector('.case-back'),
      hero.querySelector('.case-hero__tags'),
      hero.querySelector('.case-hero__title'),
      hero.querySelector('.case-hero__intro'),
    ].filter(Boolean);
    // the big hero figure reveals with the rest of its hero's stagger
    // (same fade/rise/blur), just its own separate scroll-triggered
    // beat below since it's tall enough to still be off-screen at load
    const heroFigures = gsap.utils.toArray('.case-hero__figure');
    const rows = gsap.utils.toArray('.case-row');
    // .case-story (branding.html's Common Ground layout) — text beats
    // fade + rise like .case-row above; each .case-gallery's items
    // stagger in together as the gallery crosses into view, rather
    // than each needing its own individual trigger. .case-pullquote
    // (the single big featured line per case study) and .case-video
    // (a campaign film) get the same treatment as a text beat — each
    // IS one, just styled differently.
    const textBeats = gsap.utils.toArray('.case-beat--text, .case-pullquote, .case-video');
    const galleries = gsap.utils.toArray('.case-gallery');

    if (prefersReducedMotion()) {
      heroes.forEach((hero) => {
        gsap.set(heroTargetsFor(hero), { opacity: 1, clearProps: 'y,filter' });
      });
      gsap.set([...rows, ...textBeats], { opacity: 1, clearProps: 'y,filter' });
      if (heroFigures.length) gsap.set(heroFigures, { opacity: 1, clearProps: 'y,scale' });
      galleries.forEach((gallery) => {
        gsap.set(gallery.querySelectorAll('.case-gallery__item'), { opacity: 1, clearProps: 'y,scale' });
      });
      return;
    }

    heroes.forEach((hero, i) => {
      const heroTargets = heroTargetsFor(hero);
      gsap.set(heroTargets, { opacity: 0, y: 16, filter: 'blur(6px)' });
      if (i === 0) {
        // the page's first hero sits above the fold — reveal it right
        // on load, same as before.
        gsap.to(heroTargets, {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.8,
          stagger: 0.08,
          ease: 'power3.out',
          delay: 0.15,
        });
      } else {
        // any later hero (a second stacked case study further down
        // the page) is off-screen at load, so it reveals on scroll
        // instead of firing an invisible tween immediately.
        ScrollTrigger.create({
          trigger: hero,
          start: 'top 85%',
          once: true,
          onEnter: () => gsap.to(heroTargets, {
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
            duration: 0.8,
            stagger: 0.08,
            ease: 'power3.out',
          }),
        });
      }
    });

    heroFigures.forEach((heroFigure) => {
      gsap.set(heroFigure, { opacity: 0, y: 40, scale: 0.97 });
      ScrollTrigger.create({
        trigger: heroFigure,
        start: 'top 90%',
        once: true,
        onEnter: () => gsap.to(heroFigure, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'power3.out' }),
      });
    });

    gsap.set(rows, { opacity: 0, y: 32 });
    rows.forEach((row) => {
      ScrollTrigger.create({
        trigger: row,
        start: 'top 85%',
        once: true,
        onEnter: () => gsap.to(row, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }),
      });
    });

    gsap.set(textBeats, { opacity: 0, y: 32 });
    textBeats.forEach((beat) => {
      ScrollTrigger.create({
        trigger: beat,
        start: 'top 85%',
        once: true,
        onEnter: () => gsap.to(beat, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }),
      });
    });

    galleries.forEach((gallery) => {
      const items = gallery.querySelectorAll('.case-gallery__item');
      gsap.set(items, { opacity: 0, y: 40, scale: 0.94 });
      ScrollTrigger.create({
        trigger: gallery,
        start: 'top 88%',
        once: true,
        onEnter: () => gsap.to(items, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.7,
          stagger: { each: 0.06, from: 'start', grid: 'auto' },
          ease: 'power3.out',
        }),
      });
    });
  }

  /* ---------------- Case-study section nav (branding.html) ----------------
     Guarded on .case-nav, so a no-op everywhere else. Watches every
     .case-beat[id] with one IntersectionObserver (cheaper than a
     ScrollTrigger per section for what's just "which one is
     current") and, whenever the active one changes, sets both the
     matching link's active class and a --case-nav-active index on the
     nav itself — that custom property is what the sliding pill
     indicator (styles.css) reads to animate between positions, so the
     indicator's motion and the label swap are always driven by the
     same single source instead of two separate systems that could
     drift out of sync. Clicking a link smooth-scrolls via Lenis when
     it's active (matching how every other in-page scroll on this site
     moves) and falls back to the native anchor jump otherwise. */
  function initCaseNav() {
    const nav = document.querySelector('.case-nav');
    if (!nav) return;

    const links = gsap.utils.toArray('.case-nav__link');
    const sections = links
      .map((link) => document.getElementById(link.dataset.caseNav))
      .filter(Boolean);
    if (!sections.length) return;

    const setActive = (id) => {
      const index = sections.findIndex((section) => section.id === id);
      if (index === -1) return;
      nav.style.setProperty('--case-nav-active', index);
      links.forEach((link) => {
        link.classList.toggle('case-nav__link--active', link.dataset.caseNav === id);
      });
    };
    setActive(sections[0].id);

    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) setActive(entry.target.id);
          });
        },
        { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
      );
      sections.forEach((section) => observer.observe(section));
    }

    links.forEach((link) => {
      link.addEventListener('click', (event) => {
        const target = document.getElementById(link.dataset.caseNav);
        if (!target) return;
        event.preventDefault();
        if (lenisInstance) {
          lenisInstance.scrollTo(target, { offset: -40 });
        } else {
          target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
        }
      });
    });
  }

  /* ---------------- Custom cursor glow ----------------
     Rides alongside the recoloured native-shaped cursor (styles.css)
     — that one keeps the OS arrow's silhouette and just reflects the
     site's palette; this small blurred dot is the part that actually
     moves and reacts, gliding after the real cursor with a touch of
     lag (quickTo, same mechanism as the magnetic nav) instead of
     snapping to it 1:1, and blooming open over anything clickable so
     hovering something interactive is felt, not just implied by a
     plain pointer. */
  function initCustomCursor() {
    const glow = document.querySelector('.cursor-glow');
    if (!glow || !window.matchMedia('(pointer: fine)').matches || prefersReducedMotion()) return;

    const setX = gsap.quickTo(glow, 'x', { duration: 0.5, ease: 'power3.out' });
    const setY = gsap.quickTo(glow, 'y', { duration: 0.5, ease: 'power3.out' });

    // "Click to open" tag (Index.html only — .cursor-tag doesn't exist
    // on the case-study pages) follows the same cursor position as the
    // glow, just offset down-right so it doesn't sit directly under
    // the pointer, and only actually shown while over a project card.
    const tag = document.querySelector('.cursor-tag');
    const setTagX = tag ? gsap.quickTo(tag, 'x', { duration: 0.35, ease: 'power3.out' }) : null;
    const setTagY = tag ? gsap.quickTo(tag, 'y', { duration: 0.35, ease: 'power3.out' }) : null;
    const TAG_OFFSET = 22;

    let visible = false;
    window.addEventListener('mousemove', (event) => {
      if (!visible) {
        gsap.to(glow, { opacity: 1, duration: 0.3 });
        visible = true;
      }
      setX(event.clientX);
      setY(event.clientY);
      if (setTagX && setTagY) {
        setTagX(event.clientX + TAG_OFFSET);
        setTagY(event.clientY + TAG_OFFSET);
      }
    });
    document.addEventListener('mouseleave', () => {
      gsap.to(glow, { opacity: 0, duration: 0.3 });
      visible = false;
    });

    const INTERACTIVE = 'a, button, [role="button"], input, textarea, select, label, .testimonial-card';
    document.addEventListener('mouseover', (event) => {
      if (event.target.closest(INTERACTIVE)) {
        gsap.to(glow, { scale: 2.2, duration: 0.4, ease: 'power3.out' });
      }
      if (tag && event.target.closest('.project-thumb')) {
        gsap.to(tag, { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out' });
      }
    });
    document.addEventListener('mouseout', (event) => {
      const leavingInteractive = event.target.closest(INTERACTIVE);
      const enteringInteractive = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest(INTERACTIVE);
      if (leavingInteractive && !enteringInteractive) {
        gsap.to(glow, { scale: 1, duration: 0.4, ease: 'power3.out' });
      }
      if (tag) {
        const leavingCard = event.target.closest('.project-thumb');
        const enteringCard = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest('.project-thumb');
        if (leavingCard && !enteringCard) {
          gsap.to(tag, { opacity: 0, scale: 0.75, duration: 0.25, ease: 'power3.out' });
        }
      }
    });
  }

  function initResizeRefresh() {
    let resizeTimer;
    const refresh = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        // Re-measure before ScrollTrigger.refresh() — the arc's own
        // char positions don't need recomputing (their translateY/
        // rotate are fixed px/deg per character index, not width-
        // dependent), only whether the sentence still fits at the new
        // container width, since resizing wider without this would
        // leave it stuck at whatever smaller size a previous, narrower
        // width required.
        fitWhyStatement();
        positionStatCards();
        ScrollTrigger.refresh();
      }, 200);
    };
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);

    // Every ScrollTrigger start/end below the fold is computed from
    // real layout, which web fonts (Inter/Fraunces, both loaded async
    // via <link>) can still shift after DOMContentLoaded — a fallback
    // system font swapping in for the real one changes text height,
    // and that error compounds the further down the page an element
    // sits. Without this, a deep once:true trigger can measure against
    // pre-swap layout and fire the instant scroll starts (or even
    // immediately, if the pre-swap position already reads as "in
    // view"), consuming its one shot before the page has actually
    // scrolled there.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        // The real display font (vs whatever fallback rendered first)
        // can be measurably wider/narrower per character, which shifts
        // exactly how much shrink .why-statement needs to stay on one
        // line — re-fit before refreshing everything else's layout.
        fitWhyStatement();
        positionStatCards();
        ScrollTrigger.refresh();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHeaderTheme();
    initNavToggle();
    initLenis();
    initEntrance();
    initSpiralField();
    initMagneticNav();
    initScrollReveals();
    initCurveFloat();
    initSectionColorTransitions();
    initProjectsMarquee();
    initTvShowcase();
    initProjectChips();
    initFooterMarquee();
    initAboutStats();
    initTestimonials();
    initPhilosophyScroll();
    initFlyingCard();
    initAboutDoodles();
    initCaseStudyReveals();
    initCaseNav();
    initCaseCycles();
    initCustomCursor();
    initResizeRefresh();
  });
})();
