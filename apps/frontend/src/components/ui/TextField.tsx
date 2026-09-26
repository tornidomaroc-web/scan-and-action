import React from 'react';

// ============================================================================
// The field of the visual language: a label above, a 52px raised input with
// the hairline ring, the accent ring on focus and the danger ring when the
// value was refused. 16px text, so iOS does not zoom the page on focus.
//
// First used by the sign-in, sign-up and reset screens (2026-09-26). Every
// input the app asks a person to type into is meant to become one of these.
// ============================================================================

export const fieldClass =
  'w-full bg-surface-raised text-[16px] font-medium text-ink shadow-card ring-1 outline-none transition-shadow motion-reduce:transition-none placeholder:text-ink-faint focus:ring-2';

/** The two shapes a field takes: the 52px card-cornered field, or the 48px
 *  pill the sign-in screens use, where every control is a pill and the form
 *  has to stay above a phone keyboard (the language of 2026-09-26). */
const SHAPE = { card: 'h-[52px] rounded-card px-4', pill: 'h-12 rounded-pill px-5' } as const;

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  id: string;
  label: string;
  /** True when this value was refused: the ring turns to the danger colour. */
  invalid?: boolean;
  /** A line under the field, in the muted colour (a rule, never an error). */
  hint?: string;
  /** Something at the end edge, inside the field: the show / hide control. */
  end?: React.ReactNode;
  /** A control on the label row's end edge: the forgot-password link. */
  labelEnd?: React.ReactNode;
  shape?: keyof typeof SHAPE;
  className?: string;
}

export const TextField: React.FC<TextFieldProps> = ({ id, label, invalid = false, hint, end, labelEnd, shape = 'card', className = '', ...input }) => {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-start text-label font-semibold text-ink-secondary">
          {label}
        </label>
        {labelEnd}
      </div>
      {/* The wrapper takes the input's own direction, so an `end-*` control
          inside it sits at the END OF THE TYPED TEXT: a left-to-right email
          or password field on an Arabic page keeps its Show button at the
          right, clear of the characters (seen wrong on 2026-09-26: the button
          sat at the page's end, the left, under the dots). */}
      <div className="relative" dir={input.dir}>
        <input
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          className={`${fieldClass} ${SHAPE[shape]} ${invalid ? 'ring-2 ring-danger focus:ring-danger' : 'ring-line focus:ring-accent'} ${className}`}
          {...input}
        />
        {end}
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-start text-xs font-medium text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
};
