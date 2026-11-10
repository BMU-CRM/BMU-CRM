// What the query engine needs to know about the public schema: each table's columns,
// how tables link to each other, and the functions the app may call. Read from
// Postgres itself, so a migration is the only place anything is declared.
import type { SqlDatabase } from '@/server/database/sqlDatabase';

export type TableInfo = {
  name: string;
  columns: Map<string, string>;
  primaryKey: string[];
};

export type ForeignKey = {
  name: string;
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
};

export type FunctionArgument = {
  name: string;
  type: string;
  hasDefault: boolean;
};

export type FunctionInfo = {
  name: string;
  args: FunctionArgument[];
  returnsSet: boolean;
  returnKind: 'row' | 'scalar' | 'void';
};

export type SchemaInfo = {
  tables: Map<string, TableInfo>;
  foreignKeys: ForeignKey[];
  functions: Map<string, FunctionInfo[]>;
};

const cache = new WeakMap<SqlDatabase, Promise<SchemaInfo>>();

export function getSchemaInfo(db: SqlDatabase) {
  let info = cache.get(db);
  if (!info) {
    info = loadSchemaInfo(db);
    cache.set(db, info);
  }
  return info;
}

// Column names are read as text, not Postgres's own name type: the driver for a hosted
// database returns lists of that type as a single string instead of a list.
async function loadSchemaInfo(db: SqlDatabase): Promise<SchemaInfo> {
  const [columns, primaryKeys, foreignKeys, functions] = await Promise.all([
    db.query<{ table_name: string; column_name: string; type: string }>(`
      select c.relname as table_name, a.attname as column_name, a.atttypid::regtype::text as type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
      order by c.relname, a.attnum`),
    db.query<{ table_name: string; columns: string[] }>(`
      select cl.relname as table_name,
        array(select a.attname::text from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum order by k.ord) as columns
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      where con.contype = 'p' and n.nspname = 'public'`),
    db.query<{ name: string; table_name: string; ref_table: string; columns: string[]; ref_columns: string[] }>(`
      select con.conname as name, cl.relname as table_name, rcl.relname as ref_table,
        array(select a.attname::text from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum order by k.ord) as columns,
        array(select a.attname::text from unnest(con.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum order by k.ord) as ref_columns
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_class rcl on rcl.oid = con.confrelid
      join pg_namespace rn on rn.oid = rcl.relnamespace
      where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'`),
    db.query<{
      name: string;
      returns_set: boolean;
      return_type: string;
      return_typtype: string;
      arg_names: string[] | null;
      arg_modes: string[] | null;
      arg_types: string[];
      default_count: number;
    }>(`
      select p.proname as name, p.proretset as returns_set, p.prorettype::regtype::text as return_type,
        t.typtype::text as return_typtype, p.proargnames as arg_names, p.proargmodes::text[] as arg_modes,
        array(select x::regtype::text from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) x) as arg_types,
        p.pronargdefaults::int as default_count
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_type t on t.oid = p.prorettype
      where n.nspname = 'public' and p.prokind = 'f'`),
  ]);

  const tables = new Map<string, TableInfo>();
  for (const row of columns.rows) {
    let table = tables.get(row.table_name);
    if (!table) {
      table = { name: row.table_name, columns: new Map(), primaryKey: [] };
      tables.set(row.table_name, table);
    }
    table.columns.set(row.column_name, row.type);
  }
  for (const row of primaryKeys.rows) {
    const table = tables.get(row.table_name);
    if (table) table.primaryKey = row.columns;
  }

  const functionMap = new Map<string, FunctionInfo[]>();
  for (const row of functions.rows) {
    const types = row.arg_types;
    const modes = row.arg_modes ?? types.map(() => 'i');
    const names = row.arg_names ?? [];
    const inputs = types
      .map((type, index) => ({ type, mode: modes[index], name: names[index] ?? '' }))
      .filter((arg) => arg.mode === 'i' || arg.mode === 'b' || arg.mode === 'v');
    const firstDefault = inputs.length - row.default_count;

    const info: FunctionInfo = {
      name: row.name,
      args: inputs.map((arg, index) => ({ name: arg.name, type: arg.type, hasDefault: index >= firstDefault })),
      returnsSet: row.returns_set,
      returnKind:
        row.return_type === 'void'
          ? 'void'
          : row.return_typtype === 'c' || row.return_type === 'record'
            ? 'row'
            : 'scalar',
    };
    functionMap.set(row.name, [...(functionMap.get(row.name) ?? []), info]);
  }

  return {
    tables,
    foreignKeys: foreignKeys.rows.map((row) => ({
      name: row.name,
      table: row.table_name,
      columns: row.columns,
      refTable: row.ref_table,
      refColumns: row.ref_columns,
    })),
    functions: functionMap,
  };
}
