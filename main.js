/* Tabăra de casă a tineretului Betania — interacțiuni
   Fără dependențe. Tot ce se mișcă la derulare folosește doar transform/opacity,
   o singură buclă requestAnimationFrame și se oprește când elementul nu e pe ecran. */
(() => {
  'use strict';

  const doc = document.documentElement;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motionQuery.matches;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- 1. Grupul din hero apare după ce fotografia e gata ---------- */
  const hero = $('.hero');
  const heroImg = hero && $('.cutout__img', hero);
  const heroReady = () => hero && hero.classList.add('is-ready');
  if (heroImg) {
    const decode = () => (heroImg.decode ? heroImg.decode() : Promise.resolve()).catch(() => {}).then(heroReady);
    if (heroImg.complete) decode();
    else {
      heroImg.addEventListener('load', decode, { once: true });
      heroImg.addEventListener('error', heroReady, { once: true });
    }
    setTimeout(heroReady, 2500); // nu lăsăm niciodată grupul ascuns
  }

  /* ---------- 2. Apariții la derulare (cu decalaj pentru elementele vecine) ---------- */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((entries) => {
      let order = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.style.setProperty('--d', `${Math.min(order++, 5) * 0.09}s`);
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.15 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------- 3. Textul care se „aprinde” cuvânt cu cuvânt ---------- */
  const statement = $('[data-illuminate]');
  if (statement && !reduced) {
    const text = statement.textContent.trim().replace(/\s+/g, ' ');
    const words = text.split(' ');
    const forReaders = document.createElement('span');
    forReaders.className = 'sr-only';
    forReaders.textContent = text;
    const visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    words.forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'w';
      span.style.setProperty('--i', i);
      span.textContent = word;
      visual.append(span, i < words.length - 1 ? ' ' : '');
    });
    statement.textContent = '';
    statement.append(forReaders, visual);
    statement.style.setProperty('--n', words.length);
    statement.setAttribute('data-ready', '');
  }

  /* ---------- 4. Trecerea lentă de-a lungul grupului ---------- */
  const pan = $('[data-pan]');
  const panStage = pan && $('.pan__stage', pan);
  const panTrack = pan && $('.pan__track', pan);
  const panCaptions = pan ? $$('.pan__captions li', pan) : [];
  const panBar = pan && $('.pan__progress i', pan);
  const panState = { start: 0, end: 0, mode: 'pan', length: 0, caption: 0 };

  function measurePan() {
    if (!pan || !pan.hasAttribute('data-active')) return;
    pan.style.height = '';
    const stageW = panStage.clientWidth;
    const stageH = panStage.offsetHeight;
    // fotografia ocupă toată înălțimea disponibilă, cu proporțiile originale
    const img = $('.cutout__img', panTrack);
    const ratio = img.getAttribute('width') / img.getAttribute('height') || 1.88;
    const trackH = $('.pan__viewport', pan).clientHeight;
    const trackW = Math.round(trackH * ratio);
    panTrack.style.height = `${trackH}px`;
    panTrack.style.width = `${trackW}px`;
    const gutter = parseFloat(getComputedStyle($('.pan__captions', pan)).paddingLeft) || 20;
    const overflow = trackW + gutter * 2 - stageW;
    if (overflow > 48) {
      panState.mode = 'pan';
      panState.start = gutter;
      panState.end = stageW - trackW - gutter;
      panState.length = Math.abs(panState.end - panState.start) * 1.3 + stageH * 0.5;
    } else {
      // pe ecrane late tot grupul încape: îl centrăm și ne apropiem ușor de el
      panState.mode = 'push';
      panState.start = panState.end = (stageW - trackW) / 2;
      panState.length = stageH * 0.9;
    }
    pan.style.height = `${Math.round(stageH + panState.length)}px`;
  }

  function enablePan(on) {
    if (!pan) return;
    if (on) {
      pan.setAttribute('data-active', '');
      measurePan();
    } else {
      pan.removeAttribute('data-active');
      pan.style.height = '';
      panTrack.style.cssText = '';
      panCaptions.forEach((li, i) => li.classList.toggle('is-active', i === 0));
    }
  }
  enablePan(!reduced);

  /* ---------- 5. Bucla de derulare ---------- */
  const parallaxEls = reduced ? [] : $$('[data-parallax]');
  const live = new Set();          // componentele aflate acum lângă ecran
  const watch = new Map([[hero, 'hero'], [statement, 'statement'], [pan, 'pan']]);
  watch.delete(null);

  if ('IntersectionObserver' in window) {
    const near = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? live.add(watch.get(e.target)) : live.delete(watch.get(e.target))));
      requestTick();
    }, { rootMargin: '25% 0px 25% 0px' });
    watch.forEach((_, el) => near.observe(el));
  } else {
    watch.forEach((name) => live.add(name));
  }

  let ticking = false;
  function requestTick() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  let lastStatementP = -1;
  let heroH = hero ? hero.offsetHeight : 1;
  const heroIntro = hero && $('.hero__intro', hero);
  const parallaxK = parallaxEls.map((el) => parseFloat(el.dataset.parallax) || 0);

  function update() {
    ticking = false;
    if (reduced) return;
    // întâi citim tot ce ține de layout, apoi scriem — fără recalculări forțate
    const vh = window.innerHeight;
    const y = Math.max(0, window.scrollY);
    const statementRect = live.has('statement') && statement.hasAttribute('data-ready')
      ? statement.getBoundingClientRect() : null;
    const panRect = live.has('pan') && pan.hasAttribute('data-active')
      ? pan.getBoundingClientRect() : null;

    if (live.has('hero')) {
      parallaxEls.forEach((el, i) => {
        el.style.transform = `translate3d(0, ${(y * parallaxK[i]).toFixed(1)}px, 0)`;
      });
      heroIntro.style.opacity = clamp(1 - y / (heroH * 0.75), 0, 1).toFixed(3);
    }

    if (statementRect) {
      const r = statementRect;
      const p = clamp((vh * 0.86 - r.top) / (vh * 0.4 + r.height), 0, 1);
      if (Math.abs(p - lastStatementP) > 0.001) {
        statement.style.setProperty('--p', p.toFixed(4));
        lastStatementP = p;
      }
    }

    if (panRect) {
      const r = panRect;
      const raw = clamp(-r.top / Math.max(1, panState.length), 0, 1);
      const p = clamp((raw - 0.07) / 0.86, 0, 1);       // scurtă pauză la început și la final
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const travel = 0.82 * p + 0.18 * eased;           // aproape liniar, cu capete moi
      if (panState.mode === 'pan') {
        const x = panState.start + (panState.end - panState.start) * travel;
        panTrack.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      } else {
        const s = 0.9 + 0.1 * eased;
        panTrack.style.transform = `translate3d(${panState.start.toFixed(1)}px, 0, 0) scale(${s.toFixed(4)})`;
      }
      const idx = p < 0.34 ? 0 : p < 0.68 ? 1 : 2;
      if (idx !== panState.caption) {
        panCaptions.forEach((li, i) => li.classList.toggle('is-active', i === idx));
        panState.caption = idx;
      }
      if (panBar) panBar.style.setProperty('--pp', p.toFixed(4));
    }
  }

  window.addEventListener('scroll', requestTick, { passive: true });

  let lastW = window.innerWidth;
  let lastH = window.innerHeight;
  window.addEventListener('resize', () => {
    // pe iPhone, bara Safari își schimbă înălțimea la derulare: recalculăm doar la schimbări reale
    if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 140) return;
    lastW = window.innerWidth;
    lastH = window.innerHeight;
    if (hero) heroH = hero.offsetHeight;
    measurePan();
    requestTick();
  });
  if (panTrack) $('.cutout__img', panTrack).addEventListener('load', () => { measurePan(); requestTick(); });
  window.addEventListener('load', () => { measurePan(); requestTick(); });

  motionQuery.addEventListener && motionQuery.addEventListener('change', (e) => {
    reduced = e.matches;
    enablePan(!reduced);
    if (reduced) {
      parallaxEls.forEach((el) => { el.style.transform = ''; });
      if (statement) statement.style.setProperty('--p', 1);
      reveals.forEach((el) => el.classList.add('is-in'));
    }
    requestTick();
  });

  /* ---------- 6. Seara: culoarea barei Safari urmează secțiunea finală ---------- */
  const finale = $('.finale');
  const themeMeta = $('meta[name="theme-color"]');
  if (finale && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      doc.classList.toggle('is-night', e.isIntersecting);
      if (themeMeta) themeMeta.setAttribute('content', e.isIntersecting ? '#15120f' : '#faf7f2');
    }, { rootMargin: '0px 0px -60% 0px' }).observe(finale);

    new IntersectionObserver(([e]) => finale.classList.toggle('is-visible', e.isIntersecting)).observe(finale);
  }

  requestTick();
})();
