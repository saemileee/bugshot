import type { CSSChange, ChangeSet } from '../types/css-change';
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

export function formatSingleChange(change: CSSChange) {
  const rows = change.properties.map((prop) =>
    tableRow(
      tableCell(code(prop.property)),
      tableCell(text(prop.asIs)),
      tableCell(text(prop.toBe)),
    ),
  );

  return {
    version: 1,
    type: 'doc',
    content: [
      heading(2, 'Design QA - CSS Change'),
      {
        type: 'table',
        attrs: { isNumberColumnEnabled: false, layout: 'default' },
        content: [
          tableRow(
            tableHeader('Property'),
            tableHeader('As-Is'),
            tableHeader('To-Be'),
          ),
          ...rows,
        ],
      },
      heading(3, 'Context'),
      {
        type: 'bulletList',
        content: [
          listItem(
            paragraph(
              text('Page: '),
              text(change.url, [{ type: 'link', attrs: { href: change.url } }]),
            ),
          ),
          listItem(paragraph(text('Element: '), code(change.selector))),
          listItem(
            paragraph(
              text(`Captured: ${new Date(change.timestamp).toLocaleString()}`),
            ),
          ),
        ],
      },
      heading(3, 'Screenshots'),
      paragraph(text('See attached: before.png, after-annotated.png')),
    ],
  };
}

export function formatBatchedChanges(changeSet: ChangeSet) {
  const grouped = new Map<string, CSSChange[]>();
  for (const change of changeSet.changes) {
    const existing = grouped.get(change.selector) || [];
    existing.push(change);
    grouped.set(change.selector, existing);
  }

  const totalProps = changeSet.changes.reduce(
    (sum, c) => sum + c.properties.length,
    0,
  );

  const sections: object[] = [
    heading(
      2,
      `Design QA - Batched CSS Changes (${totalProps} properties across ${changeSet.changes.length} elements)`,
    ),
  ];

  for (const [selector, changes] of grouped) {
    sections.push(heading(3, `Element: ${selector}`));

    const allProps = changes.flatMap((c) => c.properties);
    const rows = allProps.map((prop) =>
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
        tableRow(
          tableHeader('Property'),
          tableHeader('As-Is'),
          tableHeader('To-Be'),
        ),
        ...rows,
      ],
    });
  }

  if (changeSet.manualNotes) {
    sections.push(heading(3, 'Designer Notes'));
    sections.push(paragraph(text(changeSet.manualNotes)));
  }

  sections.push(heading(3, 'Context'));
  sections.push({
    type: 'bulletList',
    content: [
      listItem(
        paragraph(
          text('Page: '),
          text(changeSet.pageUrl, [
            { type: 'link', attrs: { href: changeSet.pageUrl } },
          ]),
        ),
      ),
      listItem(
        paragraph(
          text(
            `Captured: ${new Date(changeSet.createdAt).toLocaleString()}`,
          ),
        ),
      ),
    ],
  });

  return { version: 1, type: 'doc', content: sections };
}

export function generateSummary(changeSet: ChangeSet): string {
  const title =
    changeSet.pageTitle || new URL(changeSet.pageUrl).pathname;

  if (changeSet.changes.length === 0) {
    return `${TICKET_PREFIX} ${title} - Manual QA note`;
  }
  if (changeSet.changes.length === 1) {
    const prop =
      changeSet.changes[0].properties[0]?.property || 'style';
    return `${TICKET_PREFIX} ${title} - ${prop} change on ${changeSet.changes[0].selector}`;
  }
  return `${TICKET_PREFIX} ${title} - ${changeSet.changes.length} CSS changes`;
}
