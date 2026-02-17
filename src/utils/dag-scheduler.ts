import type { Task, TierPlan, TierGroup } from '../types';

// Infrastructure files are excluded from DAG overlap analysis.
// Conflicts in these files are handled at tier boundaries via reconciliation.
const INFRASTRUCTURE_FILES = new Set([
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'next.config.js',
  'next.config.ts',
  'next.config.mjs',
  'vite.config.ts',
  'vite.config.js',
  'tailwind.config.js',
  'tailwind.config.ts',
  'postcss.config.js',
  'postcss.config.mjs',
  '.eslintrc.js',
  '.eslintrc.json',
  'eslint.config.js',
  '.prettierrc',
  '.gitignore',
  '.env',
  '.env.local',
]);

function isInfrastructureFile(filePath: string): boolean {
  const basename = filePath.split('/').pop() || '';
  return INFRASTRUCTURE_FILES.has(basename);
}

function getTaskFiles(task: Task): string[] {
  const files = [...(task.creates || []), ...(task.modifies || [])];
  return files.filter(f => !isInfrastructureFile(f));
}

function getTaskCreates(task: Task): string[] {
  return (task.creates || []).filter(f => !isInfrastructureFile(f));
}

/**
 * Check if two tasks have overlapping files (excluding infrastructure files).
 */
function hasFileOverlap(taskA: Task, taskB: Task): boolean {
  const filesA = new Set(getTaskFiles(taskA));
  const filesB = getTaskFiles(taskB);
  return filesB.some(f => filesA.has(f));
}

/**
 * Check if taskB works in a directory that taskA creates.
 * e.g., taskA creates "src/components/Auth.tsx" and taskB modifies "src/components/Auth/Login.tsx"
 */
function hasDirectoryAncestry(taskA: Task, taskB: Task): boolean {
  const createsA = getTaskCreates(taskA);
  const filesB = getTaskFiles(taskB);

  for (const fileA of createsA) {
    const dirA = fileA.substring(0, fileA.lastIndexOf('/'));
    if (!dirA) continue;
    for (const fileB of filesB) {
      if (fileB.startsWith(dirA + '/')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Build an adjacency list of task dependencies from file overlaps,
 * directory ancestry, and Claude's dependsOn hints.
 *
 * Returns a Map<taskId, Set<taskId>> where the value is the set of
 * task IDs that the key task depends on (must complete before it).
 */
function buildDependencyGraph(tasks: Task[]): Map<string, Set<string>> {
  const deps = new Map<string, Set<string>>();

  for (const task of tasks) {
    deps.set(task.id, new Set(task.dependsOn || []));
  }

  // Check file overlaps and directory ancestry between all pairs
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const taskA = tasks[i];
      const taskB = tasks[j];

      // Only add dependency if both tasks have file manifests
      const aHasManifest = taskA.creates !== undefined || taskA.modifies !== undefined;
      const bHasManifest = taskB.creates !== undefined || taskB.modifies !== undefined;

      if (!aHasManifest || !bHasManifest) continue;

      if (hasFileOverlap(taskA, taskB) || hasDirectoryAncestry(taskA, taskB)) {
        // Earlier task (by array position) is the dependency
        deps.get(taskB.id)!.add(taskA.id);
      }

      // Also check reverse directory ancestry (B creates, A works in that dir)
      if (hasDirectoryAncestry(taskB, taskA)) {
        deps.get(taskA.id)!.add(taskB.id);
      }
    }
  }

  return deps;
}

/**
 * Assign tiers via Kahn's algorithm (topological sort by levels).
 *
 * Tier 0 = tasks with no dependencies.
 * Tier N = tasks whose dependencies are all in tiers < N.
 */
function assignTiersFromGraph(
  tasks: Task[],
  deps: Map<string, Set<string>>
): Map<string, number> {
  const tierMap = new Map<string, number>();
  const taskIds = new Set(tasks.map(t => t.id));

  // Compute in-degree for each task
  const inDegree = new Map<string, number>();
  for (const task of tasks) {
    const taskDeps = deps.get(task.id) || new Set();
    // Only count dependencies that are actually in our task list
    const validDeps = new Set([...taskDeps].filter(d => taskIds.has(d)));
    deps.set(task.id, validDeps);
    inDegree.set(task.id, validDeps.size);
  }

  let currentTier = 0;
  const remaining = new Set(tasks.map(t => t.id));

  while (remaining.size > 0) {
    // Find all tasks with in-degree 0
    const ready: string[] = [];
    for (const id of remaining) {
      if ((inDegree.get(id) || 0) === 0) {
        ready.push(id);
      }
    }

    if (ready.length === 0) {
      // Cycle detected — assign all remaining tasks to this tier (fallback)
      for (const id of remaining) {
        tierMap.set(id, currentTier);
      }
      break;
    }

    // Assign this tier
    for (const id of ready) {
      tierMap.set(id, currentTier);
      remaining.delete(id);
    }

    // Decrement in-degrees of dependents
    for (const id of ready) {
      for (const otherId of remaining) {
        const otherDeps = deps.get(otherId);
        if (otherDeps && otherDeps.has(id)) {
          otherDeps.delete(id);
          inDegree.set(otherId, (inDegree.get(otherId) || 1) - 1);
        }
      }
    }

    currentTier++;
  }

  return tierMap;
}

/**
 * Apply heuristics after initial tier assignment:
 * - Tasks with "test" in the title go to the final tier
 */
function applyHeuristics(tasks: Task[], tierMap: Map<string, number>): void {
  const maxTier = Math.max(...tierMap.values(), 0);

  for (const task of tasks) {
    if (/\btest/i.test(task.title)) {
      const currentTier = tierMap.get(task.id) || 0;
      if (currentTier < maxTier) {
        tierMap.set(task.id, maxTier + 1);
      }
    }
  }
}

/**
 * Compute a TierPlan from a list of tasks.
 *
 * If all tasks lack file manifests (legacy projects), returns a single tier
 * with all tasks — effectively the same as sequential execution.
 */
export function computeTierPlan(tasks: Task[]): TierPlan {
  const incompleteTasks = tasks.filter(t => !t.completed);

  if (incompleteTasks.length === 0) {
    return {
      tiers: [],
      criticalPathLength: 0,
      estimatedSequentialMin: 0,
      estimatedParallelMin: 0,
    };
  }

  // Check if any tasks have file manifests
  const hasAnyManifest = incompleteTasks.some(
    t => t.creates !== undefined || t.modifies !== undefined
  );

  if (!hasAnyManifest) {
    // Legacy fallback — single tier with all tasks, sequential order
    const totalMin = incompleteTasks.reduce((s, t) => s + (t.estimatedMinutes || 3), 0);
    return {
      tiers: [{
        tier: 0,
        taskIds: incompleteTasks.map(t => t.id),
        estimatedMin: totalMin,
      }],
      criticalPathLength: 1,
      estimatedSequentialMin: totalMin,
      estimatedParallelMin: totalMin,
    };
  }

  // Handle mixed tasks: tasks without manifests depend on all prior tasks (conservative)
  const tasksWithFallback = incompleteTasks.map((task, idx) => {
    const hasManifest = task.creates !== undefined || task.modifies !== undefined;
    if (hasManifest) return task;

    // No manifest — depend on all earlier tasks
    const priorIds = incompleteTasks.slice(0, idx).map(t => t.id);
    return {
      ...task,
      dependsOn: [...new Set([...(task.dependsOn || []), ...priorIds])],
    };
  });

  // Build dependency graph and assign tiers
  const deps = buildDependencyGraph(tasksWithFallback);
  const tierMap = assignTiersFromGraph(tasksWithFallback, deps);
  applyHeuristics(tasksWithFallback, tierMap);

  // Group tasks by tier
  const tierGroups = new Map<number, string[]>();
  for (const [taskId, tier] of tierMap) {
    if (!tierGroups.has(tier)) tierGroups.set(tier, []);
    tierGroups.get(tier)!.push(taskId);
  }

  // Sort tiers and build TierGroup array
  const sortedTiers = [...tierGroups.keys()].sort((a, b) => a - b);
  const tiers: TierGroup[] = sortedTiers.map((tierNum, idx) => {
    const taskIds = tierGroups.get(tierNum)!;
    const maxEstimate = Math.max(
      ...taskIds.map(id => {
        const task = incompleteTasks.find(t => t.id === id);
        return task?.estimatedMinutes || 3;
      })
    );
    return {
      tier: idx, // Normalize tier numbers to 0-based sequential
      taskIds,
      estimatedMin: maxEstimate,
    };
  });

  const estimatedSequentialMin = incompleteTasks.reduce(
    (s, t) => s + (t.estimatedMinutes || 3), 0
  );
  const estimatedParallelMin = tiers.reduce((s, t) => s + t.estimatedMin, 0);

  return {
    tiers,
    criticalPathLength: tiers.length,
    estimatedSequentialMin,
    estimatedParallelMin,
  };
}

/**
 * Assign tier and dependsOn fields to tasks in-place and return them.
 * This is the convenience wrapper that updates tasks with computed DAG data.
 */
export function assignTiers(tasks: Task[]): Task[] {
  const plan = computeTierPlan(tasks);

  // Build a lookup: taskId → tier number
  const tierLookup = new Map<string, number>();
  for (const group of plan.tiers) {
    for (const taskId of group.taskIds) {
      tierLookup.set(taskId, group.tier);
    }
  }

  return tasks.map(task => ({
    ...task,
    tier: tierLookup.get(task.id) ?? task.tier,
  }));
}
