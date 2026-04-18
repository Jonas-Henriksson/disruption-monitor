/**
 * PeoplePicker — Debounced autocomplete for MS Graph directory search.
 * Used in the Act tab to assign actions to team members.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
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

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <input
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
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: V3.bg.card, border: `1px solid ${V3.border.default}`,
          borderRadius: 4, marginTop: 2, maxHeight: 200, overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {results.map(user => (
            <div
              key={user.email}
              onClick={() => handleSelect(user)}
              style={{
                padding: '6px 8px', cursor: 'pointer', fontSize: 11,
                color: V3.text.primary, borderBottom: `1px solid ${V3.border.subtle}`,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = V3.bg.cardHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontWeight: 500 }}>{user.displayName}</div>
              <div style={{ fontSize: 9, color: V3.text.muted }}>{user.email}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
