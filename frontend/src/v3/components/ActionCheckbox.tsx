/**
 * ActionCheckbox -- individual action item with animated checkbox, owner badge, due date.
 * Used inside the ExpandedCard "Act" tab.
 */

import { useState } from 'react';
import type { ActionItem } from '../../types';
import { V3_FONT, V3_FONT_MONO } from '../theme';
import { useV3Theme } from '../ThemeContext';

export interface ActionCheckboxProps {
  action: ActionItem;
  onToggle: (id: string, done: boolean) => void;
}

export function ActionCheckbox({ action, onToggle }: ActionCheckboxProps) {
  const { theme: V3 } = useV3Theme();
  const [animating, setAnimating] = useState(false);
  const isDone = action.status === 'done';

  const isOverdue = (() => {
    if (isDone || !action.due) return false;
    try { return new Date(action.due) < new Date(); } catch { return false; }
  })();

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAnimating(true);
    onToggle(String(action.id), !isDone);
    setTimeout(() => setAnimating(false), 350);
  };

  const boxStyle: React.CSSProperties = {
    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
    border: `1.5px solid ${isDone ? V3.accent.green : V3.border.subtle}`,
    background: isDone ? V3.accent.green + '22' : 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', transition: 'all 200ms ease',
    transform: animating ? 'scale(1.15)' : 'scale(1)',
  };

  const checkStyle: React.CSSProperties = {
    width: 10, height: 10, opacity: isDone ? 1 : 0,
    transition: 'opacity 200ms ease, transform 200ms ease',
    transform: isDone ? 'scale(1)' : 'scale(0.5)',
    color: V3.accent.green,
    fontSize: 11, lineHeight: 1, fontWeight: 700,
  };

  const textStyle: React.CSSProperties = {
    flex: 1, fontSize: 12, lineHeight: 1.5,
    color: isDone ? V3.text.muted : V3.text.secondary,
    textDecoration: isDone ? 'line-through' : 'none',
    fontFamily: V3_FONT,
    transition: 'color 200ms ease',
  };

  const ownerStyle: React.CSSProperties = {
    display: 'inline-block',
    background: V3.accent.blue + '18',
    color: V3.accent.blue,
    padding: '1px 6px', borderRadius: 4,
    fontSize: 9, fontWeight: 600,
    fontFamily: V3_FONT_MONO,
    border: `1px solid ${V3.accent.blue}22`,
    whiteSpace: 'nowrap',
  };

  const dueStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 600,
    fontFamily: V3_FONT_MONO,
    color: isOverdue ? V3.accent.red : V3.text.muted,
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '6px 0',
        borderBottom: `1px solid ${V3.border.subtle}`,
      }}
    >
      <div style={boxStyle} onClick={handleToggle} role="checkbox" aria-checked={isDone}>
        <span style={checkStyle}>{'\u2713'}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={textStyle}>{action.text}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
          {action.owner && <span style={ownerStyle}>{action.owner}</span>}
          {action.due && <span style={dueStyle}>{isOverdue ? 'OVERDUE ' : ''}{action.due}</span>}
        </div>
      </div>
    </div>
  );
}

export default ActionCheckbox;
