/**
 * Tiny markdown→HTML for release notes on /changelog.
 *
 * Handles exactly what landfall/semantic-release emits: #/##/### headings
 * (top-level # is dropped — the card already shows tag + date), `*` and `-`
 * bullets, inline [text](url) links, **bold**, and `code`. Output is still
 * passed through sanitize-html at the render site; this also escapes raw
 * HTML in the source so markup in commit messages can't inject tags.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline break-all">$1</a>'
    );
}

export function markdownToHtml(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      result.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    if (/^# /.test(line) || /^#{1,3} \[?v?\d+\.\d+\.\d+/.test(line)) {
      // Version headings duplicate the card's tag/date header
      // (semantic-release emits "# [x.y.0]" for minors, "## [x.y.z]" for patches).
      closeList();
    } else if (line.startsWith('### ')) {
      closeList();
      result.push(`<h4 class="text-base font-semibold mt-4 mb-2">${inline(line.slice(4))}</h4>`);
    } else if (line.startsWith('## ')) {
      closeList();
      result.push(`<h3 class="text-lg font-semibold mt-4 mb-2">${inline(line.slice(3))}</h3>`);
    } else if (/^[-*] /.test(line)) {
      if (!inList) {
        result.push('<ul class="list-disc ml-4 space-y-1">');
        inList = true;
      }
      result.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      result.push(`<p class="my-2">${inline(line)}</p>`);
    }
  }

  closeList();
  return result.join('\n');
}
