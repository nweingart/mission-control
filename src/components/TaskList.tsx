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

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      {tasks.length > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-charcoal-200 mb-1">
            <span>Progress</span>
            <span>{completedCount} / {tasks.length} tasks</span>
          </div>
          <div className="w-full bg-charcoal-600 rounded-full h-2">
            <div
              className="bg-terracotta-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
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
            className={`flex items-center space-x-3 p-3 bg-charcoal-700 border border-charcoal-600 rounded-lg ${
              editable ? 'cursor-move hover:border-terracotta-500/40' : ''
            } ${draggedIndex === index ? 'opacity-50' : ''}`}
          >
            {/* Drag handle */}
            {editable && (
              <div className="text-charcoal-400">
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
              className="w-5 h-5 text-terracotta-500 border-charcoal-500 rounded focus:ring-terracotta-500"
            />

            {/* Title */}
            {editingId === task.id ? (
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={handleEditSave}
                onKeyDown={handleEditKeyDown}
                autoFocus
                className="flex-1 px-2 py-1 border border-terracotta-500/40 rounded focus:outline-none focus:ring-2 focus:ring-terracotta-500"
              />
            ) : (
              <span
                className={`flex-1 ${task.completed ? 'line-through text-charcoal-400' : ''}`}
                onDoubleClick={() => editable && onTaskEdit && handleEditStart(task)}
              >
                {task.title}
              </span>
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
                className="text-charcoal-400 hover:text-rust-500 transition-colors"
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
            className="flex-1 px-4 py-2 border border-charcoal-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta-500 bg-charcoal-700 text-cream-100 placeholder:text-charcoal-400"
          />
          <button
            type="submit"
            disabled={!newTaskTitle.trim()}
            className="px-4 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 disabled:bg-charcoal-600 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </form>
      )}

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="text-center py-8 text-charcoal-400">
          No tasks yet. Add some tasks to get started!
        </div>
      )}
    </div>
  );
}
