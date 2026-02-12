export function generateSupabaseGuide(
  schema: string,
  envVars: Record<string, string>
): string {
  return `# Supabase Database Guide

## CRITICAL: Schema Isolation

This app uses a DEDICATED schema: \`${schema}\`

DO NOT use the \`public\` schema. ALL tables, functions, and types MUST be created in the \`${schema}\` schema.

## Supabase Client Configuration

When creating the Supabase client, ALWAYS specify the schema:

\`\`\`typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { db: { schema: '${schema}' } }
)
\`\`\`

## Writing Migrations

ALL migration SQL must explicitly reference the schema:

\`\`\`sql
-- CORRECT:
CREATE TABLE ${schema}.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL
);

-- WRONG (writes to public):
CREATE TABLE users (...);
\`\`\`

Set the search path at the top of every migration file:
\`\`\`sql
SET search_path TO ${schema};
\`\`\`

## Pre-Commit Checklist
Before finishing any database-related task:
1. Verify ALL \`createClient\` calls include \`{ db: { schema: '${schema}' } }\`
2. Verify ALL migration files use \`${schema}.\` prefix or \`SET search_path TO ${schema}\`
3. Verify NO references to the \`public\` schema exist in your code
4. Verify \`.env.local\` contains \`SUPABASE_SCHEMA=${schema}\`

## Environment Variables
- \`NEXT_PUBLIC_SUPABASE_URL\` = \`${envVars.NEXT_PUBLIC_SUPABASE_URL}\`
- \`NEXT_PUBLIC_SUPABASE_ANON_KEY\` = \`${envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY}\`
- \`SUPABASE_SERVICE_ROLE_KEY\` = \`${envVars.SUPABASE_SERVICE_ROLE_KEY}\`
- \`SUPABASE_SCHEMA\` = \`${schema}\`
`;
}
