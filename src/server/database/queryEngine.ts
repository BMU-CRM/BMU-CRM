// Answers the app's database queries. The query builder describes each query as a
// request (table, columns, filters, order); this file turns that into SQL and runs it
// as the signed-in user, so row level security decides what comes back.
//
// It speaks the same request format as PostgREST, the standard REST layer for
// Postgres, which keeps the app's query code unchanged if the database is ever
// moved to a hosted Postgres service.
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { getSchemaInfo, type ForeignKey, type FunctionInfo, type SchemaInfo, type TableInfo } from './databaseSchemaInfo';
import { runAs, type Identity } from './localDatabase';

class QueryError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: string | null = null,
    public hint: string | null = null,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function firstRow<Row>(rows: Row[]): Row {
  const [row] = rows;
  if (!row) throw new QueryError(500, 'PGRST000', 'The database returned no result.');
  return row;
}

function quoteIdent(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}

class Params {
  values: (string | null)[] = [];
  add(value: unknown) {
    this.values.push(value === null || value === undefined ? null : String(value));
    return `$${this.values.length}`;
  }
}

// Splits on commas that are not inside brackets or double quotes.
function splitTopLevel(text: string) {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\' && quoted) {
      current += char + (text[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (!quoted && char === '(') depth += 1;
    if (!quoted && char === ')') depth -= 1;
    if (!quoted && depth === 0 && char === ',') {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current !== '') parts.push(current);
  return parts;
}

function unquote(value: string) {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1).replace(/\\(.)/g, '$1')
    : value;
}

// A Postgres array literal, such as {"a","b c"}.
function arrayLiteral(values: unknown[]) {
  return `{${values
    .map((value) => (value === null ? 'NULL' : `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`))
    .join(',')}}`;
}

// ---------------------------------------------------------------------------
// Select lists: "id, name, owner:employees!files_owner_id_fkey(id, full_name)"
// ---------------------------------------------------------------------------

type SelectItem =
  | { kind: 'star' }
  | { kind: 'column'; name: string; alias?: string; cast?: string }
  | { kind: 'embed'; relation: string; alias?: string; hints: string[]; inner: boolean; items: SelectItem[] };

function parseSelect(text: string | null): SelectItem[] {
  if (!text || text === '*') return [{ kind: 'star' }];
  return splitTopLevel(text).map((part) => {
    const item = part.trim();
    if (item === '*') return { kind: 'star' } as const;

    const embed = item.match(/^(?:([A-Za-z_][\w]*):)?([A-Za-z_][\w]*)((?:![A-Za-z_][\w]*)*)\((.*)\)$/s);
    if (embed) {
      const hints = embed[3] ? embed[3].slice(1).split('!') : [];
      const parsed: SelectItem = {
        kind: 'embed',
        alias: embed[1],
        relation: embed[2] ?? '',
        hints: hints.filter((hint) => hint !== 'inner' && hint !== 'left'),
        inner: hints.includes('inner'),
        items: parseSelect(embed[4] || '*'),
      };
      return parsed;
    }

    const column = item.match(/^(?:([A-Za-z_][\w]*):)?([A-Za-z_][\w]*)(?:::([A-Za-z_][\w ]*))?$/);
    if (!column) throw new QueryError(400, 'PGRST100', `Could not understand "${item}" in the select list.`);
    const parsed: SelectItem = { kind: 'column', alias: column[1], name: column[2] ?? '', cast: column[3] };
    return parsed;
  });
}

// ---------------------------------------------------------------------------
// Filters: "status=eq.open", "not.in.(a,b)", "or=(a.eq.1,b.is.null)"
// ---------------------------------------------------------------------------

type Condition =
  | { kind: 'compare'; column: string; operator: string; value: string; negate: boolean }
  | { kind: 'group'; joiner: 'and' | 'or'; conditions: Condition[]; negate: boolean };

function parseOperatorValue(column: string, text: string): Condition {
  let rest = text;
  let negate = false;
  if (rest.startsWith('not.')) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf('.');
  if (dot < 0) throw new QueryError(400, 'PGRST100', `Could not understand the filter "${column}=${text}".`);
  return { kind: 'compare', column, operator: rest.slice(0, dot), value: rest.slice(dot + 1), negate };
}

function parseLogic(joiner: 'and' | 'or', text: string, negate: boolean): Condition {
  if (!text.startsWith('(') || !text.endsWith(')')) {
    throw new QueryError(400, 'PGRST100', `Could not understand the ${joiner} filter "${text}".`);
  }
  const conditions = splitTopLevel(text.slice(1, -1)).map((part): Condition => {
    const nested = part.match(/^(not\.)?(and|or)(\(.*\))$/s);
    if (nested) return parseLogic(nested[2] as 'and' | 'or', nested[3] ?? '', Boolean(nested[1]));
    const dot = part.indexOf('.');
    return parseOperatorValue(part.slice(0, dot), part.slice(dot + 1));
  });
  return { kind: 'group', joiner, conditions, negate };
}

const comparisonOperators: Record<string, string> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'like',
  ilike: 'ilike',
  cs: '@>',
  cd: '<@',
  ov: '&&',
};

function conditionSql(condition: Condition, alias: string, table: TableInfo | null, params: Params): string {
  if (condition.kind === 'group') {
    const inner = condition.conditions.map((item) => conditionSql(item, alias, table, params));
    const sql = inner.length ? `(${inner.join(` ${condition.joiner} `)})` : 'true';
    return condition.negate ? `not ${sql}` : sql;
  }

  const { column, operator, value } = condition;
  if (table && !table.columns.has(column)) {
    throw new QueryError(400, '42703', `column ${table.name}.${column} does not exist`);
  }
  const columnSql = `${alias}.${quoteIdent(column)}`;
  const columnType = table?.columns.get(column);
  let sql: string;

  if (operator === 'is') {
    const keyword = { null: 'null', true: 'true', false: 'false', unknown: 'unknown' }[value.toLowerCase()];
    if (!keyword) throw new QueryError(400, 'PGRST100', `Unknown is. value "${value}".`);
    sql = `${columnSql} is ${keyword}`;
  } else if (operator === 'in') {
    const list = value.startsWith('(') && value.endsWith(')') ? splitTopLevel(value.slice(1, -1)).map(unquote) : [];
    sql = list.length ? `${columnSql} in (${list.map((item) => params.add(item)).join(', ')})` : 'false';
  } else if (operator in comparisonOperators) {
    const text = operator === 'like' || operator === 'ilike' ? value.replaceAll('*', '%') : value;
    const cast = ['cs', 'cd', 'ov'].includes(operator) && columnType ? `::${columnType}` : '';
    sql = `${columnSql} ${comparisonOperators[operator]} ${params.add(text)}${cast}`;
  } else {
    throw new QueryError(400, 'PGRST100', `The filter operator "${operator}" is not supported.`);
  }

  return condition.negate ? `not (${sql})` : sql;
}

// Filters, order and limits grouped by where they apply: '' for the main table, or
// the alias of an embedded table such as 'file'.
type Modifiers = { conditions: Condition[]; order: string | null; limit: number | null; offset: number | null };

const reservedKeys = new Set(['select', 'columns', 'on_conflict']);

function readModifiers(searchParams: URLSearchParams) {
  const byPath = new Map<string, Modifiers>();
  const forPath = (path: string) => {
    let entry = byPath.get(path);
    if (!entry) {
      entry = { conditions: [], order: null, limit: null, offset: null };
      byPath.set(path, entry);
    }
    return entry;
  };

  for (const [key, value] of searchParams) {
    if (reservedKeys.has(key)) continue;
    const dot = key.lastIndexOf('.');
    const path = dot >= 0 ? key.slice(0, dot) : '';
    const name = dot >= 0 ? key.slice(dot + 1) : key;
    const entry = forPath(path);

    if (name === 'order') entry.order = value;
    else if (name === 'limit') entry.limit = Number(value);
    else if (name === 'offset') entry.offset = Number(value);
    else if (name === 'or' || name === 'and') entry.conditions.push(parseLogic(name, value, false));
    else entry.conditions.push(parseOperatorValue(name, value));
  }
  return byPath;
}

function orderSql(order: string | null, alias: string, table: TableInfo | null) {
  if (!order) return '';
  const terms = splitTopLevel(order).map((term) => {
    const [column = '', ...flags] = term.split('.');
    if (table && !table.columns.has(column)) {
      throw new QueryError(400, '42703', `column ${table.name}.${column} does not exist`);
    }
    const direction = flags.includes('desc') ? ' desc' : flags.includes('asc') ? ' asc' : '';
    const nulls = flags.includes('nullsfirst') ? ' nulls first' : flags.includes('nullslast') ? ' nulls last' : '';
    return `${alias}.${quoteIdent(column)}${direction}${nulls}`;
  });
  return ` order by ${terms.join(', ')}`;
}

function limitSql(modifiers: Modifiers | undefined) {
  let sql = '';
  if (modifiers?.limit !== null && modifiers?.limit !== undefined && Number.isFinite(modifiers.limit)) {
    sql += ` limit ${Math.max(0, Math.floor(modifiers.limit))}`;
  }
  if (modifiers?.offset !== null && modifiers?.offset !== undefined && Number.isFinite(modifiers.offset)) {
    sql += ` offset ${Math.max(0, Math.floor(modifiers.offset))}`;
  }
  return sql;
}

// ---------------------------------------------------------------------------
// Joined records
// ---------------------------------------------------------------------------

type Relationship = { kind: 'many-to-one' | 'one-to-many'; foreignKey: ForeignKey };

function findRelationship(schema: SchemaInfo, source: string, target: string, hints: string[]): Relationship {
  const sameColumns = (columns: string[], hint: string) => columns.length === 1 && columns[0] === hint;

  let candidates: Relationship[] = [
    ...schema.foreignKeys
      .filter((fk) => fk.table === source && fk.refTable === target)
      .map((foreignKey) => ({ kind: 'many-to-one' as const, foreignKey })),
    ...schema.foreignKeys
      .filter((fk) => fk.table === target && fk.refTable === source)
      .map((foreignKey) => ({ kind: 'one-to-many' as const, foreignKey })),
  ];

  for (const hint of hints) {
    candidates = candidates.filter(
      (candidate) =>
        candidate.foreignKey.name === hint ||
        (candidate.kind === 'many-to-one' && sameColumns(candidate.foreignKey.columns, hint)) ||
        (candidate.kind === 'one-to-many' && sameColumns(candidate.foreignKey.columns, hint)),
    );
  }

  // A table linked to itself matches in both directions. Like PostgREST, the hint
  // names the parent record, so the many-to-one link wins.
  if (source === target && candidates.length === 2 && candidates[0]?.foreignKey === candidates[1]?.foreignKey) {
    candidates = candidates.filter((candidate) => candidate.kind === 'many-to-one');
  }

  const [only] = candidates;
  if (!only) {
    throw new QueryError(400, 'PGRST200', `Could not find a relationship between '${source}' and '${target}'.`);
  }
  if (candidates.length > 1) {
    throw new QueryError(
      300,
      'PGRST201',
      `Could not embed because more than one relationship was found for '${source}' and '${target}'.`,
      candidates.map((candidate) => candidate.foreignKey.name).join(', '),
      'Add the foreign key name after "!" to choose one.',
    );
  }
  return only;
}

type BuildContext = {
  schema: SchemaInfo;
  params: Params;
  modifiers: Map<string, Modifiers>;
  aliasCounter: { value: number };
};

function joinSql(relationship: Relationship, childAlias: string, parentAlias: string) {
  const { foreignKey, kind } = relationship;
  return foreignKey.columns
    .map((column, index) => {
      const referenced = foreignKey.refColumns[index] ?? '';
      return kind === 'many-to-one'
        ? `${childAlias}.${quoteIdent(referenced)} = ${parentAlias}.${quoteIdent(column)}`
        : `${childAlias}.${quoteIdent(column)} = ${parentAlias}.${quoteIdent(referenced)}`;
    })
    .join(' and ');
}

type EmbedSql = { column: string; innerCondition: string | null };

function embedSql(
  item: Extract<SelectItem, { kind: 'embed' }>,
  parentTable: TableInfo,
  parentAlias: string,
  path: string,
  context: BuildContext,
): EmbedSql {
  let target = context.schema.tables.get(item.relation);
  let relationship: Relationship;

  // "parent:parent_department_id(name)" names the linking column instead of the table.
  const byColumn = context.schema.foreignKeys.find(
    (fk) => fk.table === parentTable.name && fk.columns.length === 1 && fk.columns[0] === item.relation,
  );
  if (!target && byColumn) {
    target = context.schema.tables.get(byColumn.refTable);
    relationship = { kind: 'many-to-one', foreignKey: byColumn };
  } else {
    if (!target) throw new QueryError(400, 'PGRST200', `Could not find the table '${item.relation}'.`);
    relationship = findRelationship(context.schema, parentTable.name, target.name, item.hints);
  }
  if (!target) throw new QueryError(400, 'PGRST200', `Could not find the table '${item.relation}'.`);

  context.aliasCounter.value += 1;
  const alias = `_s${context.aliasCounter.value}`;
  const name = item.alias ?? item.relation;
  const childPath = path ? `${path}.${name}` : name;
  const modifiers = context.modifiers.get(childPath);

  const where = [joinSql(relationship, alias, parentAlias)];
  for (const condition of modifiers?.conditions ?? []) {
    where.push(conditionSql(condition, alias, target, context.params));
  }
  const whereSql = where.join(' and ');
  const from = `public.${quoteIdent(target.name)} as ${alias}`;
  const innerCondition = item.inner ? `exists (select 1 from ${from} where ${whereSql})` : null;

  // "relation(count)" asks only for how many linked rows there are.
  const [firstItem] = item.items;
  const isCount =
    item.items.length === 1 && firstItem?.kind === 'column' && firstItem.name === 'count' && !target.columns.has('count');

  if (isCount) {
    const countSql = `(select count(*) from ${from} where ${whereSql})`;
    return {
      column: `json_build_array(json_build_object('count', ${countSql})) as ${quoteIdent(name)}`,
      innerCondition,
    };
  }

  const projection = projectionSql(item.items, target, alias, childPath, context);
  const inner = `select ${projection.columns.join(', ')} from ${from} where ${[whereSql, ...projection.innerConditions].join(' and ')}`;

  if (relationship.kind === 'many-to-one') {
    return { column: `(select row_to_json(_r) from (${inner} limit 1) as _r) as ${quoteIdent(name)}`, innerCondition };
  }

  const ordered = `${inner}${orderSql(modifiers?.order ?? null, alias, target)}${limitSql(modifiers)}`;
  return {
    column: `coalesce((select json_agg(_r) from (${ordered}) as _r), '[]'::json) as ${quoteIdent(name)}`,
    innerCondition,
  };
}

function projectionSql(items: SelectItem[], table: TableInfo, alias: string, path: string, context: BuildContext) {
  const columns: string[] = [];
  const innerConditions: string[] = [];

  for (const item of items) {
    if (item.kind === 'star') {
      columns.push(`${alias}.*`);
    } else if (item.kind === 'column') {
      if (!table.columns.has(item.name)) {
        throw new QueryError(400, '42703', `column ${table.name}.${item.name} does not exist`);
      }
      const cast = item.cast ? `::${item.cast}` : '';
      columns.push(`${alias}.${quoteIdent(item.name)}${cast} as ${quoteIdent(item.alias ?? item.name)}`);
    } else {
      const embed = embedSql(item, table, alias, path, context);
      columns.push(embed.column);
      if (embed.innerCondition) innerConditions.push(embed.innerCondition);
    }
  }

  return { columns, innerConditions };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

type ParsedRequest = {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
};

type QueryResult = { status: number; body: string; contentRange?: string };

function prefers(request: ParsedRequest, value: string) {
  return (request.headers.get('prefer') ?? '').split(/[,\s]+/).includes(value);
}

function wantsObject(request: ParsedRequest) {
  return (request.headers.get('accept') ?? '').includes('application/vnd.pgrst.object+json');
}

function wantsCount(request: ParsedRequest) {
  return /count=(exact|planned|estimated)/.test(request.headers.get('prefer') ?? '');
}

// Turns a JSON array of rows into the response the client expects.
function shapeRows(request: ParsedRequest, rowsJson: string, status: number): QueryResult {
  if (!wantsObject(request)) return { status, body: rowsJson };
  const rows = JSON.parse(rowsJson) as unknown[];
  if (rows.length !== 1) {
    throw new QueryError(
      406,
      'PGRST116',
      'JSON object requested, multiple (or no) rows returned',
      `The result contains ${rows.length} rows`,
    );
  }
  return { status, body: JSON.stringify(rows[0]) };
}

function getTable(schema: SchemaInfo, name: string) {
  const table = schema.tables.get(name);
  if (!table) throw new QueryError(404, '42P01', `relation "public.${name}" does not exist`);
  return table;
}

async function readRows(tx: Transaction, request: ParsedRequest, schema: SchemaInfo, table: TableInfo): Promise<QueryResult> {
  const params = new Params();
  const modifiers = readModifiers(request.url.searchParams);
  const context: BuildContext = { schema, params, modifiers, aliasCounter: { value: 0 } };
  const top = modifiers.get('');

  const projection = projectionSql(parseSelect(request.url.searchParams.get('select')), table, '_s0', '', context);
  const where = [
    ...(top?.conditions ?? []).map((condition) => conditionSql(condition, '_s0', table, params)),
    ...projection.innerConditions,
  ];
  const whereSql = where.length ? ` where ${where.join(' and ')}` : '';
  const from = `public.${quoteIdent(table.name)} as _s0`;

  let total: number | null = null;
  if (wantsCount(request)) {
    const counted = await tx.query<{ total: number }>(`select count(*)::int as total from ${from}${whereSql}`, params.values);
    total = firstRow(counted.rows).total;
  }

  const offset = top?.offset ?? 0;
  if (request.method === 'HEAD') {
    return { status: 200, body: '', contentRange: total === null ? undefined : `*/${total}` };
  }

  const sql = `select coalesce(json_agg(_t), '[]'::json)::text as body from (select ${projection.columns.join(', ')} from ${from}${whereSql}${orderSql(top?.order ?? null, '_s0', table)}${limitSql(top)}) as _t`;
  const result = await tx.query<{ body: string }>(sql, params.values);
  const body = firstRow(result.rows).body;
  const length = (JSON.parse(body) as unknown[]).length;
  const shaped = shapeRows(request, body, 200);

  return {
    ...shaped,
    contentRange: total === null ? undefined : length ? `${offset}-${offset + length - 1}/${total}` : `*/${total}`,
  };
}

// Writes return the changed rows only when asked to, as PostgREST does. Reading them
// back also requires the select policy to allow them.
async function finishWrite(
  tx: Transaction,
  request: ParsedRequest,
  schema: SchemaInfo,
  table: TableInfo,
  writeSql: string,
  params: Params,
  successStatus: number,
): Promise<QueryResult> {
  if (!prefers(request, 'return=representation')) {
    const result = await tx.query(writeSql, params.values);
    const affected = result.affectedRows ?? 0;
    return { status: successStatus === 201 ? 201 : 204, body: '', contentRange: wantsCount(request) ? `*/${affected}` : undefined };
  }

  const context: BuildContext = { schema, params, modifiers: readModifiers(new URLSearchParams()), aliasCounter: { value: 0 } };
  const projection = projectionSql(parseSelect(request.url.searchParams.get('select')), table, '_s0', '', context);
  const sql = `with _w as (${writeSql} returning _s0.*)
    select coalesce(json_agg(_t), '[]'::json)::text as body
    from (select ${projection.columns.join(', ')} from _w as _s0) as _t`;
  const result = await tx.query<{ body: string }>(sql, params.values);
  const body = firstRow(result.rows).body;
  const shaped = shapeRows(request, body, successStatus === 201 ? 201 : 200);
  return { ...shaped, contentRange: wantsCount(request) ? `*/${(JSON.parse(body) as unknown[]).length}` : undefined };
}

function writeColumns(request: ParsedRequest, table: TableInfo, rows: Record<string, unknown>[]) {
  const listed = request.url.searchParams.get('columns');
  const columns = listed
    ? listed.split(',').map((column) => unquote(column.trim()))
    : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  for (const column of columns) {
    if (!table.columns.has(column)) {
      throw new QueryError(400, 'PGRST204', `Could not find the '${column}' column of '${table.name}'.`);
    }
  }
  return columns;
}

async function insertRows(tx: Transaction, request: ParsedRequest, schema: SchemaInfo, table: TableInfo) {
  const rows = (Array.isArray(request.body) ? request.body : [request.body]) as Record<string, unknown>[];
  if (rows.length === 0) return { status: 201, body: '[]' };

  const columns = writeColumns(request, table, rows);
  const params = new Params();
  const columnList = columns.map(quoteIdent).join(', ');
  const tableSql = `public.${quoteIdent(table.name)}`;
  let sql = columns.length
    ? `insert into ${tableSql} as _s0 (${columnList}) select ${columnList} from json_populate_recordset(null::${tableSql}, ${params.add(JSON.stringify(rows))}::json)`
    : `insert into ${tableSql} as _s0 default values`;

  const prefer = request.headers.get('prefer') ?? '';
  const merge = prefer.includes('resolution=merge-duplicates');
  const ignore = prefer.includes('resolution=ignore-duplicates');
  if (merge || ignore) {
    const conflict = request.url.searchParams.get('on_conflict')?.split(',').map((column) => column.trim()) ?? table.primaryKey;
    const updates = columns.filter((column) => !conflict.includes(column));
    sql +=
      ignore || updates.length === 0
        ? ` on conflict (${conflict.map(quoteIdent).join(', ')}) do nothing`
        : ` on conflict (${conflict.map(quoteIdent).join(', ')}) do update set ${updates
            .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
            .join(', ')}`;
  }

  return finishWrite(tx, request, schema, table, sql, params, 201);
}

function filterSql(request: ParsedRequest, table: TableInfo, params: Params) {
  const conditions = (readModifiers(request.url.searchParams).get('')?.conditions ?? []).map((condition) =>
    conditionSql(condition, '_s0', table, params),
  );
  return conditions.length ? ` where ${conditions.join(' and ')}` : '';
}

async function updateRows(tx: Transaction, request: ParsedRequest, schema: SchemaInfo, table: TableInfo) {
  const values = (request.body ?? {}) as Record<string, unknown>;
  const columns = writeColumns(request, table, [values]);
  const params = new Params();
  const tableSql = `public.${quoteIdent(table.name)}`;

  // Nothing to change. PostgREST answers this with no rows too.
  if (columns.length === 0) {
    return prefers(request, 'return=representation') ? shapeRows(request, '[]', 200) : { status: 204, body: '' };
  }

  const record = params.add(JSON.stringify(values));
  const sql = `update ${tableSql} as _s0 set ${columns
    .map((column) => `${quoteIdent(column)} = _v.${quoteIdent(column)}`)
    .join(', ')} from json_populate_record(null::${tableSql}, ${record}::json) as _v${filterSql(request, table, params)}`;
  return finishWrite(tx, request, schema, table, sql, params, 200);
}

async function deleteRows(tx: Transaction, request: ParsedRequest, schema: SchemaInfo, table: TableInfo) {
  const params = new Params();
  const sql = `delete from public.${quoteIdent(table.name)} as _s0${filterSql(request, table, params)}`;
  return finishWrite(tx, request, schema, table, sql, params, 200);
}

// ---------------------------------------------------------------------------
// Function calls
// ---------------------------------------------------------------------------

function chooseFunction(schema: SchemaInfo, name: string, argNames: string[]) {
  const candidates = (schema.functions.get(name) ?? []).filter((fn) => {
    const known = new Set(fn.args.map((arg) => arg.name));
    return (
      argNames.every((arg) => known.has(arg)) &&
      fn.args.every((arg) => arg.hasDefault || argNames.includes(arg.name))
    );
  });
  const [chosen] = candidates;
  if (!chosen) {
    throw new QueryError(404, 'PGRST202', `Could not find the function public.${name}(${argNames.join(', ')}).`);
  }
  return chosen;
}

function argumentSql(type: string, value: unknown, params: Params) {
  if (value === null || value === undefined) return `null::${type}`;
  if (type === 'json' || type === 'jsonb') return `${params.add(JSON.stringify(value))}::${type}`;
  if (type.endsWith('[]')) {
    return `${params.add(Array.isArray(value) ? arrayLiteral(value) : String(value))}::${type}`;
  }
  return `${params.add(typeof value === 'object' ? JSON.stringify(value) : value)}::${type}`;
}

async function callFunction(tx: Transaction, request: ParsedRequest, schema: SchemaInfo, name: string): Promise<QueryResult> {
  const args: Record<string, unknown> =
    request.method === 'GET' || request.method === 'HEAD'
      ? Object.fromEntries(request.url.searchParams)
      : ((request.body ?? {}) as Record<string, unknown>);
  const fn: FunctionInfo = chooseFunction(schema, name, Object.keys(args));
  const params = new Params();
  const call = `public.${quoteIdent(fn.name)}(${Object.entries(args)
    .map(([argName, value]) => {
      const arg = fn.args.find((item) => item.name === argName)!;
      return `${quoteIdent(argName)} => ${argumentSql(arg.type, value, params)}`;
    })
    .join(', ')})`;

  if (fn.returnKind === 'void') {
    await tx.query(`select ${call}`, params.values);
    return { status: 204, body: '' };
  }

  if (fn.returnsSet) {
    const element = fn.returnKind === 'row' ? '_r' : '_r._value';
    const source = fn.returnKind === 'row' ? `${call} as _r` : `${call} as _r(_value)`;
    const result = await tx.query<{ body: string }>(
      `select coalesce(json_agg(${element}), '[]'::json)::text as body from ${source}`,
      params.values,
    );
    return shapeRows(request, firstRow(result.rows).body, 200);
  }

  const sql =
    fn.returnKind === 'row'
      ? `select row_to_json(_r)::text as body from ${call} as _r`
      : `select to_json(${call})::text as body`;
  const result = await tx.query<{ body: string | null }>(sql, params.values);
  return { status: 200, body: result.rows[0]?.body ?? 'null' };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function errorStatus(code: string, identity: Identity) {
  if (code === '42501') return identity.role === 'anon' ? 401 : 403;
  if (code === '23505' || code === '23503' || code === '23001') return 409;
  if (code === 'P0002') return 404;
  if (code.startsWith('22') || code.startsWith('23') || code === 'P0001' || code.startsWith('42')) return 400;
  return 500;
}

export async function handleDatabaseRequest(db: PGlite, identity: Identity, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^.*\/rest\/v1\//, '');
  const text = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();

  const parsed: ParsedRequest = {
    method: request.method,
    url,
    headers: request.headers,
    body: text ? JSON.parse(text) : null,
  };

  try {
    const schema = await getSchemaInfo(db);
    const result = await runAs(db, identity, async (tx) => {
      if (path.startsWith('rpc/')) return callFunction(tx, parsed, schema, decodeURIComponent(path.slice(4)));

      const table = getTable(schema, decodeURIComponent(path));
      switch (parsed.method) {
        case 'GET':
        case 'HEAD':
          return readRows(tx, parsed, schema, table);
        case 'POST':
          return insertRows(tx, parsed, schema, table);
        case 'PATCH':
          return updateRows(tx, parsed, schema, table);
        case 'DELETE':
          return deleteRows(tx, parsed, schema, table);
        default:
          throw new QueryError(405, 'PGRST117', `Unsupported method ${parsed.method}.`);
      }
    });

    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (result.contentRange) headers.set('Content-Range', result.contentRange);
    return new Response(result.status === 204 || parsed.method === 'HEAD' ? null : result.body, {
      status: result.status,
      headers,
    });
  } catch (error) {
    const known = error as { code?: string; message?: string; detail?: string; hint?: string };
    const isQueryError = error instanceof QueryError;
    const code = isQueryError ? error.code : (known.code ?? '');
    const status = isQueryError ? error.status : errorStatus(code, identity);

    if (status >= 500 || (isQueryError && code.startsWith('PGRST'))) {
      console.error('Database query failed', request.method, path, url.search, error);
    }

    return new Response(
      JSON.stringify({
        code,
        message: known.message ?? 'Database error',
        details: isQueryError ? error.details : (known.detail ?? null),
        hint: isQueryError ? error.hint : (known.hint ?? null),
      }),
      { status, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
