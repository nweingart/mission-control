import { useState } from 'react';
import type { BacklogItem } from '../types';

interface BacklogSidebarProps {
  items: BacklogItem[];
  onAddItem: (item: Omit<BacklogItem, 'id' | 'createdAt'>) => void;
  onUpdateItem: (id: string, updates: Partial<BacklogItem>) => void;
  onRemoveItem: (id: string) => void;
}

const priorityColors = {
  high: {
    badge: 'bg-error/15 text-error border-error/30',
    dot: 'bg-error',
  },
  medium: {
    badge: 'bg-spectrum-yellow/15 text-spectrum-yellow border-spectrum-yellow/30',
    dot: 'bg-spectrum-yellow',
  },
  low: {
    badge: 'bg-success/15 text-success border-success/30',
    dot: 'bg-success',
  },
};

function BacklogItemCard({
  item,
  onUpdate,
  onRemove,
}: {
  item: BacklogItem;
  onUpdate: (updates: Partial<BacklogItem>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDescription, setEditDescription] = useState(item.description);

  const handleSave = () => {
    onUpdate({ title: editTitle, description: editDescription });
    setEditing(false);
  };

  const colors = priorityColors[item.priority];

  if (editing) {
    return (
      <div className="card-panel p-3 space-y-2">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="input-inset w-full px-2 py-1 bg-surface-card border border-border text-ink text-sm focus:outline-none focus:ring-1 focus:ring-border-strong"
          placeholder="Feature title"
        />
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          className="input-inset w-full px-2 py-1 bg-surface-card border border-border text-ink text-sm focus:outline-none focus:ring-1 focus:ring-border-strong resize-none"
          rows={2}
          placeholder="Description"
        />
        <div className="flex items-center justify-between">
          <select
            value={item.priority}
            onChange={(e) => onUpdate({ priority: e.target.value as BacklogItem['priority'] })}
            className="input-inset px-2 py-1 bg-surface-card border border-border text-ink text-xs focus:outline-none focus:ring-1 focus:ring-border-strong"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="btn-solid px-2 py-1 text-xs text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn-solid-primary px-2 py-1 text-xs"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card-panel hover:border-border transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          <span className={`w-2 h-2 mt-1.5 flex-shrink-0 ${colors.dot}`} />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-ink truncate">{item.title}</h4>
            {expanded && (
              <p className="text-xs text-ink-muted mt-1">{item.description}</p>
            )}
          </div>
          <span className={`font-display font-bold capitalize text-[14px] px-2 py-0.5 border rounded ${colors.badge}`}>
            {item.priority}
          </span>
        </div>
      </div>
      {expanded && !showDeleteConfirm && (
        <div className="px-3 pb-3 flex gap-2 border-t border-border pt-2 mt-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="text-xs text-ink-muted hover:text-ink"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            className="text-xs text-error hover:text-error"
          >
            Delete
          </button>
        </div>
      )}
      {showDeleteConfirm && (
        <div className="px-3 pb-3 border-t border-border pt-2 mt-1">
          <p className="text-xs text-ink-muted mb-2">Delete this item?</p>
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(false);
              }}
              className="btn-solid px-2 py-1 text-xs text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="btn-solid-danger px-2 py-1 text-xs"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddItemForm({
  onAdd,
  onCancel,
}: {
  onAdd: (item: Omit<BacklogItem, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<BacklogItem['priority']>('medium');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onAdd({ title: title.trim(), description: description.trim(), priority });
      setTitle('');
      setDescription('');
      setPriority('medium');
      onCancel();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card-panel p-3 space-y-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="input-inset w-full px-2 py-1 bg-surface-card border border-border text-ink text-sm focus:outline-none focus:ring-1 focus:ring-border-strong"
        placeholder="Feature title"
        autoFocus
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="input-inset w-full px-2 py-1 bg-surface-card border border-border text-ink text-sm focus:outline-none focus:ring-1 focus:ring-border-strong resize-none"
        rows={2}
        placeholder="Description (optional)"
      />
      <div className="flex items-center justify-between">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as BacklogItem['priority'])}
          className="input-inset px-2 py-1 bg-surface-card border border-border text-ink text-xs focus:outline-none focus:ring-1 focus:ring-border-strong"
        >
          <option value="high">High Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="low">Low Priority</option>
        </select>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn-solid px-2 py-1 text-xs text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            className="btn-solid-primary px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </div>
    </form>
  );
}

export default function BacklogSidebar({
  items,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
}: BacklogSidebarProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  // Group items by priority
  const highItems = items.filter((i) => i.priority === 'high');
  const mediumItems = items.filter((i) => i.priority === 'medium');
  const lowItems = items.filter((i) => i.priority === 'low');

  return (
    <div className="h-full flex flex-col card-panel overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-lg font-sans font-semibold text-ink">Backlog</h3>
          <p className="text-xs text-ink-muted">{items.length} items</p>
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 && !showAddForm && (
          <div className="text-center py-8 text-ink-muted">
            <svg
              className="w-8 h-8 mx-auto mb-2 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-sm">No V2 features yet</p>
            <p className="text-xs mt-1">Chat with Claude to brainstorm ideas</p>
          </div>
        )}

        {highItems.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-1 py-1.5">
              <span className="w-2.5 h-2.5 bg-error rounded" />
              <span className="font-display font-bold text-[14px] text-error">
                High Priority
              </span>
              <span className="text-xs text-ink-muted font-medium">({highItems.length})</span>
            </div>
            {highItems.map((item) => (
              <BacklogItemCard
                key={item.id}
                item={item}
                onUpdate={(updates) => onUpdateItem(item.id, updates)}
                onRemove={() => onRemoveItem(item.id)}
              />
            ))}
          </div>
        )}

        {mediumItems.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-1 py-1.5">
              <span className="w-2.5 h-2.5 bg-accent rounded" />
              <span className="font-display font-bold text-[14px] text-accent">
                Medium Priority
              </span>
              <span className="text-xs text-ink-muted font-medium">({mediumItems.length})</span>
            </div>
            {mediumItems.map((item) => (
              <BacklogItemCard
                key={item.id}
                item={item}
                onUpdate={(updates) => onUpdateItem(item.id, updates)}
                onRemove={() => onRemoveItem(item.id)}
              />
            ))}
          </div>
        )}

        {lowItems.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-1 py-1.5">
              <span className="w-2.5 h-2.5 bg-success rounded" />
              <span className="font-display font-bold text-[14px] text-success">
                Low Priority
              </span>
              <span className="text-xs text-ink-muted font-medium">({lowItems.length})</span>
            </div>
            {lowItems.map((item) => (
              <BacklogItemCard
                key={item.id}
                item={item}
                onUpdate={(updates) => onUpdateItem(item.id, updates)}
                onRemove={() => onRemoveItem(item.id)}
              />
            ))}
          </div>
        )}

        {showAddForm && (
          <AddItemForm
            onAdd={onAddItem}
            onCancel={() => setShowAddForm(false)}
          />
        )}
      </div>

      {/* Add button */}
      {!showAddForm && (
        <div className="p-3 border-t border-border">
          <button
            onClick={() => setShowAddForm(true)}
            className="btn-solid w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-ink-muted hover:text-ink transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add manually
          </button>
        </div>
      )}
    </div>
  );
}
