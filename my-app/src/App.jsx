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
import { theme } from './theme';

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  end: EndNode,
};

const isMobile = window.innerWidth < 768;
const toolbarStyle = {
  position: 'absolute',
  top: 10,
  left: 10,
  right: 10,
  zIndex: 10,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  justifyContent: isMobile ? 'center' : 'space-between',
};

/* -------------------- INITIAL GRAPH -------------------- */

const initialNodes = [
  { id: '1', type: 'trigger', position: { x: 100, y: 50 }, data: { label: 'Start Workflow' } },
  { id: '2', type: 'action', position: { x: 100, y: 200 }, data: { label: 'Do Something' } },
  { id: '3', type: 'condition', position: { x: 100, y: 350 }, data: { label: 'Is it OK?', result: true } },
  { id: '4', type: 'end', position: { x: 100, y: 500 }, data: { label: 'End Workflow' } },
];

const initialEdges = [];

/* -------------------- ENGINE -------------------- */

function getNextNode(node, edges) {
  if (node.type !== 'condition') {
    return edges.find(e => e.source === node.id)?.target ?? null;
  }
  const handle = node.data.result ? 'true' : 'false';
  return edges.find(e => e.source === node.id && e.sourceHandle === handle)?.target ?? null;
}

function validateWorkflow(nodes, edges) {
  const errors = [];

  if (nodes.filter(n => n.type === 'trigger').length !== 1) {
    errors.push('Workflow must have exactly one Trigger node.');
  }

  if (!nodes.some(n => n.type === 'end')) {
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

  nodes.forEach(n => {
    if (n.type !== 'trigger' && incoming[n.id] === 0) {
      errors.push(`"${n.data.label}" has no incoming connection.`);
    }
    if (n.type !== 'end' && outgoing[n.id] === 0) {
      errors.push(`"${n.data.label}" has no outgoing connection.`);
    }
  });

  nodes
    .filter(n => n.type === 'condition')
    .forEach(c => {
      const t = edges.some(e => e.source === c.id && e.sourceHandle === 'true');
      const f = edges.some(e => e.source === c.id && e.sourceHandle === 'false');
      if (!t || !f) {
        errors.push(`Condition "${c.data.label}" must have both TRUE and FALSE branches.`);
      }
    });

  return errors;
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

  /* ---------- HISTORY ---------- */

  function commit(nodes, edges) {
    setHistory(h => ({
      past: [...h.past, h.present],
      present: { nodes, edges },
      future: [],
    }));
  }

  function undo() {
    setHistory(h => {
      if (!h.past.length) return h;
      const prev = h.past.at(-1);
      return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
    });
    setActiveNodeId(null);
    setSelectedNodeId(null);
  }

  function redo() {
    setHistory(h => {
      if (!h.future.length) return h;
      const next = h.future[0];
      return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
    });
    setActiveNodeId(null);
    setSelectedNodeId(null);
  }

  /* ---------- SAVE / LOAD ---------- */

  function saveWorkflow() {
    const blob = new Blob([JSON.stringify(history.present, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'workflow.json';
    a.click();
  }

  function loadWorkflow(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setHistory({ past: [], present: JSON.parse(ev.target.result), future: [] });
      setErrors([]);
      setActiveNodeId(null);
      setSelectedNodeId(null);
    };
    reader.readAsText(file);
  }

  /* ---------- GRAPH HANDLERS ---------- */

  const onNodesChange = useCallback(
    changes => {
      setHistory(h => ({
        ...h,
        present: { ...h.present, nodes: applyNodeChanges(changes, h.present.nodes) },
      }));
    },
    []
  );

  const onNodeDragStop = useCallback(
    (_, node) => commit(nodes.map(n => (n.id === node.id ? node : n)), edges),
    [nodes, edges]
  );

  const onEdgesChange = useCallback(
    changes => commit(nodes, applyEdgeChanges(changes, edges)),
    [nodes, edges]
  );

  const onConnect = useCallback(
    params => commit(nodes, addEdge(params, edges)),
    [nodes, edges]
  );

  function addNode(type) {
    commit(
      [
        ...nodes,
        {
          id: crypto.randomUUID(),
          type,
          position: { x: 300, y: 120 + nodes.length * 80 },
          data: type === 'condition' ? { label: 'Condition', result: true } : { label: type },
        },
      ],
      edges
    );
  }

  /* ---------- EXECUTION ---------- */

  function runWorkflow() {
    const errs = validateWorkflow(nodes, edges);
    if (errs.length) {
      setErrors(errs);
      setActiveNodeId(null);
      return;
    }

    setErrors([]);
    let current = nodes.find(n => n.type === 'trigger')?.id;
    if (!current) return;

    setActiveNodeId(current);
    const timer = setInterval(() => {
      const node = nodes.find(n => n.id === current);
      if (!node || node.type === 'end') return clearInterval(timer);
      const next = getNextNode(node, edges);
      if (!next) return clearInterval(timer);
      current = next;
      setActiveNodeId(current);
    }, 800);
  }

  const nodesWithExecutionState = nodes.map(n => ({
    ...n,
    data: { ...n.data, isActive: n.id === activeNodeId },
  }));

  const btn = {
    background: theme.panel,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    padding: '10px 12px',
    borderRadius: 8,
    fontSize: 14,
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: theme.bg }}>
      <div style={toolbarStyle}>
  {/* LEFT GROUP */}
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
    <button style={btn} onClick={runWorkflow}>▶ Run</button>
    <button style={btn} onClick={undo}>↩ Undo</button>
    <button style={btn} onClick={redo}>↪ Redo</button>
    <button style={btn} onClick={saveWorkflow}>💾 Save</button>
    <label style={btn}>
      📂 Load
      <input hidden type="file" accept=".json" onChange={loadWorkflow} />
    </label>
  </div>

  {/* RIGHT GROUP */}
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
    <button style={btn} onClick={() => addNode('trigger')}>➕ Trigger</button>
    <button style={btn} onClick={() => addNode('action')}>➕ Action</button>
    <button style={btn} onClick={() => addNode('condition')}>➕ Condition</button>
    <button style={btn} onClick={() => addNode('end')}>➕ End</button>
  </div>
</div>


      {/* CONDITION PANEL */}
      {selectedNode?.type === 'condition' && (
        <div
          style={{
            position: 'absolute',
            bottom: isMobile ? 0 : 'auto',
            right: 0,
            top: isMobile ? 'auto' : 0,
            width: isMobile ? '100%' : 260,
            height: isMobile ? 180 : '100%',
            background: theme.panel,
            borderTop: isMobile ? `1px solid ${theme.border}` : undefined,
            borderLeft: !isMobile ? `1px solid ${theme.border}` : undefined,
            padding: 12,
            zIndex: 20,
          }}
        >
          <h3>Condition</h3>
          <select
            value={selectedNode.data.result ? 'true' : 'false'}
            onChange={e =>
              commit(
                nodes.map(n =>
                  n.id === selectedNode.id
                    ? { ...n, data: { ...n.data, result: e.target.value === 'true' } }
                    : n
                ),
                edges
              )
            }
          >
            <option value="true">TRUE</option>
            <option value="false">FALSE</option>
          </select>
        </div>
      )}

      {/* ERRORS */}
      {errors.length > 0 && (
        <div style={{ position: 'absolute', top: 60, left: 10, background: theme.dangerBg, border: `1px solid ${theme.danger}`, padding: 12, borderRadius: 8, maxWidth: 340, zIndex: 10 }}>
          <strong>Workflow Errors</strong>
          <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      {isMobile && (
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', fontSize: 12, opacity: 0.6 }}>
          Drag to pan · Pinch to zoom
        </div>
      )}

      <ReactFlow
        nodes={nodesWithExecutionState}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => setSelectedNodeId(n.id)}
        onPaneClick={() => setSelectedNodeId(null)}
        fitView
        colorMode="dark"
        panOnDrag
        panOnScroll
        zoomOnPinch
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        selectionOnDrag={false}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
