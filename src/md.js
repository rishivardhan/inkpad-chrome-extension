// Small, dependency-free Markdown renderer for the preview pane.
// Covers: headings, paragraphs (single newlines kept as line breaks), bold, italic,
// strike, ==highlight==, inline code, fenced code, links, autolinks, images,
// blockquotes, nested ordered/unordered lists, task lists (clickable), tables, rules.
// Task checkboxes carry data-line so the app can toggle the source line.

export const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const safeUrl = (u) => /^(https?:|mailto:|#|\/|\.\.?\/)/i.test(u);

function inline(src) {
  return src
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${esc(part.slice(1, -1))}</code>`;
      let t = esc(part);
      t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) =>
        safeUrl(url) ? `<img alt="${alt}" src="${url}">` : m);
      t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) =>
        safeUrl(url) ? `<a href="${url}" target="_blank" rel="noopener">${label}</a>` : m);
      t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
      t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/__(.+?)__/g, '<strong>$1</strong>');
      t = t.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>');
      t = t.replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, '$1<em>$2</em>');
      t = t.replace(/~~(.+?)~~/g, '<del>$1</del>');
      t = t.replace(/==(.+?)==/g, '<mark>$1</mark>');
      return t;
    })
    .join('');
}

const RE = {
  fence: /^\s*(```|~~~)\s*([\w+-]*)\s*$/,
  heading: /^(#{1,6})\s+(.*?)\s*#*\s*$/,
  hr: /^\s*([-*_])(\s*\1){2,}\s*$/,
  quote: /^\s*>\s?/,
  list: /^(\s*)([-*+]|\d+[.)])\s+(.*)$/,
  task: /^\[([ xX])\]\s+(.*)$/,
  tableSep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/,
};

const splitRow = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function renderList(items) {
  let html = '';
  const stack = [];
  for (const it of items) {
    const tag = it.ordered ? 'ol' : 'ul';
    let top = stack[stack.length - 1];
    while (top && it.indent < top.indent) {
      html += `</li></${top.tag}>`;
      stack.pop();
      top = stack[stack.length - 1];
    }
    if (!top || it.indent > top.indent) {
      html += `<${tag}>`;
      stack.push({ indent: it.indent, tag });
    } else {
      html += '</li>';
      if (top.tag !== tag) {
        html += `</${top.tag}><${tag}>`;
        top.tag = tag;
      }
    }
    const task = it.text.match(RE.task);
    if (task) {
      const checked = task[1] !== ' ';
      html += `<li class="task${checked ? ' done' : ''}"><input type="checkbox" data-line="${it.line}"${checked ? ' checked' : ''}> <span>${inline(task[2])}</span>`;
    } else {
      html += `<li>${inline(it.text)}`;
    }
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}

export function renderMarkdown(text, offset = 0) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    const fence = line.match(RE.fence);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      html += `<pre><code${fence[2] ? ` data-lang="${esc(fence[2])}"` : ''}>${esc(body.join('\n'))}</code></pre>`;
      continue;
    }

    const h = line.match(RE.heading);
    if (h) {
      html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
      i++;
      continue;
    }

    if (RE.hr.test(line)) { html += '<hr>'; i++; continue; }

    if (RE.quote.test(line)) {
      const start = i;
      const body = [];
      while (i < lines.length && RE.quote.test(lines[i])) body.push(lines[i++].replace(RE.quote, ''));
      html += `<blockquote>${renderMarkdown(body.join('\n'), offset + start)}</blockquote>`;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) =>
        c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : '');
      i += 2;
      let t = '<div class="table-wrap"><table><thead><tr>';
      head.forEach((c, k) => { t += `<th${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(c)}</th>`; });
      t += '</tr></thead><tbody>';
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        t += '<tr>';
        splitRow(lines[i]).forEach((c, k) => { t += `<td${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(c)}</td>`; });
        t += '</tr>';
        i++;
      }
      html += `${t}</tbody></table></div>`;
      continue;
    }

    if (RE.list.test(line)) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(RE.list);
        if (m) {
          items.push({
            indent: m[1].replace(/\t/g, '  ').length,
            ordered: /\d/.test(m[2]),
            text: m[3],
            line: offset + i,
          });
          i++;
        } else if (items.length && /^\s+\S/.test(lines[i])) {
          items[items.length - 1].text += '\n' + lines[i].trim();
          i++;
        } else break;
      }
      html += renderList(items.map((it) => ({ ...it, text: it.text })))
        .replace(/\n/g, '<br>');
      continue;
    }

    const para = [];
    while (
      i < lines.length && lines[i].trim() &&
      !RE.fence.test(lines[i]) && !RE.heading.test(lines[i]) && !RE.quote.test(lines[i]) &&
      !RE.list.test(lines[i]) && !RE.hr.test(lines[i])
    ) para.push(lines[i++]);
    html += `<p>${para.map(inline).join('<br>')}</p>`;
  }
  return html;
}
