import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

// ============================================================================
// A sentence the screen needs the person to read, in the tint of its tone:
// danger for something refused, success for something done. The glyph sits
// beside the text and carries no text of its own, so the element's text is
// the sentence alone (the auth tests read it as such).
// ============================================================================

export type NoticeTone = 'danger' | 'success';

const TONE: Record<NoticeTone, { box: string; Icon: typeof AlertCircle }> = {
  danger: { box: 'bg-danger-tint text-danger-text', Icon: AlertCircle },
  success: { box: 'bg-success-tint text-success-text', Icon: CheckCircle2 },
};

export interface NoticeProps extends React.HTMLAttributes<HTMLDivElement> {
  tone: NoticeTone;
  /** Classes for the inner text element. The sign-in screen passes the style
   *  hook its tests key on; nothing else should need this. */
  textClassName?: string;
}

export const Notice: React.FC<NoticeProps> = ({ tone, textClassName = '', className = '', children, ...rest }) => {
  const { box, Icon } = TONE[tone];
  return (
    <div {...rest} className={`flex items-start gap-2.5 rounded-card px-3.5 py-3 text-sm font-medium leading-relaxed ${box} ${className}`}>
      <Icon size={18} className="mt-0.5 flex-none" aria-hidden="true" />
      <div className={`min-w-0 flex-1 text-start ${textClassName}`}>{children}</div>
    </div>
  );
};
