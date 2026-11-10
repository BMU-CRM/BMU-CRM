// Writes src/types/databaseTypes.ts from the migrations, so queries in the app are
// checked against the real tables, columns and functions.
// Usage: npm run db:types   (run it after adding or changing a migration)
// It builds a throwaway database in memory, so the app can keep running meanwhile.
import type { PGlite } from '@electric-sql/pglite';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { openDatabase } from '../src/server/database/localDatabase';

const outputFile = path.resolve('src/types/databaseTypes.ts');

type Column = {
  table_name: string;
  column_name: string;
  type_name: string;
  type_type: string;
  element_name: string | null;
  element_type: string | null;
  not_null: boolean;
  has_default: boolean;
  identity: string;
  generated: string;
  relkind: string;
};

const numberTypes = new Set(['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'oid', 'money']);
const stringTypes = new Set([
  'text', 'varchar', 'bpchar', 'name', 'uuid', 'date', 'time', 'timetz', 'timestamp', 'timestamptz',
  'interval', 'citext', 'inet', 'cidr', 'macaddr', 'bytea', 'tsvector', 'xml', 'char',
]);

const quote = (name: string) => JSON.stringify(name);

function enumReference(name: string) {
  return `Database["public"]["Enums"][${quote(name)}]`;
}

function rowReference(table: string) {
  return `Database["public"]["Tables"][${quote(table)}]["Row"]`;
}

// The TypeScript type for one Postgres type name.
function scalarType(typeName: string, typeType: string, enums: Set<string>, tables: Set<string>): string {
  if (typeName === 'bool') return 'boolean';
  if (numberTypes.has(typeName)) return 'number';
  if (stringTypes.has(typeName)) return 'string';
  if (typeName === 'json' || typeName === 'jsonb') return 'Json';
  if (typeName === 'void') return 'undefined';
  if (typeType === 'e' || enums.has(typeName)) return enumReference(typeName);
  if (tables.has(typeName)) return rowReference(typeName);
  return 'unknown';
}

function typeOf(
  typeName: string,
  typeType: string,
  elementName: string | null,
  elementType: string | null,
  enums: Set<string>,
  tables: Set<string>,
) {
  if (elementName) return `(${scalarType(elementName, elementType ?? 'b', enums, tables)})[]`;
  return scalarType(typeName, typeType, enums, tables);
}

function objectType(fields: [string, string][], indent: string) {
  if (fields.length === 0) return 'Record<PropertyKey, never>';
  return `{\n${fields.map(([name, type]) => `${indent}  ${quote(name)}: ${type}`).join('\n')}\n${indent}}`;
}

async function generate(db: PGlite) {
  const enumRows = (
    await db.query<{ name: string; labels: string[] }>(`
      select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
      from pg_type t join pg_namespace n on n.oid = t.typnamespace join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public' group by t.typname order by t.typname`)
  ).rows;
  const enums = new Set(enumRows.map((row) => row.name));

  const columns = (
    await db.query<Column>(`
      select c.relname as table_name, a.attname as column_name, t.typname as type_name, t.typtype::text as type_type,
        et.typname as element_name, et.typtype::text as element_type,
        a.attnotnull as not_null, a.atthasdef as has_default, a.attidentity::text as identity,
        a.attgenerated::text as generated, c.relkind::text as relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      join pg_type t on t.oid = a.atttypid
      left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      order by c.relname, a.attname`)
  ).rows;
  const tables = new Set(columns.filter((column) => column.relkind === 'r' || column.relkind === 'p').map((column) => column.table_name));

  const relationships = (
    await db.query<{ table_name: string; name: string; columns: string[]; ref_table: string; ref_columns: string[]; one_to_one: boolean }>(`
      select cl.relname as table_name, con.conname as name, rcl.relname as ref_table,
        array(select a.attname from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum order by k.ord) as columns,
        array(select a.attname from unnest(con.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum order by k.ord) as ref_columns,
        exists (
          select 1 from pg_index i
          where i.indrelid = con.conrelid and i.indisunique
            and (select array_agg(x order by x) from unnest(i.indkey::int2[]) x)
              = (select array_agg(x order by x) from unnest(con.conkey) x)
        ) as one_to_one
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
      join pg_class rcl on rcl.oid = con.confrelid join pg_namespace rn on rn.oid = rcl.relnamespace
      where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
      order by cl.relname, con.conname`)
  ).rows;

  const functions = (
    await db.query<{
      name: string;
      returns_set: boolean;
      return_name: string;
      return_type: string;
      return_element: string | null;
      return_element_type: string | null;
      arg_names: string[] | null;
      arg_modes: string[] | null;
      arg_type_names: string[];
      arg_type_types: string[];
      arg_element_names: (string | null)[];
      arg_element_types: (string | null)[];
      default_count: number;
    }>(`
      select p.proname as name, p.proretset as returns_set, rt.typname as return_name, rt.typtype::text as return_type,
        ret.typname as return_element, ret.typtype::text as return_element_type,
        p.proargnames as arg_names, p.proargmodes::text[] as arg_modes,
        array(select t.typname from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality x(oid, ord)
              join pg_type t on t.oid = x.oid order by x.ord) as arg_type_names,
        array(select t.typtype::text from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality x(oid, ord)
              join pg_type t on t.oid = x.oid order by x.ord) as arg_type_types,
        array(select et.typname from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality x(oid, ord)
              join pg_type t on t.oid = x.oid left join pg_type et on et.oid = t.typelem and t.typcategory = 'A' order by x.ord) as arg_element_names,
        array(select et.typtype::text from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality x(oid, ord)
              join pg_type t on t.oid = x.oid left join pg_type et on et.oid = t.typelem and t.typcategory = 'A' order by x.ord) as arg_element_types,
        p.pronargdefaults::int as default_count
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_type rt on rt.oid = p.prorettype
      left join pg_type ret on ret.oid = rt.typelem and rt.typcategory = 'A'
      where n.nspname = 'public' and p.prokind = 'f' and rt.typname not in ('trigger', 'event_trigger')
      order by p.proname`)
  ).rows;

  // Tables and views
  const byTable = new Map<string, Column[]>();
  for (const column of columns) byTable.set(column.table_name, [...(byTable.get(column.table_name) ?? []), column]);

  const tableBlock = (name: string, tableColumns: Column[], isView: boolean) => {
    const indent = '        ';
    const rowFields: [string, string][] = tableColumns.map((column) => {
      const base = typeOf(column.type_name, column.type_type, column.element_name, column.element_type, enums, tables);
      return [column.column_name, column.not_null && !isView ? base : `${base} | null`];
    });
    const writeFields = (forInsert: boolean): [string, string][] =>
      tableColumns.map((column) => {
        const base = typeOf(column.type_name, column.type_type, column.element_name, column.element_type, enums, tables);
        const nullable = column.not_null && !isView ? base : `${base} | null`;
        if (column.identity === 'a' || column.generated === 's') return [`${column.column_name}?`, 'never'];
        const optional = !forInsert || !column.not_null || column.has_default || column.identity === 'd' || isView;
        return [optional ? `${column.column_name}?` : column.column_name, nullable];
      });
    const fieldsText = (fields: [string, string][]) =>
      `{\n${fields.map(([field, type]) => `${indent}  ${field.endsWith('?') ? `${quote(field.slice(0, -1))}?` : quote(field)}: ${type}`).join('\n')}\n${indent}}`;
    const links = relationships
      .filter((relationship) => relationship.table_name === name)
      .map(
        (relationship) => `${indent}  {
${indent}    foreignKeyName: ${quote(relationship.name)}
${indent}    columns: [${relationship.columns.map(quote).join(', ')}]
${indent}    isOneToOne: ${relationship.one_to_one}
${indent}    referencedRelation: ${quote(relationship.ref_table)}
${indent}    referencedColumns: [${relationship.ref_columns.map(quote).join(', ')}]
${indent}  },`,
      );

    return `      ${quote(name)}: {
${indent}Row: ${fieldsText(rowFields)}
${indent}ComputedFields: never
${indent}Insert: ${fieldsText(writeFields(true))}
${indent}Update: ${fieldsText(writeFields(false))}
${indent}Relationships: [${links.length ? `\n${links.join('\n')}\n${indent}` : ''}]
      }`;
  };

  const tableEntries = [...byTable].filter(([, cols]) => cols[0]!.relkind === 'r' || cols[0]!.relkind === 'p');
  const viewEntries = [...byTable].filter(([, cols]) => cols[0]!.relkind === 'v' || cols[0]!.relkind === 'm');

  // Functions
  const functionVariants = new Map<string, string[]>();
  for (const fn of functions) {
    const modes = fn.arg_modes ?? fn.arg_type_names.map(() => 'i');
    const names = fn.arg_names ?? [];
    const all = fn.arg_type_names.map((typeName, index) => ({
      name: names[index] ?? '',
      mode: modes[index] ?? 'i',
      type: typeOf(typeName, fn.arg_type_types[index] ?? 'b', fn.arg_element_names[index] ?? null, fn.arg_element_types[index] ?? null, enums, tables),
    }));
    const inputs = all.filter((arg) => arg.mode === 'i' || arg.mode === 'b' || arg.mode === 'v');
    const outputs = all.filter((arg) => arg.mode === 'o' || arg.mode === 'b' || arg.mode === 't');
    if (inputs.some((arg) => !arg.name)) continue;

    const firstDefault = inputs.length - fn.default_count;
    const argsType = objectType(
      inputs.map((arg, index) => [arg.name + (index >= firstDefault ? '?' : ''), arg.type.startsWith('Database["public"]["Tables"]') ? `Omit<${arg.type}, Database["public"]["Tables"][${arg.type.match(/\["Tables"\]\[("[^"]+")\]/)?.[1]}]["ComputedFields"]>` : arg.type] as [string, string]),
      '          ',
    ).replace(/"([^"]+)\?":/g, '"$1"?:');

    let returns: string;
    if (outputs.length > 0) {
      returns = objectType(outputs.map((arg) => [arg.name, arg.type]), '          ');
      if (fn.returns_set) returns += '[]';
    } else {
      const base = typeOf(fn.return_name, fn.return_type, fn.return_element, fn.return_element_type, enums, tables);
      returns = fn.returns_set ? `${base}[]` : base;
    }

    const variant = `{ Args: ${argsType}; Returns: ${returns} }`;
    functionVariants.set(fn.name, [...(functionVariants.get(fn.name) ?? []), variant]);
  }

  const functionsText = [...functionVariants]
    .map(([name, variants]) => `      ${quote(name)}:\n        | ${variants.join('\n        | ')}`)
    .join('\n');

  const enumText = enumRows.map((row) => `      ${quote(row.name)}: ${row.labels.map(quote).join(' | ')}`).join('\n');
  const constantsText = enumRows.map((row) => `      ${quote(row.name)}: [${row.labels.map(quote).join(', ')}],`).join('\n');
  const none = '{\n      [_ in never]: never\n    }';

  return `// Generated by scripts/generateDatabaseTypes.ts from database/migrations.
// Do not edit by hand. Run npm run db:types after changing a migration.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
${tableEntries.map(([name, cols]) => tableBlock(name, cols, false)).join('\n')}
    }
    Views: ${viewEntries.length ? `{\n${viewEntries.map(([name, cols]) => tableBlock(name, cols, true)).join('\n')}\n    }` : none}
    Functions: {
${functionsText}
    }
    Enums: ${enumRows.length ? `{\n${enumText}\n    }` : none}
    CompositeTypes: ${none}
  }
}

${helperTypes}

export const Constants = {
  public: {
    Enums: {
${constantsText}
    },
  },
} as const
`;
}

// The generic helpers PostgREST type generators add, kept for any code that uses them.
const helperTypes = `type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends { Row: infer R }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends { Row: infer R }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Insert: infer I }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Update: infer U }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never`;

async function main() {
  const db = await openDatabase({ dataDir: 'memory://', migrationsDir: path.resolve('database/migrations') });
  try {
    writeFileSync(outputFile, await generate(db));
  } finally {
    await db.close();
  }
  console.log(`Wrote ${path.relative(process.cwd(), outputFile)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
