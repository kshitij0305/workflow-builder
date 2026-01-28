import { Handle, Position } from '@xyflow/react';
import { useState } from 'react';
import { theme } from '../theme';

export default function ActionNode({ data }) {
  const { label, isActive, onLabelChange, nodeId } = data;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);

  function save() {
    onLabelChange(nodeId, value.trim() || 'Action');
    setEditing(false);
  }

  return (
    <div
      onDoubleClick={() => setEditing(true)}
      style={{
        background: isActive ? '#052e16' : theme.panel,
        color: theme.text,
        border: isActive
          ? `2px solid ${theme.success}`
          : `1px solid ${theme.border}`,
        boxShadow: isActive
          ? '0 0 12px rgba(34,197,94,0.6)'
          : 'none',
        padding: 12,
        borderRadius: 10,
        minWidth: 160,
        textAlign: 'center',
        transition: 'all 0.2s ease',
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => e.key === 'Enter' && save()}
          style={{
            width: '100%',
            background: theme.bg,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 6,
            padding: '4px 6px',
          }}
        />
      ) : (
        <strong>{label}</strong>
      )}

      <Handle
        type="target"
        position={Position.Top}
        style={{ background: theme.border, width: 10, height: 10 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: theme.accent, width: 10, height: 10 }}
      />
    </div>
  );
}
