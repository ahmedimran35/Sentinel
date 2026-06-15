import { useState, useEffect, type FunctionComponent } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../theme-context.js';

export interface ModelEntry {
  name: string;
  provider: string;
  context: number;
}

export interface ModelPickerProps {
  models: ModelEntry[];
  selectedModel?: string;
  onSelect: (model: string) => void;
  onClose: () => void;
}

export interface ModelPickerConfig {
  enabled: boolean;
  keybinding: string;
  maxResults: number;
}

export const DEFAULT_MODEL_PICKER_CONFIG: ModelPickerConfig = {
  enabled: true,
  keybinding: 'ctrl+p',
  maxResults: 20,
};

function fuzzyMatch(query: string, text: string): boolean {
  const lower = query.toLowerCase();
  const target = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < lower.length; ti++) {
    if (target[ti] === lower[qi]) qi++;
  }
  return qi === lower.length;
}

function fuzzyScore(query: string, text: string): number {
  const lower = query.toLowerCase();
  const target = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let prevMatch = false;
  for (let ti = 0; ti < target.length && qi < lower.length; ti++) {
    if (target[ti] === lower[qi]) {
      score += prevMatch ? 10 : 5;
      if (ti === 0) score += 3;
      prevMatch = true;
      qi++;
    } else {
      prevMatch = false;
    }
  }
  return qi === lower.length ? score : 0;
}

export const ModelPicker: FunctionComponent<ModelPickerProps> = ({
  models,
  selectedModel,
  onSelect,
  onClose,
}) => {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const scored = query
    ? models
        .map((m) => ({
          model: m,
          score: fuzzyScore(query, m.name) + fuzzyScore(query, m.provider),
        }))
        .filter((entry) => entry.score > 0 || fuzzyMatch(query, entry.model.name) || fuzzyMatch(query, entry.model.provider))
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.model)
    : models;

  const display = scored.slice(0, 20);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      setSelectedIdx((i) => (i > 0 ? i - 1 : display.length - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIdx((i) => (i < display.length - 1 ? i + 1 : 0));
      return;
    }
    if (key.return && display.length > 0) {
      const selected = display[selectedIdx];
      if (selected) onSelect(selected.name);
      return;
    }
  });

  const handleSubmit = (_v: string) => {
    if (display.length > 0) {
      const selected = display[selectedIdx];
      if (selected) onSelect(selected.name);
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.info} paddingX={1} width="100%">
      <Box>
        <Text bold color={theme.info}> {'\u2315'} </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          placeholder="search model name or provider..."
        />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {display.length === 0 && (
          <Box><Text dimColor>No matching models</Text></Box>
        )}
        {display.map((model, i) => {
          const isSelected = model.name === selectedModel;
          const isHighlighted = i === selectedIdx;
          return (
            <Box key={model.name + model.provider}>
              <Text>
                {isHighlighted ? <Text color={theme.info}>{'\u25B8'} </Text> : <Text>  </Text>}
                <Text bold color={isHighlighted ? theme.info : isSelected ? theme.brand : undefined}>
                  {model.name}
                </Text>
                {' '}
                <Text dimColor>{model.provider}</Text>
                {' '}
                <Text color={theme.muted}>{model.context.toLocaleString()} ctx</Text>
                {isSelected && <Text color={theme.success}> {'\u2713'}</Text>}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{'\u2191\u2193'} navigate · Enter select · Esc close</Text>
      </Box>
    </Box>
  );
};

export function createModelList(
  customModels?: ModelEntry[]
): ModelEntry[] {
  const defaultModels: ModelEntry[] = [
    { name: 'claude-sonnet-4-20250514', provider: 'Anthropic', context: 200_000 },
    { name: 'claude-sonnet-3-5', provider: 'Anthropic', context: 200_000 },
    { name: 'claude-opus-4', provider: 'Anthropic', context: 200_000 },
    { name: 'claude-opus-3', provider: 'Anthropic', context: 200_000 },
    { name: 'claude-haiku-3-5', provider: 'Anthropic', context: 200_000 },
    { name: 'gpt-4o', provider: 'OpenAI', context: 128_000 },
    { name: 'gpt-4-turbo', provider: 'OpenAI', context: 128_000 },
    { name: 'o1', provider: 'OpenAI', context: 200_000 },
    { name: 'o3', provider: 'OpenAI', context: 200_000 },
    { name: 'gpt-4.1', provider: 'OpenAI', context: 1_000_000 },
    { name: 'gpt-4', provider: 'OpenAI', context: 8_192 },
    { name: 'deepseek-v4', provider: 'DeepSeek', context: 1_000_000 },
    { name: 'deepseek-v3', provider: 'DeepSeek', context: 128_000 },
    { name: 'deepseek-r1', provider: 'DeepSeek', context: 128_000 },
    { name: 'step-3.7', provider: 'StepFun', context: 256_000 },
    { name: 'gemini-2.5', provider: 'Google', context: 1_000_000 },
    { name: 'gemini-2.0', provider: 'Google', context: 1_000_000 },
    { name: 'gemini-1.5', provider: 'Google', context: 1_000_000 },
    { name: 'llama-3.3', provider: 'Meta', context: 128_000 },
    { name: 'llama-3.2', provider: 'Meta', context: 128_000 },
    { name: 'llama-3.1', provider: 'Meta', context: 128_000 },
    { name: 'llama-3', provider: 'Meta', context: 8_192 },
    { name: 'mistral-large', provider: 'Mistral', context: 128_000 },
    { name: 'mistral-small', provider: 'Mistral', context: 32_000 },
    { name: 'mistral-nemo', provider: 'Mistral', context: 128_000 },
    { name: 'mixtral', provider: 'Mistral', context: 32_000 },
    { name: 'qwen3', provider: 'Qwen', context: 128_000 },
    { name: 'qwen2.5', provider: 'Qwen', context: 128_000 },
    { name: 'nemotron-3', provider: 'NVIDIA', context: 1_000_000 },
    { name: 'codestral', provider: 'Mistral', context: 256_000 },
    { name: 'command-r', provider: 'Cohere', context: 128_000 },
    { name: 'minimax-m2', provider: 'MiniMax', context: 1_000_000 },
    { name: 'minimax-m1', provider: 'MiniMax', context: 256_000 },
    { name: 'glm-5', provider: 'GLM', context: 128_000 },
    { name: 'phi-4', provider: 'Microsoft', context: 128_000 },
    { name: 'phi-3', provider: 'Microsoft', context: 128_000 },
  ];

  if (!customModels || customModels.length === 0) return defaultModels;

  const seen = new Set(customModels.map((m) => m.name));
  return [...customModels, ...defaultModels.filter((m) => !seen.has(m.name))];
}
