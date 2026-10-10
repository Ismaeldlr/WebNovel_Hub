// SQLite's messages name what failed ("UNIQUE constraint failed: novels.source_url",
// "CHECK constraint failed: novels_title_not_blank"), and every driver passes them on.

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

/** A unique-constraint violation, optionally on one specific `table.column`. */
export function isUniqueViolation(error: unknown, column?: string): boolean {
  const match = /UNIQUE constraint failed: ([^(]+)/.exec(messageOf(error));
  if (!match) return false;
  return column === undefined || match[1]!.split(',').some((c) => c.trim() === column);
}

/** A CHECK-constraint violation, optionally of one named constraint. */
export function isCheckViolation(error: unknown, constraint?: string): boolean {
  const match = /CHECK constraint failed: (\w+)/.exec(messageOf(error));
  if (!match) return false;
  return constraint === undefined || match[1] === constraint;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return /FOREIGN KEY constraint failed/.test(messageOf(error));
}
