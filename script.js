(() => {
  // The nav itself no longer collapses (see .primary-nav__categories
  // in styles.css — always visible now that it's just 4 short links),
  // but this breakpoint still gates the magnetic-nav hover behavior
  // and the spiral tiles' mobile timeScale/hide adjustment below.
  const STACK_BP = 720;

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const prefersReducedMotion = () => reduceMotionQuery.matches;

  // Set inside initLenis when a Lenis instance actually exists (desktop,
  // fine pointer, motion not reduced) — initScrollRail's click/drag-to-
  // jump uses this instead of window.scrollTo so it drives the same
  // smoothed scroll everything else on the page already goes through,
  // instead of the two fighting over the scroll position each frame.
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

    // headline is visible through page load, just softly out of focus —
    // scrolling is what sharpens it, and now (per direct request) that's
    // scrubbed 1:1 with scroll distance rather than a fixed-duration
    // trigger-once play: a small scroll clears proportionally little
    // blur, not the whole line at once. .hero reserves an extra
    // --hero-reveal-buffer of scroll distance for exactly this (see
    // .hero in styles.css) — .why-section can't start sliding up to
    // cover the headline until that same distance has been scrolled,
    // so the reveal always finishes before anything starts covering it.
    // Plain-number start/end (not a trigger element) for the same
    // sticky reason as before: .hero's own top stays pinned at the
    // viewport edge for its whole scroll range, so a trigger-relative
    // position would never cross it; an absolute scroll-position number
    // sits outside that and tracks real scroll input directly.
    const revealBuffer = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--hero-reveal-buffer')
    ) || 600;

    if (typeof SplitText !== 'undefined' && headline) {
      const split = new SplitText(headline, { type: 'words', wordsClass: 'word' });
      gsap.set(split.words, { filter: 'blur(10px)' });

      gsap.to(split.words, {
        filter: 'blur(0px)',
        stagger: 0.05,
        ease: 'none',
        scrollTrigger: {
          start: 0,
          end: revealBuffer,
          scrub: true,
        },
      });
    } else if (headline) {
      gsap.set(headline, { filter: 'blur(10px)' });

      gsap.to(headline, {
        filter: 'blur(0px)',
        ease: 'none',
        scrollTrigger: {
          start: 0,
          end: revealBuffer,
          scrub: true,
        },
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
    const REFERENCE_VIEWPORT = 1440; // width at which maxR hits the reference's own scale
    const REFERENCE_MAX_R = 900; // was 1000 (reference's exact value), pulled in to 820 then eased back out a bit — 820/4.5 packed noticeably denser than intended, this is the middle ground

    let half = 0;
    let maxR = 0;

    function measure() {
      const rect = field.getBoundingClientRect();
      half = tiles[0].offsetWidth / 2;
      // literal proportional scaling of the reference's fixed 1000 —
      // this IS exactly 1000 at a 1440px hero, same as the file
      maxR = REFERENCE_MAX_R * (rect.width / REFERENCE_VIEWPORT);
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
      if (u < FADE_IN_END) opacity = u / FADE_IN_END;
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
    const speedState = { hover: 1 };

    // Scroll velocity spins the field faster while you're actively
    // scrolling (through the hero — the field is only ever visible
    // during that window anyway, since .why-section covers it via
    // z-index once you've scrolled past) and eases back down to the
    // normal baseSpeed the instant scrolling slows or stops — no
    // separate "scroll ended" event needed, just a per-frame decay
    // toward 1 that only gets pushed back up while real scroll delta
    // keeps arriving. Read directly off window.scrollY (not a scroll
    // event) so it stays correct regardless of Lenis smoothing.
    let lastScrollY = window.scrollY;
    let scrollBoost = 1;
    const SCROLL_SENSITIVITY = 0.05; // multiplier added per px of scroll delta in one frame
    const MAX_SCROLL_BOOST = 3; // caps the added multiplier (so total speed tops out at 4x)
    const BOOST_SMOOTHING = 0.15; // per-frame lerp toward the current target — the actual "ease back down"

    function tick() {
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      const currentScrollY = window.scrollY;
      const scrollDelta = Math.abs(currentScrollY - lastScrollY);
      lastScrollY = currentScrollY;
      const targetBoost = 1 + Math.min(scrollDelta * SCROLL_SENSITIVITY, MAX_SCROLL_BOOST);
      scrollBoost += (targetBoost - scrollBoost) * BOOST_SMOOTHING;

      elapsed += delta * baseSpeed * speedState.hover * scrollBoost;
      const globalProgress = elapsed * CYCLE_SPEED;
      entries.forEach((entry) => apply(entry, globalProgress));
    }
    gsap.ticker.add(tick);

    const hoverMq = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (hoverMq.matches) {
      field.addEventListener('pointerenter', () => {
        gsap.to(speedState, { hover: 0.22, duration: 0.6, ease: 'power2.out' });
      });
      field.addEventListener('pointerleave', () => {
        gsap.to(speedState, { hover: 1, duration: 0.6, ease: 'power2.out' });
      });
    }

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
     wrapped it to) before committing to the curve. On narrower
     viewports where it wraps (below the ~700px container-query
     breakpoint that removes .why-statement's max-width), the arc is
     skipped entirely and the text just reveals on a flat baseline. */
  function initScrollReveals() {
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

  /* ---------------- WHY pause ----------------
     Pins the *whole* .why-section — heading, statement, and the
     marquee below it together, the full "screen" the user actually
     sees — for a stretch of extra scroll once it reaches the top of
     the viewport, holding that moment before releasing into whatever
     section follows. An earlier pass here pinned only .why-pause
     (just the heading+statement, not the marquee, which is a sibling
     further down the DOM) — the marquee sat below the fold for the
     whole pin, reading as a dead gap rather than an emphasis beat.
     Pinning the section itself avoids that: everything the user sees
     right now holds together as one unit. .why-section is
     position:relative (not sticky, unlike .hero — see the long
     comment on .hero in styles.css), so a plain pin here has nothing
     of its own to fight. */
  function initWhyPause() {
    const whySection = document.querySelector('.why-section');
    if (!whySection || prefersReducedMotion()) return;

    ScrollTrigger.create({
      trigger: whySection,
      start: 'top top',
      end: () => `+=${window.innerHeight * 0.6}`,
      pin: true,
      anticipatePin: 1,
    });
  }

  /* ---------------- Projects reel (pinned scroll reel) ----------------
     Adapted from the client-supplied reference
     "creative_scroll_projects (7).html" (superseding the earlier (3)
     pass's opposite-direction word slide) — a scroll-scrubbed GSAP
     timeline drives 3 independent stacks (left words, image cards,
     right words), each internally laid out as 4 items absolutely
     layered on top of themselves. Both word columns now swing
     identically: rotationX + yPercent + scale + blur combine into a
     3D "plank on a hinge" motion (the hinge sits behind the screen —
     see .projects-reel__word's transform-origin in styles.css) rather
     than a flat slide. Cards transition via an angled clip-path sweep
     (the polygon's corners overshoot past 0%/100% instead of sitting
     flush, giving the reveal a diagonal edge instead of a straight
     line) combined with scale/rotation/brightness/blur. A one-time
     fade+rise still reveals the first category as the section scrolls
     into view (before the pin engages), and .projects-reel__card-media
     gets a plain CSS hover/focus scale (deliberately on that inner
     wrapper, not the card itself, so it never fights GSAP's own
     inline transform on the outer element). pin:true (not the
     reference's native position:sticky) for the same reason as
     .philosophy-pin-wrapper elsewhere on this page: this section
     relies on overflow:hidden for the shared post-hero z-index fix,
     and sticky positioning inside an overflow:hidden ancestor is a
     known fragile combination. Reduced motion skips this whole
     function (pin/timeline and the mouse-tilt handlers alike); see
     the .projects-reel__* rules inside the reduced-motion media query
     in styles.css for how the layout unwinds into a plain 4-row list
     instead. */
  function initProjectsReel() {
    const wrapper = document.getElementById('projects-reel');
    const imageTrack = document.getElementById('projects-reel-image-track');
    if (!wrapper || !imageTrack || prefersReducedMotion()) return;

    const leftWords = gsap.utils.toArray('.projects-reel__word-col--left .projects-reel__word');
    const rightWords = gsap.utils.toArray('.projects-reel__word-col--right .projects-reel__word');
    const cards = gsap.utils.toArray('.projects-reel__card');
    if (leftWords.length < 2 || rightWords.length !== leftWords.length || cards.length !== leftWords.length) return;

    // corners overshoot past the 0%/100% edges (115%, -20%) rather than
    // sitting flush, so the sweep reads as a sheared diagonal cut
    // instead of a flat horizontal line
    const HIDDEN_CLIP = 'polygon(0% 100%, 100% 115%, 100% 115%, 0% 100%)';
    const VISIBLE_CLIP = 'polygon(0% -20%, 100% -20%, 100% 100%, 0% 100%)';

    const words = [...leftWords, ...rightWords];
    gsap.set(words, { yPercent: 100, rotationX: -80, opacity: 0, filter: 'blur(20px)', scale: 0.7 });
    gsap.set(cards, { clipPath: HIDDEN_CLIP, scale: 1.4, rotation: 8, filter: 'brightness(0) blur(15px)' });
    cards.forEach((card, i) => { gsap.set(card, { zIndex: i }); });

    gsap.set([leftWords[0], rightWords[0]], { yPercent: 0, rotationX: 0, opacity: 1, filter: 'blur(0px)', scale: 1 });
    gsap.set(cards[0], { clipPath: VISIBLE_CLIP, scale: 1, rotation: 0, filter: 'brightness(1) blur(0px)' });
    cards.slice(1).forEach((card) => { card.style.pointerEvents = 'none'; });

    // One-time entrance for the very first category, layered on top of
    // the pin-ready state set above (leftWords[0]/rightWords[0] stay at
    // their correct rest transform; cards[0] stays at its correct
    // clip-path/scale/filter) — this only adds an extra fade + rise
    // that resolves before the section reaches the top of the
    // viewport, so there's something to see arriving as you scroll
    // down to it instead of it just sitting there fully formed already.
    gsap.set([cards[0], leftWords[0], rightWords[0]], { opacity: 0, y: 32 });
    ScrollTrigger.create({
      trigger: wrapper,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to([cards[0], leftWords[0], rightWords[0]], {
          opacity: 1,
          y: 0,
          duration: 1,
          stagger: 0.08,
          ease: 'power3.out',
        });
      },
    });

    const progressBar = document.getElementById('projects-reel-progress');

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: wrapper,
        start: 'top top',
        // 100% of a viewport per category, matching the reference's own
        // ~100vh-per-item pacing (600vh wrapper minus the 100vh sticky
        // viewport = 500vh of scroll-through for its 5 items)
        end: `+=${(leftWords.length - 1) * 100}%`,
        scrub: 1.5, // matches the reference's own scrub value exactly
        pin: true,
        anticipatePin: 1,
        onUpdate: (self) => {
          if (progressBar) gsap.set(progressBar, { scaleX: self.progress });
          // pointer-events driven directly off scroll progress every
          // update, not off the per-transition onStart callbacks below
          // (see the comment on those) — this is what stays correct no
          // matter how the user scrolls back and forth through the reel.
          const activeIndex = Math.min(
            cards.length - 1,
            Math.round(self.progress * (leftWords.length - 1))
          );
          cards.forEach((card, idx) => {
            card.style.pointerEvents = idx === activeIndex ? 'auto' : 'none';
          });
        },
      },
    });

    for (let i = 1; i < leftWords.length; i += 1) {
      const label = `slide${i}`;

      // outgoing word pair swings up and away, into the distance
      tl.to([leftWords[i - 1], rightWords[i - 1]], {
        yPercent: -100,
        rotationX: 80,
        opacity: 0,
        scale: 0.7,
        filter: 'blur(20px)',
        duration: 1,
        ease: 'power2.inOut',
      }, label);

      // incoming word pair swings up from below into clear focus
      tl.to([leftWords[i], rightWords[i]], {
        yPercent: 0,
        rotationX: 0,
        opacity: 1,
        scale: 1,
        filter: 'blur(0px)',
        duration: 1,
        ease: 'power2.inOut',
      }, label);

      // outgoing card recedes — shrinks, darkens, blurs behind the
      // incoming one rather than sliding away. (pointer-events for
      // every card are handled by the scrollTrigger's onUpdate above,
      // not here — an onStart-only toggle never undoes itself when the
      // user scrolls back *up* through the reel, since scrub timelines
      // don't replay onStart in reverse, so cards were getting stuck
      // un-clickable/click-through-to-the-wrong-card after any back-
      // and-forth scrolling, which is normal scroll behavior, not an
      // edge case.)
      tl.to(cards[i - 1], {
        scale: 0.85,
        filter: 'brightness(0.2) blur(8px)',
        duration: 1,
        ease: 'power2.inOut',
      }, label);

      // incoming card's angled mask opens fully as it settles to rest
      tl.to(cards[i], {
        clipPath: VISIBLE_CLIP,
        scale: 1,
        rotation: 0,
        filter: 'brightness(1) blur(0px)',
        duration: 1.2,
        ease: 'power3.inOut',
      }, label);

      if (i !== leftWords.length - 1) tl.to({}, { duration: 0.3 });
    }

    // 3D cursor tilt on the image stack — desktop/mouse only. Matches
    // the reference's own tilt intensity (divide-by-35) and axis
    // pairing (rotationY from X movement, rotationX from Y movement).
    // One deliberate change: the reference measures from e.pageX/pageY
    // (document-relative), which includes however far the page has
    // scrolled — fine at the top of the page, but this section is
    // scrolled hundreds of vh deep while pinned, so pageY there is a
    // huge number and the reference's own formula would swing the
    // tilt to wildly wrong angles. clientX/clientY (viewport-relative)
    // give the intended "tilts toward the cursor" effect at any scroll
    // depth. The reference also parallaxes the <img> inside each card
    // against the track's own tilt for a two-layer depth effect; these
    // cards are still placeholder spans (no <img> yet), so the cards
    // themselves take that inverse offset instead — swap this to
    // target an <img> once real photos replace the placeholders.
    if (window.matchMedia('(pointer: fine)').matches) {
      wrapper.addEventListener('mousemove', (event) => {
        const xAxis = (window.innerWidth / 2 - event.clientX) / 35;
        const yAxis = (window.innerHeight / 2 - event.clientY) / 35;
        gsap.to(imageTrack, { rotationY: xAxis, rotationX: yAxis, ease: 'power2.out', duration: 0.8 });
        gsap.to(cards, { x: -xAxis * 6, y: -yAxis * 6, ease: 'power2.out', duration: 0.8 });
      });
      wrapper.addEventListener('mouseleave', () => {
        gsap.to(imageTrack, { rotationY: 0, rotationX: 0, duration: 1, ease: 'power2.out' });
        gsap.to(cards, { x: 0, y: 0, duration: 1, ease: 'power2.out' });
      });
    }
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
     Every word (plus each stage badge and tag pill) gets its opacity
     set every frame purely from its own current distance to that
     focus line: far below (not reached yet) or far above (already
     passed) both read as faded, at the same low opacity — nothing
     "arrives fresh," it's all one strip moving through one point of
     emphasis. Word positions are measured once up front (relative to
     the track, before any transform is applied) rather than re-read
     every frame, so the per-frame work is just arithmetic on cached
     numbers — cheap enough to run on every scroll tick even with 100+
     words. #ph-photo gets a slow continuous drift (not per-stage
     jumps) tied to the same progress value, so it matches the same
     "one continuous pass" feel instead of visibly stepping between
     poses. Skipped entirely under reduced motion — a pinned, scroll-
     jacked, continuously-transformed track is exactly the kind of
     motion that preference exists to avoid; the CSS reduced-motion
     block unwinds everything to plain stacked, always-visible content
     instead (see styles.css). */
  function initPhilosophyScroll() {
    const wrapper = document.querySelector('.philosophy-pin-wrapper');
    const photo = document.getElementById('ph-photo');
    const col = document.querySelector('.philosophy-text-col');
    const track = document.getElementById('philosophy-text-track');
    if (!wrapper || !photo || !col || !track) return;
    if (prefersReducedMotion()) return;
    if (typeof SplitText === 'undefined') return;

    const headings = gsap.utils.toArray('[data-story-heading]');
    const paras = gsap.utils.toArray('[data-story-p1], [data-story-p2], [data-story-p3]');
    const quote = document.querySelector('[data-story-quote]');
    if (!headings.length || !paras.length || !quote) return;

    [...headings, ...paras, quote].forEach((el) => {
      new SplitText(el, { type: 'words', wordsClass: 'word' });
    });

    // Every element the focus line sweeps past — words, badges, and
    // tag pills alike, all driven by the same distance-to-focus math.
    const focusEls = Array.from(track.querySelectorAll('.word, .stage-badge, .philosophy-tag'));
    if (!focusEls.length) return;

    const FOCUS_RANGE = 36; // px — full opacity/scale within this distance of the focus line
    const MIN_OPACITY = 0.18;
    const EASE = gsap.parseEase('power1.out');

    let fadeRange = 220;
    let focusY = 0;
    let trackHeight = 0;
    let cache = []; // { el, center } — center is this word's vertical midpoint, track-relative, measured once

    function measure() {
      const colRect = col.getBoundingClientRect();
      const windowHeight = colRect.height;
      focusY = windowHeight * 0.42;
      fadeRange = Math.max(160, windowHeight * 0.32);

      // measured with the track at its natural (untransformed) flow
      // position, so every offset below is relative to the track's
      // own top regardless of whatever translateY is currently applied
      const prevTransform = track.style.transform;
      track.style.transform = 'none';
      const trackRect = track.getBoundingClientRect();
      trackHeight = trackRect.height;
      cache = focusEls.map((el) => {
        const r = el.getBoundingClientRect();
        return { el, center: r.top - trackRect.top + r.height / 2 };
      });
      track.style.transform = prevTransform;
    }
    measure();

    function render(progress) {
      // track's top starts FADE_RANGE below the focus line (so even
      // the very first word begins dim, not already lit) and ends
      // FADE_RANGE above it once the last word has cleared — see the
      // long comment above for the lead-in/lead-out derivation.
      const trackY = focusY + fadeRange - progress * (trackHeight + fadeRange * 2);
      track.style.transform = `translateY(${trackY}px)`;

      for (let i = 0; i < cache.length; i++) {
        const { el, center } = cache[i];
        const screenY = center + trackY;
        const dist = Math.abs(screenY - focusY);
        let t = (dist - FOCUS_RANGE) / (fadeRange - FOCUS_RANGE);
        t = t < 0 ? 0 : t > 1 ? 1 : EASE(t);
        el.style.opacity = String(1 - t * (1 - MIN_OPACITY));
        el.style.transform = `scale(${1 - t * 0.06})`;
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
     carrying 6 illustrations, each with three independent motions
     split across two nested elements so none of them fight over
     `transform`:
       .about-doodle        — a continuous per-doodle idle drift (a
                               unique little closed loop via layered
                               sine/cosine, so it reads as organic
                               "flowing" rather than a robotic back-
                               and-forth) PLUS a scroll-linked
                               horizontal parallax at its own per-
                               doodle speed — this second part is what
                               actually makes them flow *between*
                               sections: as the page scrolls from
                               #about to #projects, each illustration
                               drifts in from one side of the fixed
                               viewport and out the other at a
                               different rate, instead of moving with
                               the page like ordinary content.
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

    const entries = doodles.map((el) => ({
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
      // +/- so some drift leftward and some rightward relative to the
      // page's own scroll, at visibly different speeds — this
      // spread, not any single value, is what sells "flowing".
      // Sign also decides entrance/exit direction below: a doodle
      // that drifts net-rightward across the scroll enters from the
      // left edge and exits off the right (and the reverse for one
      // that drifts net-leftward), so the enter/exit motion always
      // continues the same direction as its own mid-scroll drift.
      parallaxRange: gsap.utils.random(160, 420) * (gsap.utils.random(0, 1) < 0.5 ? -1 : 1),
    }));

    const ENTER_END = 0.14; // scroll-progress fraction spent flying in from off-screen
    const EXIT_START = 0.86; // and flying back out, symmetrically, at the other end
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
    // own resting left/right% — read live (not cached) so a window
    // resize is reflected on the very next frame with no extra
    // listener. Horizontal (viewport width), not vertical — per
    // direct request, illustrations enter/exit from the left and
    // right edges rather than top/bottom.
    function offscreenDistance() {
      return window.innerWidth * 0.85 + 220;
    }

    function driftX(progress, e) {
      const sign = e.parallaxRange < 0 ? -1 : 1;
      const off = offscreenDistance();
      if (progress <= ENTER_END) {
        const t = enterEase(Math.max(0, progress) / ENTER_END);
        return gsap.utils.interpolate(-sign * off, midDrift(ENTER_END, e.parallaxRange), t);
      }
      if (progress >= EXIT_START) {
        const t = exitEase((Math.min(1, progress) - EXIT_START) / (1 - EXIT_START));
        return gsap.utils.interpolate(midDrift(EXIT_START, e.parallaxRange), sign * off, t);
      }
      return midDrift(progress, e.parallaxRange);
    }

    // 0 before #about arrives, 1 once #projects arrives — drives both
    // the field's own (now very brief — position carries the real
    // enter/exit) opacity safety-fade and every doodle's drift/tilt,
    // recomputed continuously (scrub, not once) so it always matches
    // however far the user has actually scrolled, including mid-
    // scroll direction reversals.
    let scrollProgress = 0;
    ScrollTrigger.create({
      trigger: '.about-section',
      start: 'top bottom',
      endTrigger: '.projects-section',
      end: 'top top',
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
          y: Math.cos(t * e.freqY + e.phase * 1.3) * e.ampY,
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

    let startRect, endRect, startScroll, endScroll;
    let isSetup = false;

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
    const target = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotateY: 0, opacity: 1 };
    const current = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotateY: 0, opacity: 1 };
    let hasTarget = false;

    function applyCard() {
      flyingCard.style.transform = `translate3d(${current.x}px, ${current.y}px, 0) scale(${current.scaleX}, ${current.scaleY})`;
      flipper.style.transform = `rotateY(${current.rotateY}deg)`;
      flyingCard.style.opacity = String(current.opacity);
    }

    gsap.ticker.add(() => {
      if (!hasTarget) return;
      const LERP = 0.35;
      current.x += (target.x - current.x) * LERP;
      current.y += (target.y - current.y) * LERP;
      current.scaleX += (target.scaleX - current.scaleX) * LERP;
      current.scaleY += (target.scaleY - current.scaleY) * LERP;
      current.rotateY += (target.rotateY - current.rotateY) * LERP;
      current.opacity += (target.opacity - current.opacity) * LERP;
      applyCard();
    });

    function calculateBounds() {
      const sRect = startEl.getBoundingClientRect();
      const eRect = endEl.getBoundingClientRect();

      // Bail (keeping the card hidden) if the DOM hasn't painted real
      // dimensions yet — dividing by a zero width later would produce
      // NaN transforms.
      if (sRect.width === 0 || eRect.width === 0) {
        flyingCard.style.opacity = '0';
        return;
      }

      flyingCard.style.opacity = '1';

      const scrollY = window.scrollY;

      startRect = { left: sRect.left, top: sRect.top + scrollY, width: sRect.width, height: sRect.height };
      endRect = { left: eRect.left, top: eRect.top + scrollY, width: eRect.width, height: eRect.height };

      startScroll = startRect.top - window.innerHeight / 2 + startRect.height / 2;
      endScroll = endRect.top - window.innerHeight / 2 + endRect.height / 2;

      flyingCard.style.width = `${startRect.width}px`;
      flyingCard.style.height = `${startRect.height}px`;

      isSetup = true;
      updateCard();
    }

    function updateCard() {
      if (!isSetup) return;

      const scrollY = window.scrollY;
      let progress = 0;
      if (endScroll > startScroll) {
        progress = (scrollY - startScroll) / (endScroll - startScroll);
        progress = Math.max(0, Math.min(1, progress));
      }

      // Sine-mapped ease in/out, not linear, for a premium feel.
      const easeProgress = -(Math.cos(Math.PI * progress) - 1) / 2;

      const currentStartTop = startRect.top - scrollY;
      const currentEndTop = endRect.top - scrollY;

      const startCenterX = startRect.left + startRect.width / 2;
      const startCenterY = currentStartTop + startRect.height / 2;
      const endCenterX = endRect.left + endRect.width / 2;
      const endCenterY = currentEndTop + endRect.height / 2;

      const currentCenterX = startCenterX + (endCenterX - startCenterX) * easeProgress;
      const currentCenterY = startCenterY + (endCenterY - startCenterY) * easeProgress;

      const currentWidth = startRect.width + (endRect.width - startRect.width) * easeProgress;
      const currentHeight = startRect.height + (endRect.height - startRect.height) * easeProgress;

      const scaleX = currentWidth / startRect.width;
      const scaleY = currentHeight / startRect.height;

      const x = currentCenterX - startRect.width / 2;
      const y = currentCenterY - startRect.height / 2;

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
      // flight) — #end-placeholder sits at that exact same rect and
      // is a real, visible element now (not an invisible measurement
      // anchor like #start-placeholder), since it's the photo
      // initPhilosophyScroll's pinned timeline goes on to animate for
      // the rest of the section. Without this the now-motionless
      // flying card would sit frozen on top of that photo the instant
      // the timeline starts moving it somewhere else.
      target.opacity = progress > 0.95 ? 1 - (progress - 0.95) * 20 : 1;

      if (!hasTarget) {
        // First call ever (right after calculateBounds sets isSetup) —
        // snap current straight to target and paint immediately rather
        // than lerping in from the zeroed defaults, which would look
        // like the card flying in from the top-left corner on load.
        hasTarget = true;
        current.x = target.x;
        current.y = target.y;
        current.scaleX = target.scaleX;
        current.scaleY = target.scaleY;
        current.rotateY = target.rotateY;
        current.opacity = target.opacity;
        applyCard();
      }

      // #end-placeholder itself stays invisible (see .portrait-
      // placeholder in styles.css) until this exact moment, so the
      // real photo only appears once the flying card has actually
      // arrived over it — crossfading in as the flying card crossfades
      // out, one continuous photo rather than two overlapping ones.
      endEl.classList.toggle('is-visible', progress > 0.95);
    }

    window.addEventListener('resize', () => {
      requestAnimationFrame(calculateBounds);
    });

    // Every other scroll-driven effect on this page is ScrollTrigger-
    // based, which is what makes it track Lenis's smoothed scroll
    // position correctly (initLenis calls ScrollTrigger.update() on
    // every Lenis tick). A raw window 'scroll' listener here doesn't
    // reliably get that same treatment, and Lenis's own tick doesn't
    // dispatch a native scroll event every frame — so this card could
    // stop tracking scroll position part-way through, freezing fully
    // opaque and mid-flight, permanently overlapping whatever content
    // scrolls up underneath it (position:fixed, so it just sits there).
    // A no-op ScrollTrigger spanning the whole page keeps updateCard
    // driven by the same Lenis-synced update loop as everything else.
    ScrollTrigger.create({ start: 0, end: 'max', onUpdate: updateCard });

    window.addEventListener('load', calculateBounds);
    setTimeout(calculateBounds, 100);
    setTimeout(calculateBounds, 1000);

    // startRect/endRect are captured in *document* coordinates, so
    // they go stale the moment anything below #about (the pinned
    // philosophy scene's 400%-scroll spacer, the projects reel's own
    // pin spacer) finishes inserting or resizing — which can happen
    // well after the setTimeouts above, e.g. on the document.fonts.ready
    // refresh. Recalculating on every ScrollTrigger refresh keeps this
    // in sync the same way the Lenis resize hook above does.
    ScrollTrigger.addEventListener('refresh', calculateBounds);
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

    // Idle float — the set gently bobs and sways, like it's just
    // sitting there running, rather than a perfectly static image.
    // Separate property tweens (y / rotation) so this composes cleanly
    // with the cursor-tilt quickTo's below (rotationX/rotationY),
    // instead of every effect fighting over one shorthand `transform`.
    gsap.to(frame, { y: -10, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.to(frame, { rotation: -0.6, duration: 4, ease: 'sine.inOut', yoyo: true, repeat: -1 });

    // Cursor parallax tilt — desktop/mouse only, same gating as the
    // WHY heading's magnetic letters and the custom cursor. The set
    // leans toward the cursor in 3D as it moves across the section,
    // like it's watching you back.
    if (window.matchMedia('(pointer: fine)').matches) {
      const showcase = document.querySelector('.tv-showcase');
      const quickRotX = gsap.quickTo(frame, 'rotationX', { duration: 0.6, ease: 'power3.out' });
      const quickRotY = gsap.quickTo(frame, 'rotationY', { duration: 0.6, ease: 'power3.out' });
      const TILT_MAX = 10; // deg
      (showcase || document).addEventListener('mousemove', (e) => {
        const rect = frame.getBoundingClientRect();
        const px = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        const py = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
        quickRotX(gsap.utils.clamp(-TILT_MAX, TILT_MAX, -py * TILT_MAX));
        quickRotY(gsap.utils.clamp(-TILT_MAX, TILT_MAX, px * TILT_MAX));
      });
      (showcase || document).addEventListener('mouseleave', () => {
        quickRotX(0);
        quickRotY(0);
      });
    }
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

  /* ---------------- Resize handling ---------------- */
  /* ---------------- Custom scroll rail (fixed, right edge) ----------------
     Thumb position is driven by a no-op ScrollTrigger's onUpdate, same
     fix as initFlyingCard above — a raw `scroll` listener isn't
     reliably kept in sync with Lenis's smoothed scroll. Click/drag on
     the track jumps the real page scroll via lenis.scrollTo when Lenis
     is active, falling back to window.scrollTo on touch/reduced-motion
     builds where initLenis never created an instance. */
  function initScrollRail() {
    const rail = document.querySelector('.scroll-rail');
    const track = document.querySelector('.scroll-rail__track');
    const thumb = document.querySelector('.scroll-rail__thumb');
    if (!rail || !track || !thumb || !window.matchMedia('(pointer: fine)').matches) return;

    const THUMB_PERCENT = 16; // matches .scroll-rail__thumb's height in styles.css
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        thumb.style.top = `${self.progress * (100 - THUMB_PERCENT)}%`;
      },
    });

    function maxScroll() {
      if (lenisInstance) return lenisInstance.limit;
      return document.documentElement.scrollHeight - window.innerHeight;
    }

    function scrollToProgress(progress) {
      const target = Math.min(1, Math.max(0, progress)) * maxScroll();
      if (lenisInstance) {
        lenisInstance.scrollTo(target, { immediate: prefersReducedMotion() });
      } else {
        window.scrollTo({ top: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
    }

    function progressFromClientY(clientY) {
      const rect = track.getBoundingClientRect();
      return (clientY - rect.top) / rect.height;
    }

    track.addEventListener('pointerdown', (event) => {
      track.setPointerCapture(event.pointerId);
      rail.classList.add('is-dragging');
      scrollToProgress(progressFromClientY(event.clientY));

      const onMove = (moveEvent) => scrollToProgress(progressFromClientY(moveEvent.clientY));
      const onUp = () => {
        rail.classList.remove('is-dragging');
        track.removeEventListener('pointermove', onMove);
      };
      track.addEventListener('pointermove', onMove);
      track.addEventListener('pointerup', onUp, { once: true });
      track.addEventListener('pointercancel', onUp, { once: true });
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
      if (tag && event.target.closest('.projects-reel__card')) {
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
        const leavingCard = event.target.closest('.projects-reel__card');
        const enteringCard = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest('.projects-reel__card');
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
      resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 200);
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
      document.fonts.ready.then(() => ScrollTrigger.refresh());
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHeaderTheme();
    initLenis();
    initEntrance();
    initSpiralField();
    initMagneticNav();
    initScrollReveals();
    initWhyPause();
    initCurveFloat();
    initSectionColorTransitions();
    initProjectsMarquee();
    initTvShowcase();
    initFooterMarquee();
    initAboutStats();
    initTestimonials();
    // DOM order matters here: .philosophy-pin-wrapper (400%-scroll
    // pin) sits before .projects-reel (its own 400%-scroll pin) in
    // the page, and GSAP computes each pinned trigger's start position
    // from the page's current layout at creation time — if the reel's
    // pin were set up before philosophy's pin-spacer exists, its "top
    // top" start gets calculated short by roughly one philosophy-pin's
    // worth of scroll distance and never fully self-corrects on later
    // refreshes, so the reel starts pinning while philosophy is still
    // pinned (two pins fighting over the same scroll range — the
    // "clash" with a dead white gap after). Creating them in the same
    // order they appear on the page avoids that.
    initPhilosophyScroll();
    initFlyingCard();
    initProjectsReel();
    // Same reasoning again: initAboutDoodles' own ScrollTrigger spans
    // from #about all the way to #projects (endTrigger: '.projects-
    // section'), which only measures correctly once philosophy's pin-
    // spacer already exists in the document — called any earlier, that
    // endpoint gets measured against the pre-pin (much shorter) layout
    // and the whole tracked range collapses to roughly #about's own
    // height, cutting the "flow" off while still deep inside philosophy.
    initAboutDoodles();
    initCaseStudyReveals();
    initCaseNav();
    initScrollRail();
    initCustomCursor();
    initResizeRefresh();
  });
})();
