import type { ChangeSet } from '../types/css-change';
import { TICKET_PREFIX } from '../constants';

// ADF node constructors
const text = (t: string, marks?: object[]) => ({
  type: 'text' as const,
  text: t,
  ...(marks ? { marks } : {}),
});
const code = (t: string) => text(t, [{ type: 'code' }]);
const paragraph = (...content: object[]) => ({ type: 'paragraph' as const, content });
const heading = (level: number, t: string) => ({
  type: 'heading' as const,
  attrs: { level },
  content: [text(t)],
});
const tableHeader = (t: string) => ({
  type: 'tableHeader' as const,
  content: [paragraph(text(t))],
});
const tableCell = (...content: object[]) => ({
  type: 'tableCell' as const,
  content: [paragraph(...content)],
});
const tableRow = (...cells: object[]) => ({
  type: 'tableRow' as const,
  content: cells,
});
const listItem = (...content: object[]) => ({
  type: 'listItem' as const,
  content,
});

/**
 * Build a comprehensive ADF description with all content (no inline media nodes).
 * Screenshots are referenced by filename so users can find them in the Attachments section.
 * This is the PRIMARY description — used even when inline media is unavailable.
 */
export function buildFullDescription(
  changeSet: ChangeSet,
  screenshotFilenames: string[],
): object {
  const sections: object[] = [];

  for (const change of changeSet.changes) {
    sections.push(heading(3, `Element: ${change.selector}`));

    // Reference per-element screenshots by filename
    // Order: As-Is → description → To-Be → property table
    const safeSel = change.selector.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const asIsName = `${safeSel}-as-is.png`;
    const toBeName = `${safeSel}-to-be.png`;
    const hasAsIs = screenshotFilenames.includes(asIsName);
    const hasToBe = screenshotFilenames.includes(toBeName);

    if (hasAsIs) {
      sections.push(paragraph(
        text('As-Is: ', [{ type: 'strong' }]),
        code(asIsName),
      ));
    }

    // Description sits right below As-Is
    if (change.description) {
      sections.push(paragraph(text(change.description)));
    }

    if (hasToBe) {
      sections.push(paragraph(
        text('To-Be: ', [{ type: 'strong' }]),
        code(toBeName),
      ));
    }

    // Property table
    if (change.properties.length > 0) {
      const rows = change.properties.map((prop) =>
        tableRow(
          tableCell(code(prop.property)),
          tableCell(text(prop.asIs)),
          tableCell(text(prop.toBe)),
        ),
      );
      sections.push({
        type: 'table',
        attrs: { isNumberColumnEnabled: false, layout: 'default' },
        content: [
          tableRow(tableHeader('Property'), tableHeader('As-Is'), tableHeader('To-Be')),
          ...rows,
        ],
      });
    }
  }

  // Manual screenshots
  const manualScreenshots = screenshotFilenames.filter((n) => n.startsWith('screenshot-'));
  if (manualScreenshots.length > 0) {
    sections.push(heading(3, 'Screenshots'));
    for (const name of manualScreenshots) {
      sections.push(paragraph(code(name)));
    }
  }

  // Video
  const videoFiles = screenshotFilenames.filter((n) => n.startsWith('recording-'));
  if (videoFiles.length > 0) {
    sections.push(heading(3, 'Video'));
    for (const name of videoFiles) {
      sections.push(paragraph(code(name)));
    }
  }

  // Notes
  if (changeSet.manualNotes) {
    sections.push(heading(3, 'Notes'));
    sections.push(paragraph(text(changeSet.manualNotes)));
  }

  // Context
  sections.push(heading(3, 'Context'));
  sections.push({
    type: 'bulletList',
    content: [
      listItem(
        paragraph(
          text('Page: '),
          text(changeSet.pageUrl, [{ type: 'link', attrs: { href: changeSet.pageUrl } }]),
        ),
      ),
      listItem(paragraph(text(`Captured: ${new Date(changeSet.createdAt).toLocaleString()}`))),
    ],
  });

  if (sections.length === 0) {
    sections.push(paragraph(text('BugShot submission')));
  }

  return { version: 1, type: 'doc', content: sections };
}

/**
 * Build a Jira wiki markup description with inline images.
 * `!filename.png|thumbnail!` references attachments by name — no media UUID needed.
 * Used with REST API v2 PUT to replace the description after attachments are uploaded.
 */
export function buildWikiMarkupDescription(
  changeSet: ChangeSet,
  screenshotFilenames: string[],
): string {
  const lines: string[] = [];

  for (const change of changeSet.changes) {
    lines.push(`h3. Element: ${change.selector}`);
    lines.push('');

    // Order: As-Is → description → To-Be → property table
    const safeSel = change.selector.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const asIsName = `${safeSel}-as-is.png`;
    const toBeName = `${safeSel}-to-be.png`;
    const hasAsIs = screenshotFilenames.includes(asIsName);
    const hasToBe = screenshotFilenames.includes(toBeName);

    // Screenshots table (As-Is / To-Be side by side)
    if (hasAsIs || hasToBe) {
      lines.push('||As-Is||To-Be||');
      lines.push(`|${hasAsIs ? `!${asIsName}|width=400!` : ' '}|${hasToBe ? `!${toBeName}|width=400!` : ' '}|`);
      lines.push('');
    }

    if (change.description) {
      lines.push(`{quote}${change.description}{quote}`);
      lines.push('');
    }

    if (change.properties.length > 0) {
      lines.push('||Property||As-Is||To-Be||');
      for (const prop of change.properties) {
        lines.push(`|{{${prop.property}}}|${prop.asIs}|${prop.toBe}|`);
      }
      lines.push('');
    }
  }

  // Manual screenshots
  const manualScreenshots = screenshotFilenames.filter((n) => n.startsWith('screenshot-'));
  if (manualScreenshots.length > 0) {
    lines.push('h3. Screenshots');
    lines.push('');
    for (const name of manualScreenshots) {
      lines.push(`!${name}|width=800!`);
    }
    lines.push('');
  }

  // Video
  const videoFiles = screenshotFilenames.filter((n) => n.startsWith('recording-'));
  if (videoFiles.length > 0) {
    lines.push('h3. Video');
    lines.push('');
    for (const name of videoFiles) {
      lines.push(`[^${name}]`);
    }
    lines.push('');
  }

  // Notes
  if (changeSet.manualNotes) {
    lines.push('h3. Notes');
    lines.push('');
    lines.push(changeSet.manualNotes);
    lines.push('');
  }

  // Context
  lines.push('h3. Context');
  lines.push('');
  lines.push(`* Page: [${changeSet.pageUrl}]`);
  lines.push(`* Captured: ${new Date(changeSet.createdAt).toLocaleString()}`);

  return lines.join('\n');
}

export function generateSummary(changeSet: ChangeSet, prefix: string = TICKET_PREFIX): string {
  const title =
    changeSet.pageTitle || new URL(changeSet.pageUrl).pathname;
  const pre = prefix ? `${prefix} ` : '';

  if (changeSet.changes.length === 0) {
    return `${pre}${title} - Manual QA note`;
  }
  if (changeSet.changes.length === 1) {
    const prop =
      changeSet.changes[0].properties[0]?.property || 'style';
    return `${pre}${title} - ${prop} change on ${changeSet.changes[0].selector}`;
  }
  return `${pre}${title} - ${changeSet.changes.length} CSS changes`;
}
