import React from 'react';
import { FileText } from 'lucide-react';
import { CategoryIcon } from './CategoryIcon';
import { IconTile } from './IconTile';
import { getDocumentCategory } from '../../lib/documentCategory';

// A document's icon on any list or header: its category tile when the
// extractor stored one, else a neutral document tile. Never "Other" for a
// document that was not categorized: that would state a category nobody read.
export const DocumentIcon: React.FC<{ doc: any; size?: 'sm' | 'md' }> = ({ doc, size = 'md' }) => {
  const category = getDocumentCategory(doc);
  return category ? <CategoryIcon category={category} size={size} /> : <IconTile icon={FileText} tone="neutral" size={size} />;
};
