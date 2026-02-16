import { useState } from 'react';
import type { Task } from '../types';

interface TaskListProps {
  tasks: Task[];
  onTaskToggle: (id: string) => void;
  onTaskRemove: (id: string) => void;
  onTaskAdd: (title: string) => void;
  onTasksReorder: (tasks: Task[]) => void;
  onTaskEdit?: (id: string, title: string) => void;
  editable?: boolean;
  showAddButton?: boolean;
}

export default function TaskList({
  tasks,
  onTaskToggle,
  onTaskRemove,
  onTaskAdd,
  onTasksReorder,
  onTaskEdit,
  editable = true,
  showAddButton = true,
}: TaskListProps) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskTitle.trim()) {
      onTaskAdd(newTaskTitle.trim());
      setNewTaskTitle('');
    }
  };

  const handleEditStart = (task: Task) => {
    setEditingId(task.id);
    setEditingTitle(task.title);
  };

  const handleEditSave = () => {
    if (editingId && editingTitle.trim() && onTaskEdit) {
      onTaskEdit(editingId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle('');
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSave();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditingTitle('');
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newTasks = [...tasks];
    const draggedTask = newTasks[draggedIndex];
    newTasks.splice(draggedIndex, 1);
    newTasks.splice(index, 0, draggedTask);

    setDraggedIndex(index);
    onTasksReorder(newTasks);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const progress = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;
  const filledSegments = Math.round(progress / 10);
  const totalEstimatedMinutes = tasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      {tasks.length > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-sm font-sans font-medium text-ink-secondary mb-1">
            <span>Progress</span>
            <span>{completedCount} / {tasks.length} tasks{totalEstimatedMinutes > 0 ? ` (~${totalEstimatedMinutes}m)` : ''}</span>
          </div>
          <div className="w-full flex gap-1 h-2">
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className={`flex-1 h-2 transition-all duration-300 ${
                  i < filledSegments ? 'bg-accent' : 'bg-border'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Task list */}
      <ul className="space-y-2">
        {tasks.map((task, index) => (
          <li
            key={task.id}
            draggable={editable}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`flex items-center space-x-3 p-3 bg-surface border border-border ${
              editable ? 'cursor-move hover:border-accent/40' : ''
            } ${draggedIndex === index ? 'opacity-50' : ''}`}
          >
            {/* Drag handle */}
            {editable && (
              <div className="text-ink-muted">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                </svg>
              </div>
            )}

            {/* Checkbox */}
            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => onTaskToggle(task.id)}
              className="w-5 h-5 text-accent border-border focus:ring-accent"
            />

            {/* Title + description + time estimate */}
            {editingId === task.id ? (
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={handleEditSave}
                onKeyDown={handleEditKeyDown}
                autoFocus
                className="input-inset flex-1 px-2 py-1 border border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent"
              />
            ) : (
              <div
                className={`flex-1 min-w-0 ${task.completed ? 'line-through text-ink-muted' : ''}`}
                onDoubleClick={() => editable && onTaskEdit && handleEditStart(task)}
              >
                <div className="flex items-center gap-2">
                  <span>{task.title}</span>
                  {task.estimatedMinutes && (
                    <span className="flex-shrink-0 text-xs text-ink-muted bg-surface-hover px-1.5 py-0.5 rounded">
                      ~{task.estimatedMinutes}m
                    </span>
                  )}
                </div>
                {task.description && (
                  <p className="text-xs text-ink-muted mt-0.5 truncate">{task.description}</p>
                )}
              </div>
            )}

            {/* Remove button */}
            {editable && (
              <button
                onClick={() => {
                  const confirmed = window.confirm(`Delete task "${task.title}"?`);
                  if (confirmed) {
                    onTaskRemove(task.id);
                  }
                }}
                className="text-ink-muted hover:text-error transition-colors"
                title="Delete task"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Add task form */}
      {showAddButton && editable && (
        <form onSubmit={handleAddTask} className="flex space-x-2">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Add a new task..."
            className="input-inset flex-1 px-4 py-2 border border-border focus:outline-none focus:ring-2 focus:ring-accent bg-surface text-ink placeholder:text-ink-muted"
          />
          <button
            type="submit"
            disabled={!newTaskTitle.trim()}
            className="btn-solid-primary px-4 py-2 disabled:bg-border disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </form>
      )}

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="text-center py-8 text-ink-muted">
          No tasks yet. Add some tasks to get started!
        </div>
      )}
    </div>
  );
}
