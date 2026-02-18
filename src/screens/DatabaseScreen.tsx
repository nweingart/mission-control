import { useState, useEffect } from 'react';
import { useProjectStore } from '../store/ProjectStoreContext';
import HoustonCallout from '../components/HoustonCallout';

interface DataField {
  name: string;
  type: string;
  note?: string;
}

interface DataModel {
  name: string;
  source: 'prd' | 'prisma' | 'typescript';
  fields: DataField[];
}

type SourceFilter = 'all' | 'prd' | 'prisma' | 'typescript';

function parsePRDModels(prd: string): DataModel[] {
  const models: DataModel[] = [];

  // Find "Data Model" section (between heading and next heading)
  const dataModelMatch = prd.match(/#+\s*Data\s*Model[s]?\s*\n([\s\S]*?)(?=\n#+\s|\n---|\$)/i);
  if (!dataModelMatch) return models;

  const section = dataModelMatch[1];

  // Look for model blocks: **ModelName** or ### ModelName followed by field lines
  const modelBlocks = section.split(/(?=\*\*[A-Z]\w+\*\*|###\s+[A-Z]\w+)/);

  for (const block of modelBlocks) {
    const nameMatch = block.match(/(?:\*\*([A-Z]\w+)\*\*|###\s+([A-Z]\w+))/);
    if (!nameMatch) continue;

    const name = nameMatch[1] || nameMatch[2];
    const fields: DataField[] = [];

    // Parse field patterns: - fieldName (type) or - fieldName: type or | fieldName | type |
    const fieldPatterns = [
      /[-*]\s+`?(\w+)`?\s*[:(]\s*`?([^`)]+)`?\)?/g,
      /\|\s*`?(\w+)`?\s*\|\s*`?([^|]+)`?\s*\|/g,
    ];

    for (const pattern of fieldPatterns) {
      let match;
      while ((match = pattern.exec(block)) !== null) {
        const fieldName = match[1].trim();
        const fieldType = match[2].trim();
        if (fieldName && fieldType && fieldName !== 'Field' && fieldName !== 'Name') {
          fields.push({ name: fieldName, type: fieldType });
        }
      }
    }

    if (fields.length > 0) {
      models.push({ name, source: 'prd', fields });
    }
  }

  return models;
}

function parsePrismaModels(content: string): DataModel[] {
  const models: DataModel[] = [];
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;

  let match;
  while ((match = modelRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const fields: DataField[] = [];

    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;

      const fieldMatch = trimmed.match(/^(\w+)\s+([\w[\]?@]+(?:\([^)]*\))?)/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        let fieldType = fieldMatch[2];

        // Extract relation note
        let note: string | undefined;
        const relationMatch = trimmed.match(/@relation\(([^)]+)\)/);
        if (relationMatch) {
          note = `relation: ${relationMatch[1]}`;
        }
        const defaultMatch = trimmed.match(/@default\(([^)]+)\)/);
        if (defaultMatch) {
          note = (note ? note + ', ' : '') + `default: ${defaultMatch[1]}`;
        }

        // Clean up type (remove decorators)
        fieldType = fieldType.replace(/@\w+(\([^)]*\))?/g, '').trim();

        fields.push({ name: fieldName, type: fieldType, note });
      }
    }

    if (fields.length > 0) {
      models.push({ name, source: 'prisma', fields });
    }
  }

  return models;
}

function parseTypeScriptModels(content: string): DataModel[] {
  const models: DataModel[] = [];
  const interfaceRegex = /(?:export\s+)?interface\s+(\w+)\s*\{([^}]+)\}/g;

  let match;
  while ((match = interfaceRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const fields: DataField[] = [];

    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;

      const fieldMatch = trimmed.match(/^(\w+)(\??)\s*:\s*(.+?)\s*;?\s*$/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const optional = fieldMatch[2];
        const fieldType = fieldMatch[3].replace(/;$/, '').trim();
        fields.push({
          name: fieldName,
          type: fieldType,
          note: optional ? 'optional' : undefined,
        });
      }
    }

    if (fields.length > 0) {
      models.push({ name, source: 'typescript', fields });
    }
  }

  return models;
}

const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: 'All',
  prd: 'PRD',
  prisma: 'Prisma',
  typescript: 'TypeScript',
};

const SOURCE_COLORS: Record<DataModel['source'], string> = {
  prd: 'bg-houston-amber/15 text-houston-amber',
  prisma: 'bg-houston-blue/15 text-houston-blue',
  typescript: 'bg-houston-green/15 text-houston-green',
};

export default function DatabaseScreen() {
  const { currentProject } = useProjectStore();
  const [models, setModels] = useState<DataModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  useEffect(() => {
    if (!currentProject) return;

    const loadModels = async () => {
      setLoading(true);
      const allModels: DataModel[] = [];

      // 1. Parse PRD
      try {
        const prd = await window.api.storage.getPRD(currentProject.slug);
        if (prd) {
          allModels.push(...parsePRDModels(prd));
        }
      } catch {
        // PRD not available
      }

      // 2. Parse Prisma schema
      const projectPath = currentProject.projectPath;
      try {
        const prisma = await window.api.fs.readFile(`${projectPath}/prisma/schema.prisma`);
        if (prisma) {
          allModels.push(...parsePrismaModels(prisma));
        }
      } catch {
        // No Prisma schema
      }

      // 3. Parse TypeScript types
      const typePaths = [
        `${projectPath}/src/types/index.ts`,
        `${projectPath}/src/types.ts`,
        `${projectPath}/src/types/index.tsx`,
      ];
      for (const typePath of typePaths) {
        try {
          const content = await window.api.fs.readFile(typePath);
          if (content) {
            allModels.push(...parseTypeScriptModels(content));
            break;
          }
        } catch {
          // File doesn't exist, try next
        }
      }

      setModels(allModels);
      setLoading(false);
    };

    loadModels();
  }, [currentProject?.slug, currentProject?.projectPath]);

  const filteredModels = sourceFilter === 'all'
    ? models
    : models.filter(m => m.source === sourceFilter);

  const availableSources = new Set(models.map(m => m.source));

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-ink-muted">Scanning for data models...</p>
        </div>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <HoustonCallout message="No data models found. Add a Prisma schema, TypeScript interfaces, or describe your data model in the PRD to see them here." />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex-shrink-0">
        <h2 className="text-lg font-sans font-bold text-ink">Data Models</h2>
        <p className="text-sm text-ink-muted mt-1">
          {models.length} model{models.length !== 1 ? 's' : ''} found across your project
        </p>

        {/* Source filter tabs */}
        <div className="flex gap-2 mt-3">
          {(['all', 'prd', 'prisma', 'typescript'] as SourceFilter[]).map(filter => {
            const count = filter === 'all' ? models.length : models.filter(m => m.source === filter).length;
            if (filter !== 'all' && !availableSources.has(filter as DataModel['source'])) return null;
            return (
              <button
                key={filter}
                onClick={() => setSourceFilter(filter)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  sourceFilter === filter
                    ? 'bg-accent text-white'
                    : 'bg-surface-hover text-ink-muted hover:text-ink'
                }`}
              >
                {SOURCE_LABELS[filter]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Model cards */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {filteredModels.map((model, idx) => {
          const key = `${model.source}-${model.name}-${idx}`;
          const isExpanded = expandedModel === key;

          return (
            <div key={key} className="card-panel overflow-hidden">
              <button
                onClick={() => setExpandedModel(isExpanded ? null : key)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  <svg className={`w-4 h-4 text-ink-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-mono font-semibold text-ink">{model.name}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${SOURCE_COLORS[model.source]}`}>
                    {model.source.toUpperCase()}
                  </span>
                </div>
                <span className="text-xs text-ink-muted">
                  {model.fields.length} field{model.fields.length !== 1 ? 's' : ''}
                </span>
              </button>

              {isExpanded && (
                <div className="border-t border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-surface-hover/50">
                        <th className="text-left px-4 py-2 text-xs font-medium text-ink-muted uppercase tracking-wider">Field</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-ink-muted uppercase tracking-wider">Type</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-ink-muted uppercase tracking-wider">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.fields.map((field, fi) => (
                        <tr key={fi} className="border-t border-border/50">
                          <td className="px-4 py-2 font-mono text-ink">{field.name}</td>
                          <td className="px-4 py-2 font-mono text-accent">{field.type}</td>
                          <td className="px-4 py-2 text-ink-muted">{field.note || '—'}</td>
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
  );
}
