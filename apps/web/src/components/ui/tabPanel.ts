/** Props for the panel that belongs to a Tabs list. */
export function tabPanelProps(idPrefix: string, selected: string) {
  return {
    id: `${idPrefix}-panel`,
    role: 'tabpanel',
    'aria-labelledby': `${idPrefix}-tab-${selected}`,
  } as const;
}
