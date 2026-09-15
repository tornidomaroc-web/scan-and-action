import React from 'react';
import { Link } from 'react-router-dom';
import { PLAN_CATALOG } from '../lib/pricing';
import { LandingHeader } from '../components/LandingHeader';

export function LandingScreen() {
  return (
    // `sa-pin-light` (styles/tokens.css) holds this route's tokens at their light
    // values for the whole subtree, LandingHeader included — custom properties
    // inherit, so one class on this element covers every descendant. Without it
    // the four primary CTAs render #FFFFFF on #F8FAFC (1.05:1) whenever the
    // visitor's OS is in dark mode, because this page is hardcoded light
    // everywhere except the tokens #208/#209 introduced. Do not replace this with
    // `dark:` variants — that is the step-3 colour migration, and there is no
    // designed dark frame to migrate to yet.
    <div className="sa-pin-light bg-slate-50 min-h-screen">
      <LandingHeader />

      {/* 1. Hero Section */}
      {/* py-24 (96px) is the OPENING step of the two-step rhythm this page now
          keeps: 96px for the hero and the closing CTA, 64px for everything
          between them. It replaces `pt-24 pb-20`, which was asymmetric for no
          recorded reason.
          `mb-12` is GONE, and not only for the rhythm: it exposed 48px of the
          page wrapper's `bg-slate-50` (#F8FAFC) directly above section 2, whose
          band is now the `--sa-surface` token (#F5F7FA). Two greys 3 bytes apart
          meeting on a seam reads as a mistake rather than a choice — the same
          objection landingHeroType.test.tsx records against two near-identical
          indigos. With the margin removed the sections are contiguous and the
          wrapper's colour is visible only behind the footer. */}
      <div className="py-24 px-6 bg-white border-b border-slate-100 overflow-hidden">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center text-center lg:text-left">
          <div className="space-y-8 relative z-10 text-center">
            {/* Two DELIBERATE lines. `block` on each span is what guarantees the break
                falls where it was approved instead of wherever the column happens to run
                out — the copy is not a sentence that may rewrap, it is two lines. */}
            {/* 5xl, not 6xl, and this is measured rather than taste: in THIS column the
                approved second line needs 698px at 60px and the hero column is 608px, so
                it wrapped to a third line with "you." orphaned. 48px brings it to ~558px
                and the two approved lines hold. The model gets 60px because its headline
                column is 1180px — nearly double this one. 60px returns when the hero
                becomes a single centred column, which is a layout change and a later PR. */}
            <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight leading-tight">
              <span className="block">Stop typing receipts.</span>
              <span className="block text-accent">Let AI read them for you.</span>
            </h1>
            <p className="text-xl sm:text-2xl text-slate-600 max-w-2xl font-medium leading-relaxed">
              Upload receipts, get structured validated data, and review only what actually needs attention.
            </p>
            <div className="flex flex-col items-center space-y-4 pt-4">
              {/* `text-base sm:text-xl` is what stops the label wrapping to two lines at
                  430px, where it measured 91px tall. The label itself is unchanged: copy
                  other than the headline is out of scope for this change. */}
              <Link to="/login" className="inline-block px-10 py-5 bg-ink text-surface-raised font-black text-base sm:text-xl rounded-2xl hover:opacity-90 transition-all shadow-xl active:scale-95 tracking-tight">
                Start Free with 10 Scans Included
              </Link>
              <p className="text-slate-400 font-bold text-sm tracking-wide">No credit card. Takes 30 seconds.</p>
            </div>
          </div>
          
          {/* Faithful Product Preview (In-Code) */}
          <div className="relative">
            <div className="bg-white rounded-[32px] border border-slate-200 shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6 text-left">
              {/* Mock Header */}
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Starbucks Receipt</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Extraction</p>
                </div>
                <div className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-600 rounded-full text-[10px] font-bold uppercase tracking-wide">
                  Needs Review
                </div>
              </div>

              {/* Mock Decision Banner */}
              <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-xl flex items-center gap-3">
                <div className="w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center text-white font-bold text-xs">!</div>
                <p className="text-xs font-bold text-amber-800">Missing total amount detected</p>
              </div>

              {/* Mock Facts Table */}
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Label</th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-4 py-3 text-sm font-bold text-slate-900">Merchant</td>
                        <td className="px-4 py-3 text-sm text-slate-600">Starbucks Coffee</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm font-bold text-slate-900">Date</td>
                        <td className="px-4 py-3 text-sm text-slate-600">Oct 24, 2023</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm font-bold text-slate-900">Amount</td>
                        <td className="px-4 py-3 text-sm text-amber-800 font-bold flex items-center gap-2">
                           Fix required
                           <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mock Source (Receipt Preview) */}
              <div className="h-40 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center justify-center space-y-3 p-6 opacity-40">
                 <div className="w-full h-2 bg-slate-200 rounded-full" />
                 <div className="w-3/4 h-2 bg-slate-200 rounded-full" />
                 <div className="w-full h-8 bg-slate-200 rounded-lg flex items-center justify-center">
                   <div className="w-16 h-2 bg-slate-300 rounded-full" />
                 </div>
                 <div className="w-1/2 h-2 bg-slate-200 rounded-full" />
              </div>
            </div>

            {/* Subtle shadow depth */}
            <div className="absolute -bottom-6 left-12 right-12 h-6 bg-slate-200 blur-2xl rounded-full opacity-30 -z-10" />
          </div>
        </div>
      </div>

      {/* ======================================================================
          2. THE COST, AND THE ANSWER UNDER IT — one grid, six cards.
          ======================================================================
          This ONE section replaces the two that used to sit either side of
          "How it works": the Problem section (three cards) and the Value
          section (three bare headings). 3 + 3 = the six cards.

          NO COPY IS NEW. Every string below is byte-identical to one that was
          already on this page, in those two sections. The h2 is the Problem
          section's own heading — the Value section never had one, which is why
          a whole band of the page used to open on nothing.

          WHY THE COLUMNS PAIR, and this is the finding the merge surfaced: the
          six items were never six ideas. They are three costs and three
          answers, stated twice —
            "typing every receipt by hand"      <-> "stop wasting hours on manual entry"
            "missing amounts break your reports" <-> "clean data you can actually use"
            "mistakes only after it's too late"  <-> "catch errors before they cost you"
          Laid out as six peers the duplication reads as padding. Laid out as
          three columns, cost above answer, it reads as the argument. The Value
          items are therefore in the order 1, 3, 2 relative to the section that
          held them: a REORDERING of existing copy, not a rewrite.

          WHAT TELLS THE TWO ROWS APART IS THEIR CONTENT, AND THAT IS FORCED BY
          ARITHMETIC RATHER THAN CHOSEN. The first build gave the cost row an
          outline and no fill, so that the answer row could be the only raised
          surface. Then the neutrals were measured against this band (#F5F7FA):

            --sa-surface-raised #FFFFFF fill   1.073      floor for a UI edge: 3
            --sa-line          #E9EBF0 border  1.111
            --sa-line-strong   #E4E7EC border  1.155
            --sa-surface-muted #F1F3F7 fill    1.035

          Nothing in the neutral ramp clears 1.16 on this band. The three cards
          that used to stand here worked by STACKING three weak cues — a white
          fill (1.046 on slate-50), a border (1.178) and `shadow-sm` — not by
          any one of them being visible. An outline-only card has one cue at
          1.111, which is weaker than today's border alone, and would have read
          as a broken card rather than a quiet one. So all six carry the same
          surface: the tokenised form of exactly what the Problem cards already
          shipped. The rows differ by what is IN them — a red mark and one bold
          sentence above, a heading and body copy below.

          A tinted icon tile on the answer row was also rejected, for a
          different reason: it would have made this grid look like "How it
          works", whose accent numerals are now the only accent tiles on the
          page, which is what keeps that section legible as a SEQUENCE rather
          than as six more benefits.

          The one edge that did move: `border-line` (#E9EBF0) is a 6% weaker
          hairline than the `border-slate-200` (#E2E8F0) it replaces, 1.111
          against 1.178. That is the cost of adopting the token the system names
          "default card border", on a card that also has a fill and a shadow.

          COLOUR: this markup is new, so there is no "leave it as it was". It is
          written in tokens — band, card, border and both text ramps move
          together — which is the direction WORK-QUEUE's step-3 entry measured as
          the only safe one (backgrounds alone strand the foregrounds at 1.00:1).
          The one literal island is the `!` tile, kept as the existing approved
          ornament rather than pressed onto `--sa-danger-*`, which is an error
          state and not an editorial mark.
          UNVERIFIED, AND SAY SO: `.sa-pin-light` holds all of these tokens at
          their light values, so this section looks correct in dark mode whether
          that reasoning is right or wrong. What is verified is the pairing
          (tokenLiteralPairing), the pinned set (landingLightPin) and the light
          rendering. The dark reading is owed when the pin comes off.
          ====================================================================== */}
      <div className="py-16 px-6 bg-surface">
        <div className="max-w-7xl mx-auto space-y-12">
          <h2 className="text-3xl sm:text-4xl font-black text-ink text-center">Still typing receipts manually?</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {/* Row 1 - the cost: a red mark and one bold sentence. */}
            <div className="p-8 rounded-3xl border border-line bg-surface-raised shadow-sm space-y-4">
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-black text-xl">!</div>
              <p className="font-bold text-ink text-lg leading-snug">You’re still typing every receipt by hand</p>
            </div>
            <div className="p-8 rounded-3xl border border-line bg-surface-raised shadow-sm space-y-4">
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-black text-xl">!</div>
              <p className="font-bold text-ink text-lg leading-snug">Receipts with missing amounts break your reports</p>
            </div>
            <div className="p-8 rounded-3xl border border-line bg-surface-raised shadow-sm space-y-4">
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-black text-xl">!</div>
              <p className="font-bold text-ink text-lg leading-snug">You find mistakes only after it’s too late</p>
            </div>

            {/* Row 2 - the answer, in the column of the cost it answers. */}
            <div className="p-8 rounded-3xl border border-line bg-surface-raised shadow-sm space-y-3">
              <h3 className="font-black text-ink text-2xl leading-tight">Stop wasting hours on manual entry</h3>
              <p className="text-ink-secondary font-medium">Automatic recognition makes typing a thing of the past.</p>
            </div>
            <div className="p-8 rounded-3xl border border-line bg-surface-raised shadow-sm space-y-3">
              <h3 className="font-black text-ink text-2xl leading-tight">Get clean data you can actually use</h3>
              <p className="text-ink-secondary font-medium">Export validated CSV data ready for your accounting tool.</p>
            </div>
            <div className="p-8 rounded-3xl border border-line bg-surface-raised shadow-sm space-y-3">
              <h3 className="font-black text-ink text-2xl leading-tight">Catch errors before they cost you</h3>
              <p className="text-ink-secondary font-medium">Built-in validation rules flag suspicious data instantly.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================================
          3. HOW IT WORKS — a numbered sequence, and deliberately NOT cards.
          ======================================================================
          This section was proposed for the six-card grid above and RULED OUT,
          on two measurements taken against this file rather than remembered:

            * the grid's job is to convert literal colour utilities into tokens.
              Measured on ce03bee, the commit the ruling was made against: the
              two sections the grid swallowed were the only two on the page at
              0% tokenised (Problem 0 tokens / 17 literals, Value 0 / 7), while
              THIS section was the most tokenised at 9 / 7 = 56%, holding 9 of
              that file's 20 token utilities in 25 lines. Rewriting the
              most-migrated section to gain page length spends the change on
              the wrong surface. Those are readings of a file that no longer
              exists in that form, kept because they are the REASON; the ratio
              that is still live is this section's own 9 / 7, and re-deriving
              any of it means counting utilities against the config, never
              trusting the numbers in this comment.
            * three items plus three items is six. Adding these three makes
              nine, which is not a six-card grid — it forces either nine cards
              or a selection that drops copy.

          And the shape carries the argument: 1-2-3 IS the claim that the
          product is simple. As cards among six others the steps lose their
          number and their order and read as three more benefits. The accent
          numerals below are now the only accent tiles on the page, which is
          what keeps this readable as a sequence.

          The id and `scroll-mt-16` stay on THIS div: landingHeader.test.tsx
          asserts `#how-it-works` resolves to a real element and carries a
          scroll-mt, and the header's label promises this section by name.
          Swallowing it would have meant transplanting both onto a benefits
          grid and making the nav label describe something else.

          Changed here: the 1280 container and the 64px step of the page rhythm.
          `relative` on the grid and `relative z-10` on each step are GONE —
          nothing in this subtree is absolutely positioned (the file's only two
          `absolute` elements are the hero's shadow and the pricing badge), so
          they created stacking contexts against nothing. Colour is untouched.
          ====================================================================== */}
      <div id="how-it-works" className="scroll-mt-16 py-16 px-6 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto text-center space-y-12">
          <div className="space-y-4">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 italic">How it works</h2>
            <p className="text-slate-500 font-bold tracking-wide text-sm">You don’t review everything. Only what needs attention.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-10 sm:gap-8">
            <div className="space-y-6">
              <div className="w-20 h-20 bg-accent-tint text-accent rounded-3xl flex items-center justify-center mx-auto text-3xl font-black shadow-inner border border-accent-border">1</div>
              <h3 className="text-xl font-black text-slate-900 leading-tight">Upload receipts</h3>
            </div>
            <div className="space-y-6">
              <div className="w-20 h-20 bg-accent-tint text-accent rounded-3xl flex items-center justify-center mx-auto text-3xl font-black shadow-inner border border-accent-border">2</div>
              <h3 className="text-xl font-black text-slate-900 leading-tight">AI extracts and fixes the data</h3>
            </div>
            <div className="space-y-6">
              <div className="w-20 h-20 bg-accent-tint text-accent rounded-3xl flex items-center justify-center mx-auto text-3xl font-black shadow-inner border border-accent-border">3</div>
              <h3 className="text-xl font-black text-slate-900 leading-tight">You review only what matters</h3>
            </div>
          </div>
        </div>
      </div>

      {/* The Value Section stood here, between "How it works" and Pricing: three
          bare h3 + p pairs on a slate-50 band, with NO heading of its own. Its
          six strings are now the answer row of section 2, paired with the cost
          each one answers. Nothing was dropped and nothing was rewritten.
          CONSEQUENCE, named rather than discovered later: the page used to
          alternate white / grey / white / grey / white / dark across six
          sections. Five sections cannot alternate, so "How it works" and
          Pricing are now adjacent whites, separated by the `border-y
          border-slate-100` hairlines they already carried. Making Pricing the
          grey band would restore the alternation in one utility, and is NOT
          done here: this change moves geometry on the sections it did not
          rebuild, never their colour, so that step 3 stays one migration. */}

      {/* 4. Pricing Section */}
      <div id="pricing" className="scroll-mt-16 py-16 px-6 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto space-y-16 text-center">
          <div className="space-y-4">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 italic tracking-tight">Try it free. Upgrade when you need more.</h2>
            <p className="text-slate-500 font-bold tracking-wide text-sm">Simple, transparent, and fair.</p>
          </div>
          
          {/* `max-w-3xl` SURVIVES the one-1280-container ruling, as a stated
              exception rather than an oversight. The section's own container is
              1280 like every other, so this card pair aligns with the six cards
              above at the same outer edge. Stretching TWO cards to 1280 makes
              each 624px against today's 368px: a `p-10` card holding a plan
              name, one price and three list items would be mostly empty. The
              ruling's purpose is one content edge per section, which the 1280
              container already delivers; forcing a 2-up grid to a 6-up width is
              not the same thing. One utility reverts this if ruled otherwise. */}
          <div className="grid sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <div className="p-10 rounded-[32px] border-4 border-slate-50 bg-white text-left flex flex-col justify-between items-start space-y-8">
              <div className="space-y-2">
                <h3 className="font-black text-slate-400 text-xl italic">Free</h3>
                <div className="text-5xl font-black text-slate-900 italic">$0</div>
              </div>
              <ul className="space-y-3 font-bold text-slate-600 text-sm italic">
                <li>✓ 10 Scans Included</li>
                <li>✓ All core features</li>
                <li>✓ Free forever</li>
              </ul>
              <Link to="/login" className="w-full text-center py-4 bg-slate-100 text-slate-900 rounded-2xl font-black text-lg hover:bg-slate-200 transition-all">Start Free</Link>
            </div>
            
            <div className="p-10 rounded-[32px] border-4 border-accent bg-white text-left flex flex-col justify-between items-start space-y-8 relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-accent text-surface-raised px-3 py-1 rounded-full text-[10px] font-black tracking-widest">MOST POPULAR</div>
              <div className="space-y-2">
                <h3 className="font-black text-accent text-xl italic">Pro</h3>
                {/* Reads the SAME catalog entry the paywall charges from, so the
                    marketing price and the checkout price cannot drift apart in a
                    code change. Deliberately the declared amount and NOT a
                    PricePreview call: this is a pre-auth marketing page, and
                    loading the payment SDK for every anonymous visitor would cost
                    a network round-trip on the landing path and — if the native
                    "/" redirect ever regressed — put a payment SDK inside the Play
                    build. The transactional price the customer actually acts on is
                    the paywall's, which IS previewed. */}
                <div className="text-5xl font-black text-slate-900 italic">
                  {PLAN_CATALOG.monthly.fallbackFormatted}
                  <span className="text-2xl opacity-40">{PLAN_CATALOG.monthly.periodSuffix}</span>
                </div>
              </div>
              <ul className="space-y-3 font-bold text-slate-900 text-sm italic">
                <li>✓ Unlimited scans</li>
                <li>✓ All core features</li>
                <li>✓ Priority processing</li>
              </ul>
              <Link to="/login" className="w-full text-center py-4 bg-ink text-surface-raised rounded-2xl font-black text-lg hover:opacity-90 transition-all shadow-xl">Upgrade Now</Link>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Final CTA Section */}
      {/* py-24 (96px), the closing step of the rhythm, down from py-32 (128px).
          `max-w-3xl` is the SECOND stated exception to the one-1280-container
          ruling, and for the same reason as the hero's `max-w-2xl` subhead: this
          is a MEASURE on one run of text, not a content edge. The section holds
          one centred headline and one button — there is no grid here whose
          columns could align with anything, and at 1280 the 48px headline stops
          wrapping and becomes a single very long line. A 1280 wrapper around a
          768 measure would add a div and move no pixel. One utility changes this
          if ruled otherwise.
          NOT TOUCHED, and it is an OPEN board item, not an oversight: this
          button is `bg-ink` (#1A1F36 under the pin) on a `bg-slate-900` band
          (#0F172A), measured SHAPE 1.10 against a 3:1 floor — it reads as white
          text floating on the band. Its label is fine at 16.24:1; the affordance
          is what is missing. The board's entry rules that a different fill, a
          different band, or dropping the band are decisions about this closing
          section, and forbids fixing it piecemeal. Changing the padding does not
          touch it either way. */}
      <div className="py-24 px-6 bg-slate-900 text-center">
        <div className="max-w-3xl mx-auto space-y-10">
          <h2 className="text-4xl sm:text-5xl font-black text-white leading-tight">Turn receipts into clean data in seconds</h2>
          <div className="space-y-6">
            <Link to="/login" className="inline-block px-12 py-6 bg-ink text-surface-raised font-black text-2xl rounded-2xl hover:opacity-90 transition-all shadow-2xl active:scale-95 tracking-tight">
              Start Free with 10 Scans Included
            </Link>
            <p className="text-slate-500 font-bold text-sm tracking-wide">No credit card. Takes 30 seconds.</p>
          </div>
        </div>
      </div>

      <footer style={{ textAlign: 'center', padding: '24px', color: '#666', fontSize: '13px' }}>
        <Link to="/terms">Terms of Service</Link>
        {" · "}
        <Link to="/privacy">Privacy Policy</Link>
        {" · "}
        <Link to="/refund">Refund Policy</Link>
      </footer>
    </div>
  );
}
