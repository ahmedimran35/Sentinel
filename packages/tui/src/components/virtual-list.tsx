import { Box, Text } from 'ink';
import { useMemo, useState, type ReactNode } from 'react';

interface VirtualListProps<T> {
  items: T[];
  height: number;
  overscan?: number;
  estimatedRowHeight?: number;
  renderItem: (item: T, index: number) => ReactNode;
  scrollTo?: number;
  _onScroll?: (offset: number) => void;
  rowKey?: (item: T, index: number) => string;
}

export function VirtualList<T>({
  items,
  height,
  overscan = 5,
  estimatedRowHeight = 2,
  renderItem,
  scrollTo,
  rowKey,
}: VirtualListProps<T>) {
  const visibleCount = Math.max(5, Math.ceil(height / estimatedRowHeight));
  const [scrollOffset] = useState(scrollTo ? Math.max(0, scrollTo - visibleCount + 1) : 0);
  const scrollPos = scrollTo !== undefined ? Math.max(0, scrollTo - visibleCount + 1) : scrollOffset;

  const startIdx = Math.max(0, scrollPos);
  const endIdx = Math.min(items.length, startIdx + visibleCount + overscan * 2);

  const visibleItems = useMemo(
    () => items.slice(startIdx, endIdx),
    [items, startIdx, endIdx],
  );

  return (
    <Box flexDirection="column" width="100%">
      {startIdx > 0 && (
        <Box justifyContent="center">
          <Text dimColor>{'\u25B2'} {startIdx} more above</Text>
        </Box>
      )}
      {visibleItems.map((item, i) => {
        const idx = startIdx + i;
        return (
          <Box key={rowKey ? rowKey(item, idx) : idx} minHeight={estimatedRowHeight}>
            {renderItem(item, idx)}
          </Box>
        );
      })}
      {endIdx < items.length && (
        <Box justifyContent="center">
          <Text dimColor>{'\u25BC'} {items.length - endIdx} more ({Math.ceil((items.length - endIdx) / visibleCount)} screens)</Text>
        </Box>
      )}
    </Box>
  );
}
