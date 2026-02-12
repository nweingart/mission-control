import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

interface ColumnInfo {
  name: string;
  type: string;
  format: string;
  description?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
}

interface TableInfo {
  name: string;
  schema: string;
  columns: ColumnInfo[];
  description?: string;
}

/**
 * Convert information_schema.columns rows into TableInfo[].
 * Rows come from the Management API SQL query.
 */
function parseSchemaRows(rows: any[], schema: string): TableInfo[] {
  const tableMap = new Map<string, TableInfo>();

  for (const row of rows) {
    const tableName = row.table_name;
    if (!tableMap.has(tableName)) {
      tableMap.set(tableName, {
        name: tableName,
        schema: row.table_schema || schema,
        columns: [],
      });
    }

    const table = tableMap.get(tableName)!;
    table.columns.push({
      name: row.column_name,
      type: row.data_type || 'unknown',
      format: row.udt_name || '',
      isPrimaryKey: row.is_primary_key === true,
      isForeignKey: row.is_foreign_key === true,
      isNullable: row.is_nullable === 'YES',
    });
  }

  return Array.from(tableMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function ConstraintBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`text-[13px] font-display font-bold px-1.5 py-0.5 border rounded ${color}`}>
      {label}
    </span>
  );
}

export default function DatabaseScreen() {
  const { currentProject, projects } = useAppStore();

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  const targetSchema = currentProject?.supabaseSchema || 'public';

  useEffect(() => {
    if (!currentProject?.supabaseRef) return;

    const fetchSchema = async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await window.api.supabase.getSchemaTableInfo(
          currentProject.supabaseRef!,
          targetSchema
        );
        const parsed = parseSchemaRows(rows, targetSchema);
        setTables(parsed);
      } catch (err: any) {
        console.error('[DatabaseScreen] Failed to fetch schema:', err);
        setError(err?.message || 'Failed to load database schema');
      } finally {
        setLoading(false);
      }
    };

    fetchSchema();
  }, [currentProject?.supabaseRef, targetSchema]);

  // Find other projects sharing the same supabaseRef
  const sharedProjects = currentProject?.supabaseRef
    ? projects.filter(
        (p) => p.supabaseRef === currentProject.supabaseRef && p.slug !== currentProject.slug
      )
    : [];

  // Group tables by schema
  const tablesBySchema = tables.reduce<Record<string, TableInfo[]>>((acc, table) => {
    if (!acc[table.schema]) acc[table.schema] = [];
    acc[table.schema].push(table);
    return acc;
  }, {});
  const schemaNames = Object.keys(tablesBySchema).sort();

  // No database connected
  if (!currentProject?.supabaseRef) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
        <svg className="w-16 h-16 text-ink-muted/20 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
        <h2 className="text-base font-sans font-semibold text-ink mb-2">No Database Connected</h2>
        <p className="text-sm text-ink-muted max-w-sm">
          This project doesn't have a Supabase database linked yet. A database will be provisioned when you approve the PRD.
        </p>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent animate-spin mb-4"></div>
        <p className="text-sm text-ink-muted">Loading database schema...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 bg-error/15 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-base font-sans font-semibold text-ink mb-2">Failed to Load Schema</h2>
        <p className="text-sm text-ink-muted max-w-sm mb-4">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            window.api.supabase
              .getSchemaTableInfo(currentProject.supabaseRef!, targetSchema)
              .then((rows) => setTables(parseSchemaRows(rows, targetSchema)))
              .catch((err: any) => setError(err?.message || 'Failed to load database schema'))
              .finally(() => setLoading(false));
          }}
          className="btn-solid-primary px-4 py-2 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-bold text-ink">Database</h2>
          <span className="text-xs text-ink-muted font-mono">{currentProject.supabaseRef}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-muted">
          <span>{tables.length} {tables.length === 1 ? 'table' : 'tables'}</span>
          {currentProject.supabaseSchema && (
            <>
              <span className="text-border">|</span>
              <span>Schema: <code className="font-mono text-spectrum-green">{currentProject.supabaseSchema}</code></span>
            </>
          )}
        </div>
      </div>

      {/* Shared projects notice */}
      {sharedProjects.length > 0 && (
        <div className="bg-spectrum-blue/10 border border-spectrum-blue/20 p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-spectrum-blue flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-ink mb-1">Shared Database</h3>
            <p className="text-xs text-ink-secondary">
              This Supabase project is shared with:{' '}
              {sharedProjects.map((p, i) => (
                <span key={p.slug}>
                  {i > 0 && ', '}
                  <strong className="font-medium text-ink">{p.name}</strong>
                  {p.supabaseSchema && (
                    <span className="text-ink-muted"> ({p.supabaseSchema})</span>
                  )}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      {/* Empty tables state */}
      {tables.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg className="w-12 h-12 text-ink-muted/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
          <h3 className="text-base font-sans font-semibold text-ink mb-1">No Tables Yet</h3>
          <p className="text-sm text-ink-muted max-w-sm">
            Your database is connected but has no tables. Tables will be created during the build phase.
          </p>
        </div>
      )}

      {/* Table cards grouped by schema */}
      {schemaNames.map((schemaName) => (
        <div key={schemaName}>
          {schemaNames.length > 1 && (
            <div className="flex items-center gap-2 mb-3">
              <h3 className={`text-sm font-semibold ${
                schemaName === currentProject.supabaseSchema
                  ? 'text-spectrum-green'
                  : 'text-ink-muted'
              }`}>
                {schemaName}
              </h3>
              {schemaName === currentProject.supabaseSchema && (
                <span className="text-[13px] font-display font-bold px-1.5 py-0.5 bg-spectrum-green/15 text-spectrum-green border border-spectrum-green/30 rounded">
                  YOUR SCHEMA
                </span>
              )}
              <span className="text-xs text-ink-muted">({tablesBySchema[schemaName].length})</span>
            </div>
          )}

          <div className="space-y-3">
            {tablesBySchema[schemaName].map((table) => {
              const isExpanded = expandedTable === `${table.schema}.${table.name}`;
              const tableKey = `${table.schema}.${table.name}`;
              const pkCount = table.columns.filter((c) => c.isPrimaryKey).length;
              const fkCount = table.columns.filter((c) => c.isForeignKey).length;

              return (
                <div key={tableKey} className="card-panel overflow-hidden">
                  <button
                    onClick={() => setExpandedTable(isExpanded ? null : tableKey)}
                    className="w-full text-left px-5 py-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <svg className="w-4 h-4 text-spectrum-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                        </svg>
                        <span className="text-sm font-semibold text-ink font-mono">{table.name}</span>
                        <span className="text-xs text-ink-muted">{table.columns.length} columns</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {pkCount > 0 && (
                          <ConstraintBadge label={`${pkCount} PK`} color="bg-spectrum-yellow/15 text-spectrum-yellow border-spectrum-yellow/30" />
                        )}
                        {fkCount > 0 && (
                          <ConstraintBadge label={`${fkCount} FK`} color="bg-spectrum-blue/15 text-spectrum-blue border-spectrum-blue/30" />
                        )}
                        <svg
                          className={`w-4 h-4 text-ink-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-surface-light">
                            <th className="text-left text-xs font-semibold text-ink-muted uppercase tracking-wider px-5 py-2">Column</th>
                            <th className="text-left text-xs font-semibold text-ink-muted uppercase tracking-wider px-5 py-2">Type</th>
                            <th className="text-left text-xs font-semibold text-ink-muted uppercase tracking-wider px-5 py-2">Constraints</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {table.columns.map((col) => (
                            <tr key={col.name} className="hover:bg-surface-light/50">
                              <td className="px-5 py-2 font-mono text-ink">{col.name}</td>
                              <td className="px-5 py-2 text-ink-secondary font-mono text-xs">
                                {col.format || col.type}
                              </td>
                              <td className="px-5 py-2">
                                <div className="flex items-center gap-1.5">
                                  {col.isPrimaryKey && (
                                    <ConstraintBadge label="PK" color="bg-spectrum-yellow/15 text-spectrum-yellow border-spectrum-yellow/30" />
                                  )}
                                  {col.isForeignKey && (
                                    <ConstraintBadge label="FK" color="bg-spectrum-blue/15 text-spectrum-blue border-spectrum-blue/30" />
                                  )}
                                  {!col.isNullable && (
                                    <ConstraintBadge label="NOT NULL" color="bg-spectrum-red/10 text-spectrum-red border-spectrum-red/20" />
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
