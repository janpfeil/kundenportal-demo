import { Fragment, type HTMLAttributes, type ReactNode } from "react";
import { joinClasses } from "./link.js";

export interface Fact {
  term: ReactNode;
  description: ReactNode;
  /** React key; needed when `term` is not a string. */
  id?: string;
}

export interface FactsProps extends HTMLAttributes<HTMLDListElement> {
  items: readonly Fact[];
}

/** Label/value pairs as a definition list; stacks on narrow screens. */
export function Facts({ items, className, ...rest }: FactsProps) {
  return (
    <dl className={joinClasses("kp-facts", className)} {...rest}>
      {items.map((item, index) => (
        <Fragment key={item.id ?? (typeof item.term === "string" ? item.term : index)}>
          <dt>{item.term}</dt>
          <dd>{item.description}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export interface Column<Row> {
  key: string;
  header: string;
  /** "end" right-aligns numbers on wide screens. */
  align?: "start" | "end";
  render: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  /** Visible caption; it names the table. */
  caption: ReactNode;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/**
 * A simple table. On narrow screens (< 600 px) every row becomes a stack of label/value pairs,
 * so 360 px wide phones need no horizontal scrolling.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  className,
  "data-testid": testId,
}: DataTableProps<Row>) {
  if (rows.length === 0 && empty !== undefined) return <>{empty}</>;
  return (
    <table className={joinClasses("kp-table", className)} data-testid={testId}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" data-align={column.align ?? "start"}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((column) => (
              <td key={column.key} data-label={column.header} data-align={column.align ?? "start"}>
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
