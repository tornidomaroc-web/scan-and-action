import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { FileText, Network, Sparkles, ListChecks } from 'lucide-react';

import { SectionHeading } from '../src/components/SectionHeading';

// ============================================================================
// SectionHeading — locked, human-approved spec (File Detail redesign)
// ============================================================================
// One monochrome neutral Lucide icon at 18px, a 16px semibold ink title, a 10px
// icon↔text gap, sentence case (authored in copy), and NO divider line. These
// tests lock the spec in so a future tweak that re-inverts the hierarchy, colors
// the icon, or reintroduces a rule under a heading fails CI.
// ============================================================================

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

let container: HTMLDivElement;
let root: Root;

function mount(node: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => root.render(node));
}

afterEach(() => { root.unmount(); container.remove(); });

describe('SectionHeading — rendered spec', () => {
  it('renders the title text and a single 18px icon', () => {
    mount(<SectionHeading icon={FileText}>Source view</SectionHeading>);
    expect(container.textContent).toContain('Source view');
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(1); // exactly one icon
    const svg = svgs[0];
    expect(svg.getAttribute('width')).toBe('18');
    expect(svg.getAttribute('height')).toBe('18');
  });

  it('title is 16px (text-base), semibold, primary ink; 10px gap (gap-2.5)', () => {
    mount(<SectionHeading icon={Network}>Relationships</SectionHeading>);
    const h = container.querySelector('h3') as HTMLElement;
    expect(h).toBeTruthy();
    expect(h.className).toContain('text-base');   // 16px
    expect(h.className).toContain('font-semibold');
    expect(h.className).toContain('text-ink');
    expect(h.className).toContain('gap-2.5');      // 10px icon↔text gap
    expect(h.className).toContain('items-center');
    // The 12px `text-section`/`text-label` sizes must NOT be used for the heading.
    expect(h.className).not.toContain('text-section');
    expect(h.className).not.toContain('text-label');
  });

  it('icon is monochrome-neutral (ink token), never a semantic/accent color', () => {
    mount(<SectionHeading icon={Sparkles}>AI synthesis</SectionHeading>);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('class') || '').toContain('text-ink-faint');
    for (const colored of ['text-accent', 'text-success', 'text-warning', 'text-danger']) {
      expect(svg.getAttribute('class') || '').not.toContain(colored);
    }
  });

  it('draws no divider/separator line and no background tile', () => {
    mount(<SectionHeading icon={ListChecks}>Extracted facts</SectionHeading>);
    const h = container.querySelector('h3') as HTMLElement;
    expect(h.className).not.toMatch(/\bborder(-|\b)/); // no border-* on the heading
    expect(h.className).not.toContain('divide');
    // The icon is bare (no rounded tile / bg box like the old success-tint chip).
    expect(container.querySelector('.rounded-btn')).toBeNull();
    expect(container.innerHTML).not.toContain('bg-success-tint');
    expect(container.innerHTML).not.toContain('bg-accent-tint');
  });
});

// ── Generalization (item E rollout): optional icon + semantic level override ──
describe('SectionHeading — icon-less mode (optional icon)', () => {
  it('renders NO icon and the title alone, with no dangling gap artifact', () => {
    mount(<SectionHeading>Documents processed</SectionHeading>);
    // No icon SVG at all.
    expect(container.querySelectorAll('svg').length).toBe(0);
    // Title still present.
    expect(container.textContent).toContain('Documents processed');
    // Exactly ONE element child (the title span) — nothing before it that a
    // `gap` could space away from, so no leading-gap artifact.
    const h = container.querySelector('h3') as HTMLElement;
    expect(h.children.length).toBe(1);
    expect((h.children[0] as HTMLElement).tagName).toBe('SPAN');
    expect(h.children[0].textContent).toBe('Documents processed');
  });

  it('keeps the identical visual style with no icon (16px semibold ink)', () => {
    mount(<SectionHeading>Quick actions</SectionHeading>);
    const h = container.querySelector('h3') as HTMLElement;
    expect(h.className).toContain('text-base');
    expect(h.className).toContain('font-semibold');
    expect(h.className).toContain('text-ink');
    expect(h.className).not.toContain('text-section');
    expect(h.className).not.toContain('text-[13px]');
    expect(h.className).not.toContain('text-ink-tertiary');
  });
});

describe('SectionHeading — semantic level override (as prop)', () => {
  it('defaults to <h3>', () => {
    mount(<SectionHeading icon={FileText}>Default level</SectionHeading>);
    expect(container.querySelector('h3')).toBeTruthy();
    expect(container.querySelector('h2')).toBeNull();
  });

  it('emits <h2> when as="h2", with the SAME visual style (icon-less)', () => {
    mount(<SectionHeading as="h2">Documents by status</SectionHeading>);
    const h2 = container.querySelector('h2') as HTMLElement;
    expect(h2).toBeTruthy();
    expect(container.querySelector('h3')).toBeNull();
    // Level changes the tag only — the visual style is unchanged.
    expect(h2.className).toContain('text-base');
    expect(h2.className).toContain('font-semibold');
    expect(h2.className).toContain('text-ink');
    expect(h2.className).toContain('gap-2.5');
  });

  it('emits <h2> with an icon too (18px neutral), still one icon', () => {
    mount(<SectionHeading as="h2" icon={Network}>With icon</SectionHeading>);
    const h2 = container.querySelector('h2') as HTMLElement;
    expect(h2).toBeTruthy();
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(1);
    expect(svgs[0].getAttribute('width')).toBe('18');
    expect(svgs[0].getAttribute('class') || '').toContain('text-ink-faint');
  });
});

describe('SectionHeading — source is token-only (no raw palette)', () => {
  const src = read('../src/components/SectionHeading.tsx');
  const RAW_PALETTE = [
    'text-slate-', 'bg-slate-', 'text-blue-', 'bg-blue-', 'text-emerald-',
    'bg-emerald-', 'text-red-', 'bg-red-', 'text-amber-', 'dark:text-',
  ];
  it('uses only --sa-* token utilities', () => {
    for (const p of RAW_PALETTE) expect(src).not.toContain(p);
  });
});

// ── The four File-Detail sections all route through SectionHeading, and the
//    old inconsistent heading markup is gone (source scan). ──────────────────
describe('File Detail — all four sections use the shared SectionHeading', () => {
  const screen = read('../src/screens/DocumentDetailScreen.tsx');

  it('imports SectionHeading and uses it four times (one per section)', () => {
    expect(screen).toContain("import { SectionHeading } from '../components/SectionHeading'");
    const uses = screen.match(/<SectionHeading /g) || [];
    expect(uses.length).toBe(4);
  });

  it('no section heading is left at the old 12/15px level (text-section / h4 label)', () => {
    // The four headings no longer use text-section, and the AI h4 is gone.
    expect(screen).not.toContain('text-section font-semibold text-ink');
    expect(screen).not.toContain('text-label font-semibold text-accent-text');
  });

  it('AI-analysis heading is promoted (no longer the smallest ~12px h4)', () => {
    expect(screen).toContain('<SectionHeading icon={Sparkles}>{s.aiSynthesis}</SectionHeading>');
  });

  it('the data-relationships section draws no top divider/separator line', () => {
    expect(screen).not.toContain('mt-12 border-t border-divider pt-8');
    expect(screen).toContain('<SectionHeading icon={Network}>{s.graphRelationships}</SectionHeading>');
  });

  it('the page h1 (title-lg) is untouched — one step larger than the sections', () => {
    expect(screen).toContain('truncate text-title-lg font-semibold tracking-tight text-ink');
  });
});
