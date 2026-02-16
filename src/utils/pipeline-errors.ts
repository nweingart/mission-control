export type ErrorSeverity = 'auto_recoverable' | 'needs_user_action' | 'catastrophic';

export interface ClassifiedError {
  category: string;
  severity: ErrorSeverity;
  title: string;
  message: string;
  userAction?: string;
  command?: string;
  canSkipTask: boolean;
  canRetry: boolean;
}

export function classifyError(rawMessage: string): ClassifiedError {
  const msg = rawMessage.toLowerCase();

  // ── Auto-recoverable ──────────────────────────────────────────

  if ((msg.includes('already exists') && (msg.includes('branch') || msg.includes('rename')))) {
    return {
      category: 'branch_conflict',
      severity: 'auto_recoverable',
      title: 'Branch Conflict',
      message: rawMessage,
      canSkipTask: false,
      canRetry: true,
    };
  }

  if (msg.includes('.lock') || msg.includes('lock file')) {
    return {
      category: 'git_lock',
      severity: 'auto_recoverable',
      title: 'Git Lock',
      message: rawMessage,
      canSkipTask: false,
      canRetry: true,
    };
  }

  if (msg.includes('uncommitted changes') || msg.includes('would be overwritten')) {
    return {
      category: 'dirty_working_tree',
      severity: 'auto_recoverable',
      title: 'Uncommitted Changes',
      message: rawMessage,
      canSkipTask: false,
      canRetry: true,
    };
  }

  if ((msg.includes('network error') || msg.includes('could not resolve')) && (msg.includes('push') || msg.includes('fetch') || msg.includes('host'))) {
    return {
      category: 'network',
      severity: 'auto_recoverable',
      title: 'Network Error',
      message: rawMessage,
      canSkipTask: false,
      canRetry: true,
    };
  }

  // ── Needs user action ─────────────────────────────────────────

  if (msg.includes('ssh key') || msg.includes('publickey') || (msg.includes('permission denied') && (msg.includes('ssh') || msg.includes('push')))) {
    return {
      category: 'ssh_auth',
      severity: 'needs_user_action',
      title: 'SSH Authentication Failed',
      message: rawMessage,
      userAction: 'Run the following command in your terminal to authenticate:',
      command: 'gh auth login',
      canSkipTask: false,
      canRetry: true,
    };
  }

  if (msg.includes('not authenticated') || msg.includes('auth login') || msg.includes('not logged')) {
    return {
      category: 'gh_auth',
      severity: 'needs_user_action',
      title: 'GitHub CLI Not Authenticated',
      message: rawMessage,
      userAction: 'Run the following command in your terminal to authenticate:',
      command: 'gh auth login',
      canSkipTask: false,
      canRetry: true,
    };
  }

  if (msg.includes('merge conflict') || msg.includes('conflict')) {
    return {
      category: 'merge_conflict',
      severity: 'needs_user_action',
      title: 'Merge Conflict',
      message: rawMessage,
      userAction: 'Code changes conflict with the main branch. You can skip this task and continue with the rest.',
      canSkipTask: true,
      canRetry: false,
    };
  }

  if (msg.includes('no output for') || msg.includes('timed out')) {
    return {
      category: 'claude_timeout',
      severity: 'auto_recoverable',
      title: 'Claude Timed Out',
      message: rawMessage,
      userAction: 'Auto-retrying...',
      canSkipTask: true,
      canRetry: true,
    };
  }

  // ── Catastrophic ──────────────────────────────────────────────

  if (msg.includes('not a git repository')) {
    return {
      category: 'repo_missing',
      severity: 'catastrophic',
      title: 'Repository Missing',
      message: rawMessage,
      canSkipTask: false,
      canRetry: false,
    };
  }

  if (msg.includes('exited with code')) {
    return {
      category: 'claude_crash',
      severity: 'catastrophic',
      title: 'Claude Process Crashed',
      message: rawMessage,
      canSkipTask: true,
      canRetry: true,
    };
  }

  // ── Fallback ──────────────────────────────────────────────────

  return {
    category: 'unknown',
    severity: 'catastrophic',
    title: 'Pipeline Error',
    message: rawMessage,
    canSkipTask: true,
    canRetry: true,
  };
}
