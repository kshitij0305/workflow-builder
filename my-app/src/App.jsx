import { useState, useCallback } from 'react';
import {
  ReactFlow,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Background,
  Controls,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TriggerNode from './nodes/TriggerNode';
import ActionNode from './nodes/ActionNode';
import ConditionNode from './nodes/ConditionNode';
import EndNode from './nodes/EndNode';
const theme = {
  bg: '#020617',      
  panel: '#020617',
  border: '#334155',      
  text: '#e5e7eb',        

  accent: '#6366f1',      
  accentSoft: '#1e1b4b',

  success: '#22c55e',   
  danger: '#ef4444',     
  dangerBg: '#7f1d1d',
};


const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  end: EndNode,
};

/* -------------------- INITIAL GRAPH -------------------- */

const initialNodes = [
  {
    id: '1',
    type: 'trigger',
    position: { x: 100, y: 50 },
    data: { label: 'Start Workflow' },
  },
  {
    id: '2',
    type: 'action',
    position: { x: 100, y: 200 },
    data: { label: 'Do Something' },
  },
  {
    id: '3',
    type: 'condition',
    position: { x: 100, y: 350 },
    data: { label: 'Is it OK?', result: true },
  },
  {
    id: '4',
    type: 'end',
    position: { x: 100, y: 500 },
    data: { label: 'End Workflow' },
  },
];

const initialEdges = [];

/* -------------------- ENGINE HELPERS -------------------- */

function getNextNode(currentNode, edges) {
  if (currentNode.type !== 'condition') {
    const edge = edges.find(e => e.source === currentNode.id);
    return edge ? edge.target : null;
  }

  const handleId = currentNode.data.result ? 'true' : 'false';
  const edge = edges.find(
    e => e.source === currentNode.id && e.sourceHandle === handleId
  );

  return edge ? edge.target : null;
}

function validateWorkflow(nodes, edges) {
  const errors = [];

  const triggers = nodes.filter(n => n.type === 'trigger');
  if (triggers.length !== 1) {
    errors.push('Workflow must have exactly one Trigger node.');
  }

  const ends = nodes.filter(n => n.type === 'end');
  if (ends.length === 0) {
    errors.push('Workflow must have at least one End node.');
  }

  const incoming = {};
  const outgoing = {};

  nodes.forEach(n => {
    incoming[n.id] = 0;
    outgoing[n.id] = 0;
  });

  edges.forEach(e => {
    incoming[e.target]++;
    outgoing[e.source]++;
  });

  nodes.forEach(node => {
    if (node.type !== 'trigger' && incoming[node.id] === 0) {
      errors.push(`"${node.data.label}" has no incoming connection.`);
    }
    if (node.type !== 'end' && outgoing[node.id] === 0) {
      errors.push(`"${node.data.label}" has no outgoing connection.`);
    }
  });

  nodes
    .filter(n => n.type === 'condition')
    .forEach(cond => {
      const hasTrue = edges.some(
        e => e.source === cond.id && e.sourceHandle === 'true'
      );
      const hasFalse = edges.some(
        e => e.source === cond.id && e.sourceHandle === 'false'
      );

      if (!hasTrue || !hasFalse) {
        errors.push(
          `Condition "${cond.data.label}" must have both TRUE and FALSE branches.`
        );
      }
    });

  return { isValid: errors.length === 0, errors };
}

function isValidConnection({ source, target, sourceHandle }, nodes, edges) {
  if (source === target) return false;

  const sourceNode = nodes.find(n => n.id === source);
  const targetNode = nodes.find(n => n.id === target);
  if (!sourceNode || !targetNode) return false;

  if (targetNode.type === 'trigger') return false;
  if (sourceNode.type === 'end') return false;

  if (edges.some(e => e.target === target)) return false;

  if (sourceNode.type === 'condition') {
    if (sourceHandle !== 'true' && sourceHandle !== 'false') return false;
    if (edges.some(e => e.source === source && e.sourceHandle === sourceHandle))
      return false;
  }

  return true;
}

function createNode(type, position) {
  const id = crypto.randomUUID();
  const base = { id, type, position };

  switch (type) {
    case 'trigger':
      return { ...base, data: { label: 'New Trigger' } };
    case 'action':
      return { ...base, data: { label: 'New Action' } };
    case 'condition':
      return { ...base, data: { label: 'New Condition', result: true } };
    case 'end':
      return { ...base, data: { label: 'End' } };
    default:
      return null;
  }
}

/* -------------------- APP -------------------- */

export default function App() {
  const [history, setHistory] = useState({
    past: [],
    present: { nodes: initialNodes, edges: initialEdges },
    future: [],
  });

  const { nodes, edges } = history.present;

  const [activeNodeId, setActiveNodeId] = useState(null);
  const [errors, setErrors] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  function commit(newNodes, newEdges) {
    setHistory(h => ({
      past: [...h.past, h.present],
      present: { nodes: newNodes, edges: newEdges },
      future: [],
    }));
  }

  function updateGraph(nextNodes, nextEdges) {
    if (nextNodes === nodes && nextEdges === edges) return;
    commit(nextNodes, nextEdges);
  }

  /* ---------- UNDO / REDO ---------- */

  function undo() {
    setHistory(h => {
      if (h.past.length === 0) return h;
      const prev = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: prev,
        future: [h.present, ...h.future],
      };
    });
    setActiveNodeId(null);
    setSelectedNodeId(null);
  }

  function redo() {
    setHistory(h => {
      if (h.future.length === 0) return h;
      const next = h.future[0];
      return {
        past: [...h.past, h.present],
        present: next,
        future: h.future.slice(1),
      };
    });
    setActiveNodeId(null);
    setSelectedNodeId(null);
  }

  /* ---------- SAVE / LOAD ---------- */

  function saveWorkflow() {
    const data = JSON.stringify(history.present, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow.json';
    a.click();

    URL.revokeObjectURL(url);
  }

  function loadWorkflow(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed.nodes || !parsed.edges) {
          alert('Invalid workflow file');
          return;
        }

        setHistory({
          past: [],
          present: parsed,
          future: [],
        });

        setActiveNodeId(null);
        setSelectedNodeId(null);
        setErrors([]);
      } catch {
        alert('Failed to load workflow');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- GRAPH HANDLERS ---------- */

  const onNodesChange = useCallback(
    changes => {
      if (changes.every(c => c.type === 'reset')) return;
      const updatedNodes = applyNodeChanges(changes, nodes);
      updateGraph(updatedNodes, edges);
    },
    [nodes, edges]
  );

  const onEdgesChange = useCallback(
    changes => {
      const updatedEdges = applyEdgeChanges(changes, edges);
      updateGraph(nodes, updatedEdges);
    },
    [nodes, edges]
  );

  const onConnect = useCallback(
    params => {
      if (!isValidConnection(params, nodes, edges)) return;
      updateGraph(nodes, addEdge(params, edges));
    },
    [nodes, edges]
  );

  const updateNodeLabel = useCallback(
    (id, label) => {
      updateGraph(
        nodes.map(n =>
          n.id === id ? { ...n, data: { ...n.data, label } } : n
        ),
        edges
      );
    },
    [nodes, edges]
  );

  function addNode(type) {
    const position = {
      x: 200 + Math.random() * 200,
      y: 100 + nodes.length * 80,
    };
    updateGraph([...nodes, createNode(type, position)], edges);
  }

  function runWorkflow() {
    const result = validateWorkflow(nodes, edges);
    if (!result.isValid) {
      setErrors(result.errors);
      setActiveNodeId(null);
      return;
    }

    setErrors([]);

    let currentId = nodes.find(n => n.type === 'trigger')?.id;
    if (!currentId) return;

    setActiveNodeId(currentId);

    const interval = setInterval(() => {
      const node = nodes.find(n => n.id === currentId);
      if (!node || node.type === 'end') return clearInterval(interval);

      const next = getNextNode(node, edges);
      if (!next) return clearInterval(interval);

      currentId = next;
      setActiveNodeId(currentId);
    }, 800);
  }

  const nodesWithExecutionState = nodes.map(n => ({
    ...n,
    data: {
      ...n.data,
      isActive: n.id === activeNodeId,
      onLabelChange: updateNodeLabel,
      nodeId: n.id,
    },
  }));

  const darkButton = {
    background: '#020617',
    color: '#e5e7eb',
    border: '1px solid #334155',
    padding: '6px 10px',
    borderRadius: 6,
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#020617',
        color: '#e5e7eb',
      }}
    >
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
        <button style={darkButton} onClick={runWorkflow}>▶ Run</button>{' '}
        <button style={darkButton} onClick={undo} disabled={!history.past.length}>↩ Undo</button>{' '}
        <button style={darkButton} onClick={redo} disabled={!history.future.length}>↪ Redo</button>{' '}
        <button style={darkButton} onClick={saveWorkflow}>💾 Save</button>{' '}
        <label style={darkButton}>
          📂 Load
          <input type="file" accept=".json" hidden onChange={loadWorkflow} />
        </label>
      </div>

      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }}>
        <button style={darkButton} onClick={() => addNode('trigger')}>➕ Trigger</button>{' '}
        <button style={darkButton} onClick={() => addNode('action')}>➕ Action</button>{' '}
        <button style={darkButton} onClick={() => addNode('condition')}>➕ Condition</button>{' '}
        <button style={darkButton} onClick={() => addNode('end')}>➕ End</button>
      </div>

      {errors.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 60,
            left: 10,
            background: '#7f1d1d',
            border: '1px solid #ef4444',
            padding: '10px 14px',
            borderRadius: 8,
            zIndex: 10,
            maxWidth: 320,
          }}
        >
          <strong>Workflow Errors</strong>
          <ul>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <ReactFlow
        nodes={nodesWithExecutionState}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => setSelectedNodeId(n.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        fitView
        colorMode="dark"
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
