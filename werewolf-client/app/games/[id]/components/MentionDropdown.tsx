import React, { useEffect, useRef } from 'react';

interface MentionCandidate {
    name: string;
    isAlive: boolean;
}

interface MentionDropdownProps {
    candidates: MentionCandidate[];
    selectedIndex: number;
    onSelect: (name: string) => void;
    onClose: () => void;
}

export default function MentionDropdown({ candidates, selectedIndex, onSelect, onClose }: MentionDropdownProps) {
    const listRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        if (listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (listRef.current && !listRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    if (candidates.length === 0) return null;

    return (
        <div className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-lg)] shadow-pop z-50">
            <ul ref={listRef} className="py-1">
                {candidates.map((candidate, index) => (
                    <li
                        key={candidate.name}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            onSelect(candidate.name);
                        }}
                        className={`px-3 py-2 cursor-pointer flex items-center justify-between transition-colors duration-[120ms] ${
                            index === selectedIndex
                                ? 'bg-[var(--accent-soft)]'
                                : 'hover:bg-[var(--bg-3)]'
                        }`}
                    >
                        <span className={`text-[13px] text-[var(--fg-0)] ${!candidate.isAlive ? 'line-through opacity-60' : ''}`}>
                            {candidate.name}
                        </span>
                        {!candidate.isAlive && (
                            <span className="text-[11px] text-[var(--fg-3)]">&times;</span>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
