export interface MarkdownSegment {
  text: string;
  style: 'normal' | 'bold' | 'italic' | 'code' | 'heading' | 'link' | 'linkText' | 'strikethrough' | 'blockquote' | 'list';
}

export function parseMarkdown(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const lines = text.split('\n');
  let inCodeBlock = false;
  let currentCodeBlock = '';

  for (const rawLine of lines) {
    const line = rawLine;

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        segments.push({ text: currentCodeBlock, style: 'code' });
        currentCodeBlock = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      currentCodeBlock += line + '\n';
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      segments.push({ text: line.replace(/^#{1,6}\s/, ''), style: 'heading' });
      segments.push({ text: '\n', style: 'normal' });
      continue;
    }

    if (/^>\s/.test(line)) {
      segments.push({ text: line.replace(/^>\s/, ''), style: 'blockquote' });
      segments.push({ text: '\n', style: 'normal' });
      continue;
    }

    if (/^[\-\*]\s/.test(line)) {
      segments.push({ text: '\u2022 ' + line.replace(/^[\-\*]\s/, ''), style: 'list' });
      segments.push({ text: '\n', style: 'normal' });
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      segments.push({ text: line, style: 'list' });
      segments.push({ text: '\n', style: 'normal' });
      continue;
    }

    // Process inline formatting
    let remaining = line;
    let pos = 0;
    while (pos < remaining.length) {
      const codeStart = remaining.indexOf('`', pos);
      const boldStart = remaining.indexOf('**', pos);
      const italicStart = remaining.indexOf('*', pos);
      const linkStart = remaining.indexOf('[', pos);
      const strikeStart = remaining.indexOf('~~', pos);

      let nextSpecial = -1;
      let specialType = '';

      const candidates: Array<{ idx: number; type: string }> = [];
      if (codeStart >= 0) candidates.push({ idx: codeStart, type: 'code' });
      if (boldStart >= 0) candidates.push({ idx: boldStart, type: 'bold' });
      if (italicStart >= 0) candidates.push({ idx: italicStart, type: 'italic' });
      if (linkStart >= 0) candidates.push({ idx: linkStart, type: 'link' });
      if (strikeStart >= 0) candidates.push({ idx: strikeStart, type: 'strike' });

      if (candidates.length > 0) {
        candidates.sort((a, b) => a.idx - b.idx);
        nextSpecial = candidates[0]!.idx;
        specialType = candidates[0]!.type;
      }

      if (nextSpecial < 0) {
        if (pos < remaining.length) {
          segments.push({ text: remaining.slice(pos), style: 'normal' });
        }
        break;
      }

      if (nextSpecial > pos) {
        segments.push({ text: remaining.slice(pos, nextSpecial), style: 'normal' });
      }

      if (specialType === 'code') {
        const codeEnd = remaining.indexOf('`', nextSpecial + 1);
        if (codeEnd >= 0) {
          segments.push({ text: remaining.slice(nextSpecial + 1, codeEnd), style: 'code' });
          pos = codeEnd + 1;
        } else {
          segments.push({ text: remaining.slice(nextSpecial), style: 'normal' });
          pos = nextSpecial + 1;
        }
      } else if (specialType === 'bold') {
        const boldEnd = remaining.indexOf('**', nextSpecial + 2);
        if (boldEnd >= 0) {
          segments.push({ text: remaining.slice(nextSpecial + 2, boldEnd), style: 'bold' });
          pos = boldEnd + 2;
        } else {
          segments.push({ text: remaining.slice(nextSpecial), style: 'normal' });
          pos = nextSpecial + 1;
        }
      } else if (specialType === 'italic') {
        if (remaining[nextSpecial + 1] === '*') {
          pos = nextSpecial + 2;
          continue;
        }
        const italicEnd = remaining.indexOf('*', nextSpecial + 1);
        if (italicEnd >= 0) {
          segments.push({ text: remaining.slice(nextSpecial + 1, italicEnd), style: 'italic' });
          pos = italicEnd + 1;
        } else {
          segments.push({ text: remaining.slice(nextSpecial), style: 'normal' });
          pos = nextSpecial + 1;
        }
      } else if (specialType === 'link') {
        const linkTextEnd = remaining.indexOf(']', nextSpecial + 1);
        const linkUrlStart = linkTextEnd >= 0 ? remaining.indexOf('(', linkTextEnd + 1) : -1;
        const linkUrlEnd = linkUrlStart >= 0 ? remaining.indexOf(')', linkUrlStart + 1) : -1;
        if (linkTextEnd >= 0 && linkUrlStart >= 0 && linkUrlEnd >= 0) {
          segments.push({ text: remaining.slice(nextSpecial + 1, linkTextEnd), style: 'linkText' });
          segments.push({ text: remaining.slice(linkUrlStart + 1, linkUrlEnd), style: 'link' });
          pos = linkUrlEnd + 1;
        } else {
          segments.push({ text: remaining.slice(nextSpecial), style: 'normal' });
          pos = nextSpecial + 1;
        }
      } else if (specialType === 'strike') {
        const strikeEnd = remaining.indexOf('~~', nextSpecial + 2);
        if (strikeEnd >= 0) {
          segments.push({ text: remaining.slice(nextSpecial + 2, strikeEnd), style: 'strikethrough' });
          pos = strikeEnd + 2;
        } else {
          segments.push({ text: remaining.slice(nextSpecial), style: 'normal' });
          pos = nextSpecial + 1;
        }
      }
    }

    segments.push({ text: '\n', style: 'normal' });
  }

  if (currentCodeBlock) {
    segments.push({ text: currentCodeBlock, style: 'code' });
  }

  return segments;
}
