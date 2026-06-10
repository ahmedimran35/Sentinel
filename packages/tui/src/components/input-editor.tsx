import { useState, useRef } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { FunctionComponent } from 'react';

interface InputEditorProps {
  onSubmit: (value: string) => void;
}

export const InputEditor: FunctionComponent<InputEditorProps> = ({ onSubmit }) => {
  const [value, setValue] = useState('');
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);

  const handleSubmit = (v: string) => {
    if (v.trim()) {
      history.current.push(v);
      historyIndex.current = -1;
      onSubmit(v);
      setValue('');
    }
  };

  return (
    <Box borderStyle="single" borderColor="#444" width="100%">
      <Box flexGrow={1}>
        <Text bold color="#d4a76a"> › </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="type a message, @file to attach, /help for commands"
        />
      </Box>
    </Box>
  );
};
