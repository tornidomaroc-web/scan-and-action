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

          Nothing in the neutral ramp clears 1.16 on this band, so an
          outline-only card had a single cue at 1.111 and would have read as a
          broken card rather than a quiet one. All six therefore carry the same
          surface: the tokenised form of what the Problem cards already shipped.
          The rows differ by what is IN them — a red mark and one bold sentence
          above, a heading and body copy below.

          A tinted icon tile on the answer row was also rejected, for a
          different reason: it would have made this grid look like "How it
          works", whose accent numerals are now the only accent tiles on the
          page, which is what keeps that section legible as a SEQUENCE rather
          than as six more benefits.

          CORRECTION, FROM LOOKING AT IT IN A BROWSER. This block used to argue
          that the cards work by STACKING three weak cues — a white fill, a
          border and `shadow-sm` — none visible alone. That was an inference
          from the ratios above, and the screen does not do it. Measured at a
          proven 1280 viewport with transitions disabled, then magnified to
          130px:

            card fill  #FFFFFF on band #F5F7FA   1.073   the edge is ALL of this
            border     #E9EBF0 on card #FFFFFF   1.193   not discernible
            shadow     rgba(0,0,0,0.05) 0 1px 2px        not discernible

          The edge is held entirely by the fill. Note which one lost: the border
          is the HIGHER ratio of the two and is the one you cannot see. A 1px
          line at 1.193 sits below threshold while a whole plane at 1.073 reads
          as a plane, because at one pixel EXTENT counts for more than ratio.
          Ranking cues by contrast alone is what produced the wrong claim, and
          it also makes the earlier note about swapping `border-slate-200`
          (1.178) for `border-line` (1.111) moot: that traded one invisible
          hairline for another and cost nothing anyone can see.

          THE BORDER STAYS, AND NOT OUT OF INERTIA — but read the next sentence
          before deleting it. In LIGHT it is measured decoration. The same
          utilities resolve differently once the pin goes: `--sa-line` becomes
          #334155 on a #1E293B card, which is 1.413, and card-on-band becomes
          1.220 — both cues strengthen, and the border may do visible work
          there. That is DERIVED from the `.dark` block, not observed, because
          the pin makes it unobservable. So the border is kept and the question
          is handed to whoever unpins this route. Do not remove it on the
          strength of the light reading alone.

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

          Changed here: the 64px step of the page rhythm, and the step ROW is
          inset (see the note on the grid itself). `relative` on the grid and
          `relative z-10` on each step are GONE — nothing in this subtree is
          absolutely positioned (the file's only two `absolute` elements are the
          hero's shadow and the pricing badge), so they created stacking
          contexts against nothing. Colour is untouched.
          ====================================================================== */}
      <div id="how-it-works" className="scroll-mt-16 py-16 px-6 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto text-center space-y-12">
          <div className="space-y-4">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900">How it works</h2>
            <p className="text-slate-500 font-bold tracking-wide text-sm">You don’t review everything. Only what needs attention.</p>
          </div>

          {/* THE STEP ROW IS INSET TO 768, AND THE SECTION CONTAINER IS NOT.
              This is the fix for a defect that was MEASURED, not disliked. At
              the full 1232 container the three columns are 389px wide and the
              80px tiles sit 341px apart; observed in a browser at a proven 1280
              viewport, the row stopped reading as a sequence and read as three
              unrelated items. The same markup at a proven 485 viewport stacks
              vertically and reads as 1-2-3 immediately, so the container was
              the only variable.

              WHAT BROKE IS PROXIMITY, so that is what the measure is chosen
              against. Each step groups with its own heading at `space-y-6` =
              24px; it competes with the next step at tile edge to tile edge.
              All CALCULATED from the box model at a 1280 viewport, gap-8:

                inner    column    tile -> tile    ratio to the 24px it competes with
                1232      389.3       341.3          14.2   <- observed to FAIL
                1024      320.0       272.0          11.3
                 896      277.3       229.3           9.6
                 768      234.7       186.7           7.8   <- chosen
                (before this change: 896 container, gap-4, 288.0 col, 224.0 -> 9.3)

              The last row is the state nobody complained about. 768 lands
              TIGHTER than it and 896 lands slightly looser, and since the thing
              that broke is proximity, the conservative side of that number is
              the tighter one.

              WHY THE ROW AND NOT THE SECTION. Constraining the section
              container would look identical — the h2 is centred either way and
              the `border-y` band spans full width regardless — but it would add
              a third section-level width. With the inset on the row instead,
              all five section containers are `max-w-7xl` and the
              one-1280-container ruling is literally true, with no exception at
              the section level anywhere on the page.

              AND 768 IS NOT A NEW NUMBER. It is `max-w-3xl`, the measure the
              pricing card pair already uses; at a 1280 viewport both land on
              x=256..1024 exactly. The page therefore carries two measures, not
              three, and the second is used twice.

              DELIBERATELY NARROWER THAN ASKED: the range put to me was 896 to
              1280, and this is below it. The alignment with the pricing pair
              and the absence of a new number are why. Two consequences, both
              stated rather than discovered: the two longest step headings
              (292px and 296px at 20px) go back to two lines, which is what they
              did before this change at 288px columns, so it is a restoration
              and not a new wrap; and the proximity ratio above is a MODEL, not
              a measurement.

              THE VERDICT, since the model does not get to be the answer.
              Measured at a proven 1280 viewport, transitions off: the row is
              768 wide at x=256..1024, columns 235, tiles 80px at x=333/600/867,
              tile edge to next tile edge **187px** against the calculated
              186.7, and the intra-group gap is 24px as declared — so the
              observed ratio is 7.79. The row reads as a sequence. It was also
              read as a DISCRIMINATION rather than an impression: with only the
              row's max-width overridden in the page, 1232 puts the tiles 341px
              apart and they scatter to the extremes of the band exactly as
              before, and 768 brings them back. Same markup, one property.

              AND THE HONEST PART: 896 ALSO READS. Overridden to 896 the tiles
              sit 229px apart and the row is still coherent. So 768 was not
              forced by legibility — it was chosen for the shared axis with the
              pricing pair, which 896 does not have (896 lands at x=192..1088
              and aligns with nothing, giving the page three measures instead of
              two). If that alignment is ever judged not worth the tighter
              columns, 896 is a defensible revert and this note is the reason it
              would not be a regression. */}
          <div className="grid sm:grid-cols-3 gap-10 sm:gap-8 max-w-3xl mx-auto">
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
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">Try it free. Upgrade when you need more.</h2>
            <p className="text-slate-500 font-bold tracking-wide text-sm">Simple, transparent, and fair.</p>
          </div>
          
          {/* `max-w-3xl` here is NOT an exception to the one-1280-container
              ruling — it is the page's one INSET ROW MEASURE, and the step row
              in "How it works" now shares it. At a 1280 viewport both land on
              x=256..1024 exactly, so two measures cover the page: 1232 for
              every section container, 768 for the two rows that are not
              full-width grids. Stretching TWO cards to 1232 makes each 624px
              against today's 368px, and a `p-10` card holding a plan name, one
              price and three list items would be mostly empty.

              MEASURED, and it is the reason this line needed no edit when the
              section moved to the 1280 container: the pair did not move. A 768
              row centred in a 896 container and centred in a 1232 one land on
              the same axis, so at a 1280 viewport it was at x=256 before the
              change and is at x=256 after it. The section-container edit is a
              no-op at this width; what gained width is the heading block, and
              the heading is 704px on one line either way.

              THE ONE THING THAT DID NOT RESOLVE, recorded because it is visible
              rather than because it is in scope: these cards are 368px and
              start at x=256, while the six benefit cards directly above are
              389px at x=24/445/867. Scrolling gives a 3-up row at one width and
              a 2-up row at another, inset. That is a consequence of the inset
              measure, not of this change, and closing it means deciding what a
              card is worth on this page — not widening a grid. */}
          <div className="grid sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* `gap-8`, NOT `space-y-8`, on both cards. `space-y-*` puts its
                margin on every child after the first, and it counts the Pro
                card's absolutely positioned badge as that first child — so the
                Pro card's content sat 32px below the Free card's. `gap` ignores
                out-of-flow children. Measured in a browser before and after at
                1280, 485, 390 and 360: plan name and price now match exactly.
                The list matches exactly below 768 and sits 0.5px apart at 1280.
                That half pixel is the Pro price's `/mo` span, which makes its
                line box 49px against the Free card's 48, not the badge.
                The Free card has no badge; it takes `gap-8` so the two cards
                stay one pattern. */}
            {/* WEIGHTS: list `font-medium` 500 < plan name `font-bold` 700 <
                price `font-black` 900, so the price is the heaviest thing in the
                card. Measured in a browser at 1280: all three steps hold. BELOW
                768 the app-wide "Mobile type scale (<md)" rule in index.css turns
                `font-black` into 700, so on phones the price TIES the name, and
                only list < name survives (measured at 485, 390 and 360). That
                rule is a board item, not something to patch from here.
                THE FREE NAME is `text-slate-500`, 4.76 on white, and its floor
                is 4.5, NOT the 3 that large text gets: the same rule shrinks
                `text-xl` to 18px, and 18px bold is below the 18.66px large-text
                line. slate-400 measured 2.56; slate-600 is the Free list's own
                colour. landingPlanNameContrast.test.tsx holds this pair. */}
            <div className="p-10 rounded-[32px] border-4 border-slate-50 bg-white text-left flex flex-col justify-between items-start gap-8">
              <div className="space-y-2">
                <h3 className="font-bold text-slate-500 text-xl">Free</h3>
                <div className="text-5xl font-black text-slate-900">$0</div>
              </div>
              <ul className="space-y-3 font-medium text-slate-600 text-sm">
                <li>✓ 10 Scans Included</li>
                <li>✓ All core features</li>
                <li>✓ Free forever</li>
              </ul>
              <Link to="/login" className="w-full text-center py-4 bg-slate-100 text-slate-900 rounded-2xl font-black text-lg hover:bg-slate-200 transition-all">Start Free</Link>
            </div>
            
            <div className="p-10 rounded-[32px] border-4 border-accent bg-white text-left flex flex-col justify-between items-start gap-8 relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-accent text-surface-raised px-3 py-1 rounded-full text-[10px] font-black tracking-widest">MOST POPULAR</div>
              <div className="space-y-2">
                <h3 className="font-bold text-accent text-xl">Pro</h3>
                {/* Reads the SAME catalog entry the paywall charges from, so the
                    marketing price and the checkout price cannot drift apart in a
                    code change. Deliberately the declared amount and NOT a
                    PricePreview call: this is a pre-auth marketing page, and
                    loading the payment SDK for every anonymous visitor would cost
                    a network round-trip on the landing path and — if the native
                    "/" redirect ever regressed — put a payment SDK inside the Play
                    build. The transactional price the customer actually acts on is
                    the paywall's, which IS previewed. */}
                <div className="text-5xl font-black text-slate-900">
                  {PLAN_CATALOG.monthly.fallbackFormatted}
                  <span className="text-2xl opacity-40">{PLAN_CATALOG.monthly.periodSuffix}</span>
                </div>
              </div>
              <ul className="space-y-3 font-medium text-slate-900 text-sm">
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

          THIS SECTION WAS AN EXCEPTION AND IS NOT ONE ANY MORE. It carried
          `max-w-3xl`, and the reason written here for keeping it was that "at
          1280 the 48px headline stops wrapping and becomes a single very long
          line". That reason was wrong, and the measurement that settles it was
          taken in a browser at a proven 1280 viewport: inside 768 the headline
          takes TWO line boxes, 739px at its widest, and the second line is the
          single word "seconds". An orphan — the same defect this repository
          already fixed once in the hero, where "you." was orphaned at 60px and
          the headline was dropped to 48px to stop it.

          So the narrow measure was not protecting the headline from a long
          line, it was producing an orphan. In the 1232 container the headline
          is ONE line — measured after the change at a proven 1280 viewport,
          955px wide, one line box. (955, not the 739 first written here: 739
          was the widest line of the WRAPPED version, and the unwrapped line is
          longer than the widest fragment of the wrapped one. Corrected from the
          reading.) It clears the 1232 container with 277px to spare, and this
          section joins the other four rather than standing apart. The exception
          count for the whole page is now ZERO at the section level.

          WHAT THIS DID NOT FIX, and it would be easy to read the line above as
          more than it is: the orphan is gone AT DESKTOP WIDTH ONLY. A 955px
          line needs 955 + 48 of `px-6` = ~1003px of viewport; below that it
          wraps, and it wraps in the same place. Measured at a proven 900
          viewport: two line boxes, 739 + 207, words ["Turn receipts into clean
          data in"] / ["seconds"]. Measured at a proven 485: the same split,
          with the h2 computing to 24px there. So this change made the closing
          headline correct on a desktop and left it orphaning everywhere
          narrower — strictly better than before, when it orphaned at 1280 too,
          but not a fix. The remaining orphan is a property of this STRING at
          this type size, so closing it means a copy or type decision, not
          another container. That belongs to the closing-section entry on the
          board, which already owns this band.

          NOT TOUCHED, and it is an OPEN board item, not an oversight: this
          button is `bg-ink` (#1A1F36 under the pin) on a `bg-slate-900` band
          (#0F172A), measured SHAPE 1.10 against a 3:1 floor — it reads as white
          text floating on the band. Its label is fine at 16.24:1; the affordance
          is what is missing. The board's entry rules that a different fill, a
          different band, or dropping the band are decisions about this closing
          section, and forbids fixing it piecemeal. Changing the padding does not
          touch it either way. */}
      <div className="py-24 px-6 bg-slate-900 text-center">
        <div className="max-w-7xl mx-auto space-y-10">
          <h2 className="text-4xl sm:text-5xl font-black text-white leading-tight">Turn receipts into clean data in seconds</h2>
          <div className="space-y-6">
            <Link to="/login" className="inline-block px-12 py-6 bg-ink text-surface-raised font-black text-2xl rounded-2xl hover:opacity-90 transition-all shadow-2xl active:scale-95 tracking-tight">
              Start Free with 10 Scans Included
            </Link>
            <p className="text-slate-500 font-bold text-sm tracking-wide">No credit card. Takes 30 seconds.</p>
          </div>
        </div>
      </div>

      {/* The footer has no background of its own: its band is the page
          wrapper's `bg-slate-50` (#F8FAFC), and its three links take this
          colour by inheritance (preflight sets `a { color: inherit }`).
          CALCULATED (WCAG, values from tokens.css) on that band, for 13px
          text against a 4.5 floor — a derivation, not a browser reading:

            #666 (replaced)        5.49
            --sa-ink-secondary     5.85   <- nearest to #666 by luminance, already pinned
            --sa-ink-tertiary      4.54   not pinned, so it would grow the pin
            --sa-ink-muted         3.11   BELOW the floor, despite being the "captions" step

          PIN-DEPENDENT, and the guard cannot see it: this is a flipping token
          over a literal band that sits on an ANCESTOR, so tokenLiteralPairing
          (one className at a time) passes it. Unpinned in dark it would read
          #CBD5E1 on #F8FAFC = 1.42. Step 3 moves this band with its text. */}
      <footer className="text-ink-secondary" style={{ textAlign: 'center', padding: '24px', fontSize: '13px' }}>
        <Link to="/terms">Terms of Service</Link>
        {" · "}
        <Link to="/privacy">Privacy Policy</Link>
        {" · "}
        <Link to="/refund">Refund Policy</Link>
      </footer>
    </div>
  );
}
