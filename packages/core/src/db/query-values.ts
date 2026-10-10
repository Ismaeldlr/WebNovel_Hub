/**
 * Collects a query's values for a statement built from optional parts: `param` appends
 * one and returns its `$n` placeholder, so nobody counts parameters by hand. Only values
 * go through it; SQL text comes from the code.
 */
export function queryValues(initial: unknown[] = []) {
  const values = [...initial];
  const param = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  return { values, param };
}
