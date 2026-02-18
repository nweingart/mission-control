export type ServiceKey = 'claude' | 'github' | 'codex';

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
  codex: {
    name: 'OpenAI Codex CLI',
    installCommand: 'npm install -g @openai/codex',
    authCommand: 'codex login',
    description: 'AI coding agent from OpenAI',
  },
};

export const STEP_REQUIREMENTS: Record<string, ServiceKey[]> = {
  discovery: ['claude'],
  'prd-review': ['claude'],
  building: ['claude', 'github'],
  deploying: ['github'],
  'deploying-redeploy': ['github'],
};
