import { describe, it, expect } from 'vitest';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { LandingScreen } from '../src/screens/LandingScreen';

// ============================================================================
// A LINK INSIDE A RUN OF TEXT IS UNDERLINED. WCAG 1.4.1, NOT A CONTRAST RULE.
// ============================================================================
// The footer renders `Terms of Service · Privacy Policy · Refund Policy`, and
// until the underline it gave a link nothing to tell it from the ` · ` text
// between them: same colour, same weight, same size, no decoration. That passes
// every contrast floor (the pair is 5.8527 against 4.5) and still fails 1.4.1,
// which is why no contrast sweep, in the browser or here, could see it.
//
// SCOPED BY PATTERN, NOT BY NAME. The rule is "every <a> that shares its parent
// with non-whitespace text is underlined", checked over the whole route. A
// fourth inline link, in the footer or in any paragraph, is caught the day it is
// added. A button-styled CTA or a header nav item has no text beside it, so the
// rule does not reach it. The count below says how many the pattern matches
// today, so a pattern that silently matches nothing cannot pass.
//
// WHAT THIS CANNOT SEE. jsdom applies no stylesheet: this proves the utility is
// on the element, not that an underline paints. The browser reading that it
// does is in the PR that added this file.
// ============================================================================

const classesOf = (el: Element) =>
  (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean);

/** An <a> whose parent also holds non-whitespace TEXT, i.e. a link in a text run. */
function inRunOfText(a: Element): boolean {
  const parent = a.parentNode;
  if (!parent) return false;
  return [...parent.childNodes].some((n) => n.nodeType === 3 && /\S/.test(n.textContent ?? ''));
}

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(<MemoryRouter><LandingScreen /></MemoryRouter>));
  const links = [...container.querySelectorAll('a')];
  const inline = links.filter(inRunOfText);
  const footers = [...container.querySelectorAll('footer')];
  const snapshot = {
    all: links.map((a) => ({ text: a.textContent?.trim() ?? '', classes: classesOf(a) })),
    inline: inline.map((a) => ({
      text: a.textContent?.trim() ?? '',
      classes: classesOf(a),
      ancestorsUnderlined: (() => {
        const hits: string[] = [];
        for (let e = a.parentElement; e; e = e.parentElement) {
          if (classesOf(e).includes('underline')) hits.push(e.tagName.toLowerCase());
        }
        return hits;
      })(),
      inFooter: !!a.closest('footer'),
    })),
    footers: footers.map((f) => ({ classes: classesOf(f), links: f.querySelectorAll('a').length })),
  };
  root.unmount();
  container.remove();
  return snapshot;
}

const page = render();

describe('the pattern finds what it should, and only that', () => {
  it('matches exactly the three footer links today', () => {
    expect(page.inline.map((l) => l.text)).toEqual(['Terms of Service', 'Privacy Policy', 'Refund Policy']);
    expect(page.inline.every((l) => l.inFooter)).toBe(true);
  });

  it('does NOT match the CTAs or the header links, which have no text beside them', () => {
    const matched = new Set(page.inline.map((l) => l.text));
    const others = page.all.filter((l) => !matched.has(l.text));
    expect(others.length, 'the route should carry links other than the footer three').toBeGreaterThan(3);
    expect(others.map((l) => l.text)).toContain('Start Free with 10 Scans Included');
    expect(others.map((l) => l.text)).toContain('Log in');
  });

  it('POSITIVE and NEGATIVE CONTROL: the predicate separates the two shapes', () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<p id="run">Read the <a id="yes">terms</a> first.</p>' +
      '<div id="alone"><a id="no">Start</a></div>' +
      '<p id="ws">  <a id="ws-a">Only whitespace beside me</a>  </p>';
    expect(inRunOfText(host.querySelector('#yes')!)).toBe(true);
    expect(inRunOfText(host.querySelector('#no')!)).toBe(false);
    expect(inRunOfText(host.querySelector('#ws-a')!)).toBe(false);
  });
});

describe('every link in a run of text is underlined, and the text around it is not', () => {
  it.each(['Terms of Service', 'Privacy Policy', 'Refund Policy'])('%s carries `underline` itself', (text) => {
    const l = page.inline.find((x) => x.text === text);
    expect(l, `${text} is no longer a link in a run of text`).toBeDefined();
    expect(l!.classes, `${text} is not underlined`).toContain('underline');
    expect(l!.classes, `${text} cancels its underline`).not.toContain('no-underline');
  });

  it('every inline link on the route is underlined, whatever it is called', () => {
    // The by-name assertions above hold today's three; this one holds the
    // pattern, so a fourth inline link cannot arrive without an underline.
    for (const l of page.inline) {
      expect(l.classes, `inline link "${l.text}"`).toContain('underline');
      expect(l.classes, `inline link "${l.text}" cancels its underline`).not.toContain('no-underline');
    }
  });

  it('the footer itself does not carry the underline, so the separators stay plain', () => {
    // text-decoration propagates to descendants: an `underline` on the footer
    // would underline the ` · ` text nodes too and erase the very distinction
    // this exists to create.
    expect(page.footers).toHaveLength(1);
    expect(page.footers[0].links).toBe(3);
    expect(page.footers[0].classes).not.toContain('underline');
  });

  it('no ancestor of any inline link carries it either', () => {
    for (const l of page.inline) expect(l.ancestorsUnderlined, `above "${l.text}"`).toEqual([]);
  });
});
