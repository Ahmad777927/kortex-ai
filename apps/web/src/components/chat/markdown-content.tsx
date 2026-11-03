'use client';

import React, { useState } from 'react';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  const { introBlocks, cards } = React.useMemo(() => {
    const b = parseMarkdownBlocks(content);
    return groupBlocksIntoCards(b);
  }, [content]);

  // If there's neither intro text nor cards, render nothing
  if (introBlocks.length === 0 && cards.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-4 leading-7 text-[15px] text-text ${className}`}>
      {/* Conversational Intro Text (renders as clean text, NOT inside a card) */}
      {introBlocks.length > 0 && (
        <div className="space-y-3 leading-7 text-[15px] text-text">
          {introBlocks.map((block, i) => renderBlock(block, `intro-block-${i}`))}
        </div>
      )}

      {/* Component & Section Cards */}
      {cards.map((card, index) => {
        if (card.type === 'code') {
          return (
            <CodeBlock
              key={`card-${index}`}
              language={card.language}
              code={card.code}
              filename={card.filename}
            />
          );
        }

        return (
          <SectionCard
            key={`card-${index}`}
            title={card.title}
            blocks={card.blocks}
          />
        );
      })}
    </div>
  );
}

// --- Block Types ---
type Block =
  | {
      type: 'code';
      language: string;
      code: string;
      filename?: string;
    }
  | { type: 'heading'; level: number; text: string }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string };

// --- Card Types ---
type CardItem =
  | {
      type: 'code';
      language: string;
      code: string;
      filename?: string;
    }
  | {
      type: 'section';
      title: string;
      blocks: Block[];
    };

// --- Filename & Title Utilities ---
function isFilenameOrComponentTitle(text: string): boolean {
  const clean = text.replace(/^#+\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim();
  // File extensions
  if (/\.(jsx?|tsx?|css|html|json|py|go|rs|sql|sh|ya?ml|md)\b/i.test(clean)) return true;
  // File paths
  if (/^[`'"]?(?:src\/|components\/|pages\/|app\/|lib\/|public\/)/i.test(clean)) return true;
  // Backticked filenames
  if (/^`[^`]+\.[a-zA-Z0-9]+`$/.test(clean)) return true;
  // Component names
  if (
    /(?:Component|Page|View|Modal|Drawer)\b/i.test(clean) &&
    !/(?:overview|features|prerequisites|requirements|architecture|instructions)/i.test(clean)
  ) {
    return true;
  }
  return false;
}

function cleanFilenameFromHeading(text: string): string {
  let s = text.replace(/^#+\s*/, '').trim();

  // If there is backticked text, e.g. `src/App.jsx`, extract it
  const backtickMatch = s.match(/`([^`]+)`/);
  if (backtickMatch && backtickMatch[1]) {
    const candidate = backtickMatch[1].trim();
    if (candidate.includes('.') || candidate.includes('/')) {
      return candidate;
    }
  }

  // If there is parenthesis with filename e.g. (src/components/Navbar.jsx)
  const parenMatch = s.match(/\(([^)]+\.[a-zA-Z0-9]+)\)/);
  if (parenMatch && parenMatch[1]) {
    return parenMatch[1].trim();
  }

  // Strip leading numbers e.g. "1. " or "01. "
  s = s.replace(/^\d+[\.\)]\s*/, '').trim();
  // Strip quotes and backticks
  s = s.replace(/^[`'"]+|[`'"]+$/g, '').trim();

  // If it ends with Component or Page, turn into .jsx
  if (/(?:Component|Page)$/i.test(s) && !s.includes('.')) {
    const compName = s.replace(/\s+(?:Component|Page)$/i, '').trim();
    return `${cleanComponentName(compName)}.jsx`;
  }

  return s;
}

// --- Content Verification ---
function blockHasContent(block: Block): boolean {
  if (block.type === 'paragraph') return block.text.trim().length > 0;
  if (block.type === 'code') return block.code.trim().length > 0;
  if (block.type === 'list') return block.items.some((it) => it.trim().length > 0);
  if (block.type === 'blockquote') return block.lines.some((l) => l.trim().length > 0);
  if (block.type === 'heading') return block.text.trim().length > 0;
  return false;
}

// --- Group Parsed Blocks into Independent Cards ---
function groupBlocksIntoCards(blocks: Block[]): { introBlocks: Block[]; cards: CardItem[] } {
  const introBlocks: Block[] = [];
  const cards: CardItem[] = [];
  let currentSection: { type: 'section'; title: string; blocks: Block[] } | null = null;
  let hasEncounteredCardOrHeading = false;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block || !blockHasContent(block)) continue;

    // Check if block is a code block
    if (block.type === 'code') {
      hasEncounteredCardOrHeading = true;

      // 1. If we are in a section whose heading was clearly introducing this code block
      if (currentSection) {
        const isHeadingForFile = isFilenameOrComponentTitle(currentSection.title);
        const hasNoPriorBlocks = currentSection.blocks.length === 0;

        if (hasNoPriorBlocks || isHeadingForFile) {
          // If there were any small text blocks in this section before the code block,
          // flush them only if they have actual content
          const validSectionBlocks = currentSection.blocks.filter(blockHasContent);
          if (validSectionBlocks.length > 0) {
            cards.push({
              type: 'section',
              title: 'Notes',
              blocks: validSectionBlocks,
            });
          }

          const inferredFilename =
            cleanFilenameFromHeading(currentSection.title) || block.filename;

          cards.push({
            type: 'code',
            language: block.language,
            code: block.code,
            filename: inferredFilename,
          });

          currentSection = null;
          continue;
        }
      }

      // 2. Standalone code block or has explicit filename
      if (currentSection) {
        const validSectionBlocks = currentSection.blocks.filter(blockHasContent);
        if (validSectionBlocks.length > 0) {
          cards.push({
            ...currentSection,
            blocks: validSectionBlocks,
          });
        }
        currentSection = null;
      }

      cards.push({
        type: 'code',
        language: block.language,
        code: block.code,
        filename: block.filename,
      });
      continue;
    }

    // Headings start a new Section Card
    if (block.type === 'heading') {
      hasEncounteredCardOrHeading = true;

      if (currentSection) {
        const validSectionBlocks = currentSection.blocks.filter(blockHasContent);
        if (validSectionBlocks.length > 0) {
          cards.push({
            ...currentSection,
            blocks: validSectionBlocks,
          });
        }
      }

      currentSection = {
        type: 'section',
        title: block.text,
        blocks: [],
      };
      continue;
    }

    // If we haven't encountered any card or heading yet, this is conversational intro text
    if (!hasEncounteredCardOrHeading) {
      introBlocks.push(block);
      continue;
    }

    // Otherwise, it belongs to the current active section (if any)
    if (currentSection) {
      currentSection.blocks.push(block);
    } else {
      // Conversational conclusion or notes between code blocks
      introBlocks.push(block);
    }
  }

  if (currentSection) {
    const validSectionBlocks = currentSection.blocks.filter(blockHasContent);
    if (validSectionBlocks.length > 0) {
      cards.push({
        ...currentSection,
        blocks: validSectionBlocks,
      });
    }
  }

  return { introBlocks, cards };
}

// --- Multi-Component Splitter ---
interface SplitComponent {
  filename: string;
  title: string;
  code: string;
  index: number;
  total: number;
}

function cleanComponentName(raw: string): string {
  let s = raw.replace(/^\d+\.?\s*/, '').replace(/\s+(COMPONENT|PAGE)$/i, '').trim();
  s = s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
  if (s.toLowerCase() === 'mainapp' || s.toLowerCase() === 'appcomponent' || s.toLowerCase() === 'main') {
    return 'App';
  }
  return s || 'Component';
}

function splitReactComponents(code: string, language: string): SplitComponent[] | null {
  const isReact =
    /^(jsx|tsx|javascript|typescript|js|ts|react)$/i.test(language) ||
    language === 'text' ||
    !language;
  if (!isReact) return null;

  const lines = code.split('\n');

  // Extract leading imports to share across components
  const commonImports: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l === undefined) break;
    const trimmed = l.trim();
    if (trimmed.startsWith('import ') || trimmed.startsWith('require(')) {
      commonImports.push(l);
      i++;
    } else if (
      trimmed === '' &&
      commonImports.length > 0 &&
      lines.slice(i, i + 5).some((x) => x.trim().startsWith('import '))
    ) {
      commonImports.push(l);
      i++;
    } else {
      break;
    }
  }

  const importBlock = commonImports.join('\n').trim();

  const sections: { title: string; filename: string; lines: string[] }[] = [];
  let current: { title: string; filename: string; lines: string[] } | null = null;

  const dividerRegex = /^\/\/\s*={3,}\s*$/;
  const sectionTitleRegex =
    /^\/\/\s*(?:={1,}\s*)?(?:(\d+)\.?\s*)?([A-Za-z0-9_\s\-]+?(?:COMPONENT|PAGE|BAR|FORM|CARD|MODAL|SECTION|HEADER|FOOTER|VIEW|DRAWER)?)\s*(?:={1,})?$/i;

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trim();

    // Check for comment divider block (e.g. // ==========================================)
    if (dividerRegex.test(trimmed)) {
      const nextLineRaw = lines[i + 1];
      const nextLine = nextLineRaw ? nextLineRaw.trim() : '';
      const match = nextLine.match(sectionTitleRegex);
      if (match && match[2] && !dividerRegex.test(nextLine)) {
        if (current && current.lines.join('').trim().length > 0) {
          sections.push(current);
        }
        const compName = cleanComponentName(match[2]);
        const filename = `${compName}.jsx`;

        current = {
          title: compName,
          filename,
          lines: [],
        };

        i++; // skip title line
        const lookahead = lines[i + 1];
        if (lookahead && dividerRegex.test(lookahead.trim())) {
          i++; // skip closing divider
        }
        continue;
      }
    }

    // Direct section comment: "// 1. NAVBAR COMPONENT" or "// 1. NAVBAR"
    const directMatch = trimmed.match(
      /^\/\/\s*(?:(\d+)\.\s+)([A-Za-z0-9_\s\-]+?(?:COMPONENT|PAGE)?)\s*$/i,
    );
    if (directMatch && directMatch[2]) {
      if (current && current.lines.join('').trim().length > 0) {
        sections.push(current);
      }
      const compName = cleanComponentName(directMatch[2]);
      const filename = `${compName}.jsx`;

      current = {
        title: compName,
        filename,
        lines: [],
      };
      continue;
    }

    if (!current) {
      if (trimmed === '') continue;
      current = {
        title: 'App',
        filename: 'App.jsx',
        lines: [],
      };
    }

    current.lines.push(line);
  }

  if (current && current.lines.join('').trim().length > 0) {
    sections.push(current);
  }

  if (sections.length <= 1) return null;

  return sections.map((sec, idx) => {
    let codeStr = sec.lines.join('\n').trim();
    const escapedTitle = sec.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      !codeStr.includes('export default') &&
      !codeStr.includes('export {') &&
      codeStr.includes(`function ${sec.title}`)
    ) {
      codeStr = codeStr.replace(
        new RegExp(`function\\s+${escapedTitle}\\s*\\(`),
        `export default function ${sec.title}(`,
      );
    }

    return {
      filename: sec.filename,
      title: sec.title,
      code: importBlock ? `${importBlock}\n\n${codeStr}` : codeStr,
      index: idx + 1,
      total: sections.length,
    };
  });
}

function parseMarkdownBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    if (rawLine === undefined) {
      index++;
      continue;
    }

    const trimmed = rawLine.trim();

    // Check for code blocks ```
    const codeMatch = trimmed.match(/^```([a-zA-Z0-9_\-+#]*)(?:\s+([a-zA-Z0-9_.\-/]+))?/);
    if (codeMatch) {
      const language = codeMatch[1]?.toLowerCase() || 'text';
      const declaredFilename = codeMatch[2]?.trim();
      const codeLines: string[] = [];
      index++;

      while (index < lines.length) {
        const curLine = lines[index];
        if (curLine === undefined || curLine.trim().startsWith('```')) {
          break;
        }
        codeLines.push(curLine);
        index++;
      }

      // Skip the closing ```
      if (index < lines.length) {
        index++;
      }

      const fullCode = codeLines.join('\n');

      // Check if this monolithic block contains multiple React components
      const subComponents = splitReactComponents(fullCode, language);
      if (subComponents && subComponents.length > 1) {
        for (const comp of subComponents) {
          blocks.push({
            type: 'code',
            language: language || 'jsx',
            code: comp.code,
            filename: comp.filename,
          });
        }
      } else {
        blocks.push({
          type: 'code',
          language,
          code: fullCode,
          filename: declaredFilename,
        });
      }
      continue;
    }

    // Empty lines
    if (trimmed === '') {
      index++;
      continue;
    }

    // Horizontal Rule (---, ***, ___)
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      index++;
      continue;
    }

    // Headings (#, ##, ###)
    const headingMatch = rawLine.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      index++;
      continue;
    }

    // Blockquotes (> text)
    if (rawLine.startsWith('>')) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const curLine = lines[index];
        if (!curLine || !curLine.startsWith('>')) {
          break;
        }
        quoteLines.push(curLine.replace(/^>\s?/, ''));
        index++;
      }
      blocks.push({
        type: 'blockquote',
        lines: quoteLines,
      });
      continue;
    }

    // Lists (unordered - or *, or ordered 1., 2.)
    const isOrdered = /^\s*\d+\.\s+/.test(rawLine);
    const isUnordered = /^\s*[-*]\s+/.test(rawLine);

    if (isOrdered || isUnordered) {
      const items: string[] = [];
      const listOrdered = isOrdered;

      while (index < lines.length) {
        const cur = lines[index];
        if (cur === undefined) break;

        // If a code block starts inside or following a list item, break out of list
        if (/^\s*```/.test(cur)) {
          break;
        }

        const matchOrdered = cur.match(/^\s*\d+\.\s+(.+)$/);
        const matchUnordered = cur.match(/^\s*[-*]\s+(.+)$/);

        if (listOrdered && matchOrdered && matchOrdered[1]) {
          items.push(matchOrdered[1]);
          index++;
        } else if (!listOrdered && matchUnordered && matchUnordered[1]) {
          items.push(matchUnordered[1]);
          index++;
        } else if (
          /^\s{2,}\S/.test(cur) &&
          items.length > 0 &&
          !cur.trim().startsWith('```')
        ) {
          const lastIdx = items.length - 1;
          const prev = items[lastIdx] ?? '';
          items[lastIdx] = prev + ' ' + cur.trim();
          index++;
        } else {
          break;
        }
      }

      blocks.push({
        type: 'list',
        ordered: listOrdered,
        items,
      });
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (index < lines.length) {
      const cur = lines[index];
      if (cur === undefined) break;

      const curTrimmed = cur.trim();
      if (
        curTrimmed === '' ||
        curTrimmed.startsWith('```') ||
        cur.match(/^(#{1,6})\s+/) ||
        cur.startsWith('>') ||
        /^\s*\d+\.\s+/.test(cur) ||
        /^\s*[-*]\s+/.test(cur) ||
        /^(\*{3,}|-{3,}|_{3,})$/.test(curTrimmed)
      ) {
        break;
      }

      paraLines.push(cur);
      index++;
    }

    if (paraLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        text: paraLines.join('\n'),
      });
    }
  }

  return blocks;
}

// --- Section Card with Independent Collapse State ---
function SectionCard({ title, blocks }: { title: string; blocks: Block[] }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullText = React.useMemo(() => {
    return blocks
      .map((b) => {
        if (b.type === 'paragraph') return b.text;
        if (b.type === 'code') return b.code;
        if (b.type === 'list') return b.items.map((it, i) => `${i + 1}. ${it}`).join('\n');
        if (b.type === 'blockquote') return b.lines.join('\n');
        return '';
      })
      .join('\n\n');
  }, [blocks]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="my-5 overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0B0F19] shadow-xl hover:border-indigo-500/30 transition-all duration-300">
      {/* Top Card Header with Independent Collapse Toggle */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/[0.08] bg-[#101626] px-4 py-3 text-xs cursor-pointer select-none transition-colors hover:bg-[#141b30]"
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* macOS window dots */}
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
          </div>

          {/* Section Title Badge */}
          <div className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-200 shadow-sm">
            <span className="text-indigo-400">📋</span>
            <span>{cleanFilenameFromHeading(title)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Dedicated Copy Button for this specific card */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-200 transition-all hover:bg-indigo-600/30 hover:border-indigo-500/50 hover:text-white"
          >
            {copied ? (
              <>
                <CheckIcon className="h-4 w-4 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <CopyIcon className="h-4 w-4 text-slate-400" />
                <span>Copy section</span>
              </>
            )}
          </button>

          {/* Independent Card Collapse / Expand Toggle Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            title={isCollapsed ? 'Expand section' : 'Collapse section'}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.05] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-all hover:bg-white/[0.12] hover:text-white"
          >
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform duration-200 ${
                isCollapsed ? '-rotate-90 text-slate-400' : 'rotate-0 text-indigo-400'
              }`}
            />
            <span className="text-[11px]">{isCollapsed ? 'Expand' : 'Collapse'}</span>
          </button>
        </div>
      </div>

      {/* Card Body - Controlled by this card's own collapsed state */}
      {!isCollapsed ? (
        <div className="p-4 md:p-5 space-y-3 animate-fade-in-up text-[15px] leading-7 text-text">
          {blocks.map((block, i) => renderBlock(block, `sec-block-${i}`, true))}
        </div>
      ) : null}
    </div>
  );
}

// --- Block Renderer ---
function renderBlock(block: Block, key: string, embedded = false) {
  switch (block.type) {
    case 'code':
      return (
        <CodeBlock
          key={key}
          language={block.language}
          code={block.code}
          filename={block.filename}
          embedded={embedded}
        />
      );

    case 'heading': {
      const headingStyles: Record<number, string> = {
        1: 'text-xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent mt-4 mb-2 pb-1',
        2: 'text-lg font-bold text-white flex items-center gap-2 mt-3 mb-2',
        3: 'text-base font-semibold text-indigo-300 mt-2.5 mb-1.5',
        4: 'text-sm font-semibold text-slate-200 mt-2 mb-1',
        5: 'text-sm font-medium text-slate-300 mt-2 mb-1',
        6: 'text-xs font-medium text-slate-400 mt-2 mb-1',
      };
      const className = headingStyles[block.level] ?? headingStyles[3];
      return (
        <div key={key} className={className}>
          {renderInlineText(block.text)}
        </div>
      );
    }

    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="border-l-4 border-indigo-500 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent my-3 rounded-r-xl px-4 py-2.5 text-slate-300 italic"
        >
          {block.lines.map((l, i) => (
            <p key={i}>{renderInlineText(l)}</p>
          ))}
        </blockquote>
      );

    case 'list': {
      if (block.ordered) {
        return (
          <ol key={key} className="space-y-2.5 my-3 pl-0 text-text">
            {block.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 border border-indigo-500/40 text-[11px] font-bold text-indigo-300 mt-0.5 shadow-sm">
                  {idx + 1}
                </span>
                <div className="flex-1 text-slate-200 leading-relaxed">
                  {renderInlineText(item)}
                </div>
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul key={key} className="space-y-2 my-2.5 pl-0 text-text">
          {block.items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-purple-400 mt-2.5 shrink-0 shadow-[0_0_6px_rgba(99,102,241,0.6)]" />
              <div className="flex-1 text-slate-200 leading-relaxed">
                {renderInlineText(item)}
              </div>
            </li>
          ))}
        </ul>
      );
    }

    case 'hr':
      return <hr key={key} className="my-4 border-border/80" />;

    case 'paragraph':
      return (
        <p key={key} className="leading-7 my-1.5 whitespace-pre-line text-text">
          {renderInlineText(block.text)}
        </p>
      );
  }
}

// --- Inline Formatter (Bold, Italic, Inline Code, Links) ---
function renderInlineText(text: string): React.ReactNode[] {
  const tokenRegex =
    /(```(?:[a-zA-Z0-9_\-+#]+)?\s*[\s\S]*?```|`+[^`]+`+|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, i) => {
    if (!part) return null;

    // Inline triple backtick code
    if (part.startsWith('```') && part.endsWith('```') && part.length >= 6) {
      let code = part.slice(3, -3).trim();
      code = code.replace(
        /^(?:bash|sh|zsh|shell|javascript|typescript|js|jsx|ts|tsx|py|python|json|html|css)\s+/i,
        '',
      );
      if (!code || /^[\s()]+$/.test(code)) return null;

      return (
        <code
          key={i}
          className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 font-mono text-[13px] text-amber-300 font-medium shadow-sm inline-block my-0.5"
        >
          {code}
        </code>
      );
    }

    // Single or multi-backtick inline code
    if (part.startsWith('`') && part.endsWith('`')) {
      let code = part.replace(/^`+|`+$/g, '').trim();
      code = code.replace(
        /^(?:bash|sh|zsh|shell|javascript|typescript|js|jsx|ts|tsx|py|python)\s+/i,
        '',
      );
      if (!code || /^[\s()]+$/.test(code)) return null;

      return (
        <code
          key={i}
          className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 font-mono text-[13px] text-amber-300 font-medium shadow-sm inline-block my-0.5"
        >
          {code}
        </code>
      );
    }

    // Bold
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const boldText = part.slice(2, -2).trim();
      if (!boldText) return null;

      return (
        <strong key={i} className="font-semibold text-white">
          {boldText}
        </strong>
      );
    }

    // Italic
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const italicText = part.slice(1, -1).trim();
      if (!italicText) return null;

      return (
        <em key={i} className="italic text-text">
          {italicText}
        </em>
      );
    }

    // Link
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch && linkMatch[1] && linkMatch[2]) {
      return (
        <a
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 underline underline-offset-4 hover:text-blue-300 transition-colors"
        >
          {linkMatch[1]}
        </a>
      );
    }

    // Clean any orphaned stray backticks from surrounding text
    const cleanPart = part.replace(/^`+|`+$/g, '');
    if (!cleanPart) return null;

    return <React.Fragment key={i}>{cleanPart}</React.Fragment>;
  });
}

// --- Syntax Tokenizer & Highlighter ---
const CODE_TOKEN_REGEX =
  /({\/\*[\s\S]*?\*\/\}|\/\/.*$|\/\*[\s\S]*?\*\/|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|<\/?[a-zA-Z0-9_\-.:]+|\/>|\b(?:import|export|from|default|function|return|const|let|var|if|else|switch|case|break|continue|for|while|try|catch|finally|throw|class|extends|async|await|type|interface|as|new|typeof|instanceof|void|delete|in|of|def|elif|lambda|pass|raise|with|SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|JOIN|GROUP|BY|ORDER)\b|\b(?:true|false|null|undefined|NaN)\b|\b\d+(?:\.\d+)?\b|\b[a-zA-Z_:][-a-zA-Z0-9_:.]*(?=\=)|\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\()|\b[A-Z][a-zA-Z0-9_$]*\b)/g;

function highlightCodeLine(line: string): React.ReactNode[] {
  if (!line) return ['\u00A0'];
  const parts = line.split(CODE_TOKEN_REGEX);

  return parts.map((part, i) => {
    if (!part) return null;

    // Comments
    if (
      part.startsWith('//') ||
      part.startsWith('/*') ||
      part.startsWith('{/*') ||
      (part.startsWith('#') && !part.startsWith('#include'))
    ) {
      return (
        <span key={i} className="text-slate-500 italic">
          {part}
        </span>
      );
    }

    // Strings
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'")) ||
      (part.startsWith('`') && part.endsWith('`'))
    ) {
      return (
        <span key={i} className="text-emerald-300 font-normal">
          {part}
        </span>
      );
    }

    // Keywords
    if (
      /^(import|export|from|default|function|return|const|let|var|if|else|switch|case|break|continue|for|while|try|catch|finally|throw|class|extends|async|await|type|interface|as|new|typeof|instanceof|void|delete|in|of|def|elif|lambda|pass|raise|with|SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|JOIN|GROUP|BY|ORDER)$/.test(
        part,
      )
    ) {
      return (
        <span key={i} className="text-purple-400 font-semibold">
          {part}
        </span>
      );
    }

    // Booleans & Null
    if (/^(true|false|null|undefined|NaN)$/.test(part)) {
      return (
        <span key={i} className="text-amber-400 font-medium">
          {part}
        </span>
      );
    }

    // Numbers
    if (/^\d+(?:\.\d+)?$/.test(part)) {
      return (
        <span key={i} className="text-amber-300">
          {part}
        </span>
      );
    }

    // JSX/HTML Tags
    if (part.startsWith('<') || part === '/>') {
      return (
        <span key={i} className="text-cyan-400 font-medium">
          {part}
        </span>
      );
    }

    // Identifiers: Attributes, functions, components
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(part)) {
      if (line.includes(`${part}=`)) {
        return (
          <span key={i} className="text-indigo-300">
            {part}
          </span>
        );
      }

      if (line.includes(`${part}(`)) {
        return (
          <span key={i} className="text-blue-400 font-medium">
            {part}
          </span>
        );
      }

      // PascalCase / Components / Types
      if (/^[A-Z]/.test(part)) {
        return (
          <span key={i} className="text-sky-300 font-semibold">
            {part}
          </span>
        );
      }
    }

    // Default
    return (
      <span key={i} className="text-slate-200">
        {part}
      </span>
    );
  });
}

// --- Memoized Single Code Line (Prevents re-rendering 1,000+ lines during streaming) ---
const CodeLine = React.memo(function CodeLine({
  lineNumber,
  line,
}: {
  lineNumber: number;
  line: string;
}) {
  return (
    <div className="table-row hover:bg-white/[0.03] transition-colors">
      <span className="table-cell pr-4 text-right select-none text-[12px] text-slate-600 font-mono w-10">
        {lineNumber}
      </span>
      <span className="table-cell whitespace-pre font-mono">
        {highlightCodeLine(line)}
      </span>
    </div>
  );
});

// --- Component Code Card with Independent Collapse State ---
export function CodeBlock({
  language,
  code,
  filename,
  embedded = false,
}: {
  language: string;
  code: string;
  filename?: string;
  embedded?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const displayLanguage = language.trim() || 'jsx';
  const lines = React.useMemo(() => code.split('\n'), [code]);

  // When embedded inside another section card, render as a sleek nested code block
  // without duplicate macOS window dots or an extra outer card header
  if (embedded) {
    return (
      <div className="my-3 overflow-hidden rounded-xl border border-white/[0.08] bg-[#070B12]">
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0D121F] px-3.5 py-2 text-xs">
          <div className="flex items-center gap-2">
            {filename ? (
              <span className="font-mono text-xs text-indigo-300 font-medium">{filename}</span>
            ) : null}
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {displayLanguage}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-white/[0.06] transition"
          >
            {copied ? (
              <>
                <CheckIcon className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400 text-[11px]">Copied</span>
              </>
            ) : (
              <>
                <CopyIcon className="h-3.5 w-3.5" />
                <span className="text-[11px]">Copy</span>
              </>
            )}
          </button>
        </div>
        <div className="overflow-x-auto p-3.5 font-mono text-[13px] leading-6">
          <div className="table w-full">
            {lines.map((line, lineIdx) => (
              <CodeLine key={lineIdx} lineNumber={lineIdx + 1} line={line} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-5 overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0B0F19] shadow-xl hover:border-indigo-500/30 transition-all duration-300">
      {/* Top Card Header with Independent Collapse Toggle */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/[0.08] bg-[#101626] px-4 py-3 text-xs cursor-pointer select-none transition-colors hover:bg-[#141b30]"
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* macOS window dots */}
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
          </div>

          {/* Component Filename Badge */}
          {filename ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-200 shadow-sm">
              <span className="text-cyan-400">⚛️</span>
              <span>{filename}</span>
            </div>
          ) : null}

          {/* Language badge */}
          <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300 border border-white/[0.06]">
            {displayLanguage}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Dedicated Copy Button for this specific component card */}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-200 transition-all hover:bg-indigo-600/30 hover:border-indigo-500/50 hover:text-white"
          >
            {copied ? (
              <>
                <CheckIcon className="h-4 w-4 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <CopyIcon className="h-4 w-4 text-slate-400" />
                <span>Copy code</span>
              </>
            )}
          </button>

          {/* Individual Card Collapse / Expand Toggle Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            title={isCollapsed ? 'Expand code' : 'Collapse code'}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.05] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-all hover:bg-white/[0.12] hover:text-white"
          >
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform duration-200 ${
                isCollapsed ? '-rotate-90 text-slate-400' : 'rotate-0 text-indigo-400'
              }`}
            />
            <span className="text-[11px]">{isCollapsed ? 'Expand' : 'Collapse'}</span>
          </button>
        </div>
      </div>

      {/* Code Body - Controlled by this card's own collapsed state */}
      {!isCollapsed ? (
        <div className="overflow-x-auto p-4 font-mono text-[13px] leading-6">
          <div className="table w-full">
            {lines.map((line, lineIdx) => (
              <CodeLine key={lineIdx} lineNumber={lineIdx + 1} line={line} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// --- Copy Button for Full Messages ---
export function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy message"
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      {copied ? (
        <>
          <CheckIcon className="h-4 w-4 text-emerald-400" />
          <span className="text-emerald-400 font-medium text-[11px]">Copied</span>
        </>
      ) : (
        <>
          <CopyIcon className="h-4 w-4" />
          <span className="text-[11px]">Copy</span>
        </>
      )}
    </button>
  );
}

// --- Icons ---
function CopyIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
      />
    </svg>
  );
}

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function ChevronDownIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}
