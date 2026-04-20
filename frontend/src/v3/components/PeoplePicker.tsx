/**
 * PeoplePicker — Debounced autocomplete for MS Graph directory search.
 * Used in the Act tab to assign actions to team members.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useV3Theme } from '../ThemeContext';
import { searchUsers } from '../../services/api';
import type { DirectoryUser } from '../../types';
import { V3_FONT } from '../theme';

interface PeoplePickerProps {
  onSelect: (user: DirectoryUser) => void;
  placeholder?: string;
}

export function PeoplePicker({ onSelect, placeholder = 'Search people...' }: PeoplePickerProps) {
  const { theme: V3 } = useV3Theme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const users = await searchUsers(q);
    setResults(users);
    setOpen(users.length > 0);
    setLoading(false);
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (user: DirectoryUser) => {
    setQuery(user.displayName);
    setOpen(false);
    onSelect(user);
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Position dropdown relative to viewport using input's bounding rect
  useEffect(() => {
    if (open && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
    }
  }, [open, results]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Also check if click is inside the portal dropdown
        const portal = document.getElementById('sc-people-dropdown');
        if (portal && portal.contains(e.target as Node)) return;
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const dropdown = open && results.length > 0 && dropdownPos && createPortal(
    <div id="sc-people-dropdown" style={{
      position: 'fixed',
      top: dropdownPos.top,
      left: dropdownPos.left,
      width: dropdownPos.width,
      zIndex: 10000,
      background: V3.bg.card,
      border: `1px solid ${V3.border.default}`,
      borderRadius: 6,
      maxHeight: 220,
      overflowY: 'auto',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.15)',
      fontFamily: V3_FONT,
    }}>
      {results.map(user => (
        <div
          key={user.email}
          onClick={() => handleSelect(user)}
          style={{
            padding: '8px 10px', cursor: 'pointer', fontSize: 11,
            color: V3.text.primary, borderBottom: `1px solid ${V3.border.subtle}`,
            background: V3.bg.card,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = V3.bg.cardHover)}
          onMouseLeave={e => (e.currentTarget.style.background = V3.bg.card)}
        >
          <div style={{ fontWeight: 500 }}>{user.displayName}</div>
          <div style={{ fontSize: 9, color: V3.text.muted }}>{user.email}</div>
        </div>
      ))}
    </div>,
    document.body,
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        value={query}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '5px 8px', fontSize: 11,
          background: V3.bg.base, color: V3.text.primary,
          border: `1px solid ${V3.border.default}`, borderRadius: 4,
          fontFamily: V3_FONT, outline: 'none',
          boxSizing: 'border-box' as const,
        }}
      />
      {loading && (
        <span style={{ position: 'absolute', right: 8, top: 6, fontSize: 10, color: V3.text.muted }}>...</span>
      )}
      {dropdown}
    </div>
  );
}
