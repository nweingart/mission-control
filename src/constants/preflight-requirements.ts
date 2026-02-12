export type ServiceKey = 'claude' | 'github' | 'vercel' | 'supabase';

export interface ServiceInfo {
  name: string;
  installCommand: string;
  authCommand: string;
  description: string;
}

export const SERVICE_REGISTRY: Record<ServiceKey, ServiceInfo> = {
  claude: {
    name: 'Claude Code',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    authCommand: 'claude',
    description: 'AI coding assistant that builds your project',
  },
  github: {
    name: 'GitHub CLI',
    installCommand: 'brew install gh',
    authCommand: 'gh auth login',
    description: 'Push code and enable auto-deployments',
  },
  vercel: {
    name: 'Vercel',
    installCommand: 'npm install -g vercel',
    authCommand: 'vercel login',
    description: 'Connect to deploy automatically from GitHub',
  },
  supabase: {
    name: 'Supabase CLI',
    installCommand: 'brew install supabase/tap/supabase',
    authCommand: 'supabase login',
    description: 'Manage your database and backend services',
  },
};

export const STEP_REQUIREMENTS: Record<string, ServiceKey[]> = {
  discovery: ['claude'],
  'prd-review': ['claude', 'supabase'],
  building: ['claude', 'github'],
  deploying: ['github', 'vercel'],
  'deploying-redeploy': ['github'],
};
