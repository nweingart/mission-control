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
    badge: 'bg-rust-500/15 text-rust-400 border-rust-500/30',
    dot: 'bg-rust-500',
  },
  medium: {
    badge: 'bg-terracotta-500/15 text-terracotta-400 border-terracotta-500/30',
    dot: 'bg-terracotta-500',
  },
  low: {
    badge: 'bg-sage-500/15 text-sage-400 border-sage-500/30',
    dot: 'bg-sage-500',
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
      <div className="bg-charcoal-700 rounded-lg border border-charcoal-500 p-3 space-y-2">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full px-2 py-1 bg-charcoal-800 border border-charcoal-600 rounded text-cream-100 text-sm focus:outline-none focus:ring-1 focus:ring-terracotta-500"
          placeholder="Feature title"
        />
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          className="w-full px-2 py-1 bg-charcoal-800 border border-charcoal-600 rounded text-cream-100 text-sm focus:outline-none focus:ring-1 focus:ring-terracotta-500 resize-none"
          rows={2}
          placeholder="Description"
        />
        <div className="flex items-center justify-between">
          <select
            value={item.priority}
            onChange={(e) => onUpdate({ priority: e.target.value as BacklogItem['priority'] })}
            className="px-2 py-1 bg-charcoal-800 border border-charcoal-600 rounded text-cream-100 text-xs focus:outline-none focus:ring-1 focus:ring-terracotta-500"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="px-2 py-1 text-xs text-charcoal-300 hover:text-cream-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-2 py-1 text-xs bg-terracotta-500 text-charcoal-950 rounded hover:bg-terracotta-600"
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
      className="bg-charcoal-700 rounded-lg border border-charcoal-600 hover:border-charcoal-500 transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${colors.dot}`} />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-cream-100 truncate">{item.title}</h4>
            {expanded && (
              <p className="text-xs text-charcoal-300 mt-1">{item.description}</p>
            )}
          </div>
          <span className={`text-xs px-1.5 py-0.5 rounded border ${colors.badge}`}>
            {item.priority}
          </span>
        </div>
      </div>
      {expanded && !showDeleteConfirm && (
        <div className="px-3 pb-3 flex gap-2 border-t border-charcoal-600 pt-2 mt-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="text-xs text-charcoal-400 hover:text-cream-100"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            className="text-xs text-rust-400 hover:text-rust-300"
          >
            Delete
          </button>
        </div>
      )}
      {showDeleteConfirm && (
        <div className="px-3 pb-3 border-t border-charcoal-600 pt-2 mt-1">
          <p className="text-xs text-charcoal-300 mb-2">Delete this item?</p>
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(false);
              }}
              className="px-2 py-1 text-xs text-charcoal-400 hover:text-cream-100"
            >
              Cancel
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="px-2 py-1 text-xs bg-rust-500 text-cream-100 rounded hover:bg-rust-600"
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
    <form onSubmit={handleSubmit} className="bg-charcoal-700 rounded-lg border border-charcoal-500 p-3 space-y-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-2 py-1 bg-charcoal-800 border border-charcoal-600 rounded text-cream-100 text-sm focus:outline-none focus:ring-1 focus:ring-terracotta-500"
        placeholder="Feature title"
        autoFocus
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full px-2 py-1 bg-charcoal-800 border border-charcoal-600 rounded text-cream-100 text-sm focus:outline-none focus:ring-1 focus:ring-terracotta-500 resize-none"
        rows={2}
        placeholder="Description (optional)"
      />
      <div className="flex items-center justify-between">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as BacklogItem['priority'])}
          className="px-2 py-1 bg-charcoal-800 border border-charcoal-600 rounded text-cream-100 text-xs focus:outline-none focus:ring-1 focus:ring-terracotta-500"
        >
          <option value="high">High Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="low">Low Priority</option>
        </select>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-1 text-xs text-charcoal-300 hover:text-cream-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            className="px-2 py-1 text-xs bg-terracotta-500 text-charcoal-950 rounded hover:bg-terracotta-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
    <div className="h-full flex flex-col bg-charcoal-800 rounded-lg border border-charcoal-600 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-charcoal-600 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-cream-100">Backlog</h3>
          <p className="text-xs text-charcoal-400">{items.length} items</p>
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 && !showAddForm && (
          <div className="text-center py-8 text-charcoal-400">
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
            <div className="flex items-center gap-2 px-1 py-1">
              <span className="w-2 h-2 rounded-full bg-rust-500" />
              <span className="text-xs font-medium text-rust-400 uppercase tracking-wide">
                High Priority
              </span>
              <span className="text-xs text-charcoal-500">({highItems.length})</span>
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
            <div className="flex items-center gap-2 px-1 py-1">
              <span className="w-2 h-2 rounded-full bg-terracotta-500" />
              <span className="text-xs font-medium text-terracotta-400 uppercase tracking-wide">
                Medium Priority
              </span>
              <span className="text-xs text-charcoal-500">({mediumItems.length})</span>
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
            <div className="flex items-center gap-2 px-1 py-1">
              <span className="w-2 h-2 rounded-full bg-sage-500" />
              <span className="text-xs font-medium text-sage-400 uppercase tracking-wide">
                Low Priority
              </span>
              <span className="text-xs text-charcoal-500">({lowItems.length})</span>
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
        <div className="p-3 border-t border-charcoal-600">
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-charcoal-300 hover:text-cream-100 hover:bg-charcoal-700 rounded-lg transition-colors"
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
