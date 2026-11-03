import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function deriveFallbackTitle(userPrompt: string): string {
  const singleLine = userPrompt.trim().split('\n')[0]?.trim() ?? '';
  if (!singleLine) return 'New Chat';
  if (singleLine.length <= 36) return singleLine;
  return `${singleLine.slice(0, 33)}...`;
}

function cleanTitle(rawTitle: string): string {
  return rawTitle
    .replace(/^["'`#*\s]+|["'`#*\s]+$/g, '')
    .replace(/^(Title|Topic):\s*/i, '')
    .split('\n')[0]
    ?.trim() ?? '';
}

describe('Chat title derivation & cleanup', () => {
  it('cleans quotes, backticks and markdown headers from model output', () => {
    assert.equal(cleanTitle('"React Website Development"'), 'React Website Development');
    assert.equal(cleanTitle('**Fixing Memory Leaks**'), 'Fixing Memory Leaks');
    assert.equal(cleanTitle('Title: Python Data Processing'), 'Python Data Processing');
    assert.equal(cleanTitle('`Next.js Setup`'), 'Next.js Setup');
  });

  it('derives fallback title for empty or short prompt', () => {
    assert.equal(deriveFallbackTitle(''), 'New Chat');
    assert.equal(deriveFallbackTitle('   '), 'New Chat');
    assert.equal(deriveFallbackTitle('Hello world'), 'Hello world');
  });

  it('truncates long first lines cleanly', () => {
    const longPrompt = 'Please help me write a very long essay explaining quantum computing algorithms';
    const fallback = deriveFallbackTitle(longPrompt);
    assert.equal(fallback.length, 36);
    assert.ok(fallback.endsWith('...'));
  });
});

