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

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (listRef.current && !listRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    if (candidates.length === 0) return null;

    return (
        <div className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto theme-bg-card theme-border border rounded-lg shadow-lg z-50">
            <ul ref={listRef} className="py-1">
                {candidates.map((candidate, index) => (
                    <li
                        key={candidate.name}
                        onMouseDown={(e) => {
                            e.preventDefault(); // Prevent focus loss on textarea
                            onSelect(candidate.name);
                        }}
                        className={`px-4 py-2 cursor-pointer flex items-center justify-between ${
                            index === selectedIndex
                                ? 'bg-blue-100 dark:bg-blue-900/30'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
                        }`}
                    >
                        <span className={`text-sm theme-text-primary ${!candidate.isAlive ? 'line-through opacity-60' : ''}`}>
                            {candidate.name}
                        </span>
                        {!candidate.isAlive && (
                            <span className="text-xs text-gray-500">💀</span>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
