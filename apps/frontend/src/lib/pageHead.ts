import { useEffect } from 'react';
import { isNativePlatform } from '../native/shell';

// The document head of the PUBLIC web pages: title, description, canonical and
// the og:/twitter: copies of the first three.
//
// index.html carries the landing page's values as static markup, which is what
// a crawler that does not run scripts reads for every path, since Vercel serves
// index.html for every route (apps/frontend/vercel.json, the last rewrite). The
// public pages that are not the landing (login, the four legal pages, support)
// set their own values here when they mount, so a rendering crawler, a shared
// link and the browser tab read the page's own title and a canonical that names
// the page itself rather than "/". Everything is restored on unmount, so a
// client-side return to "/" shows the landing values again.
//
// Inside the native shells this does nothing: the WebView has no tab, no
// address bar and no crawler, and the shell's behaviour is left exactly as it
// was (searchPresence.test.ts holds that).

export const SITE_ORIGIN = 'https://www.scan-action.com';
export const SITE_NAME = 'Scan & Action';

export interface PageHead {
  /** The full document title, e.g. "Support | Scan & Action". */
  title: string;
  /** The meta description, one or two plain sentences. */
  description: string;
  /** The route, with its leading slash; the canonical is SITE_ORIGIN + path. */
  path: string;
}

type Slot = { selector: string; attr: 'content' | 'href'; create: (doc: Document) => Element };

const metaByName = (name: string): Slot => ({
  selector: `meta[name="${name}"]`,
  attr: 'content',
  create: (doc) => {
    const el = doc.createElement('meta');
    el.setAttribute('name', name);
    return el;
  },
});
const metaByProperty = (property: string): Slot => ({
  selector: `meta[property="${property}"]`,
  attr: 'content',
  create: (doc) => {
    const el = doc.createElement('meta');
    el.setAttribute('property', property);
    return el;
  },
});
const CANONICAL: Slot = {
  selector: 'link[rel="canonical"]',
  attr: 'href',
  create: (doc) => {
    const el = doc.createElement('link');
    el.setAttribute('rel', 'canonical');
    return el;
  },
};

function setSlot(doc: Document, slot: Slot, value: string): () => void {
  const existing = doc.head.querySelector(slot.selector);
  if (existing) {
    const before = existing.getAttribute(slot.attr);
    existing.setAttribute(slot.attr, value);
    return () => {
      if (before === null) existing.removeAttribute(slot.attr);
      else existing.setAttribute(slot.attr, before);
    };
  }
  const el = slot.create(doc);
  el.setAttribute(slot.attr, value);
  doc.head.appendChild(el);
  return () => el.remove();
}

/** Applies the head values and returns the function that puts the old ones back. */
export function applyPageHead(head: PageHead, doc: Document = document): () => void {
  const url = SITE_ORIGIN + head.path;
  const previousTitle = doc.title;
  doc.title = head.title;
  const undo = [
    setSlot(doc, metaByName('description'), head.description),
    setSlot(doc, CANONICAL, url),
    setSlot(doc, metaByProperty('og:title'), head.title),
    setSlot(doc, metaByProperty('og:description'), head.description),
    setSlot(doc, metaByProperty('og:url'), url),
    setSlot(doc, metaByName('twitter:title'), head.title),
    setSlot(doc, metaByName('twitter:description'), head.description),
  ];
  return () => {
    for (const u of undo.reverse()) u();
    doc.title = previousTitle;
  };
}

export function usePageHead(head: PageHead): void {
  const { title, description, path } = head;
  useEffect(() => {
    if (isNativePlatform()) return undefined;
    return applyPageHead({ title, description, path });
  }, [title, description, path]);
}
