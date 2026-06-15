import { useState, useRef, useEffect, type FunctionComponent } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../theme-context.js';

export interface ProviderInfo {
  name: string;
  label: string;
}

type WizardStep = 'select-provider' | 'enter-key' | 'fetching' | 'select-model' | 'done';

interface ProviderWizardProps {
  providers: ProviderInfo[];
  onConnect: (provider: string, apiKey: string) => Promise<string[]>;
  onSwitch: (provider: string, model: string) => Promise<void>;
  onClose: () => void;
}

const SPINNERS = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];
const FETCH_WORDS = ['fetching', 'loading', 'connecting', 'querying', 'scanning'];

export const ProviderWizard: FunctionComponent<ProviderWizardProps> = ({ providers, onConnect, onSwitch, onClose }) => {
  const theme = useTheme();
  const [step, setStep] = useState<WizardStep>('select-provider');
  const [selIdx, setSelIdx] = useState(0);
  const [scrollOff, setScrollOff] = useState(0);
  const maxVisible = 12;
  const [apiKey, setApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [spinnerIdx, setSpinnerIdx] = useState(0);
  const spinnerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchWordIdx = useRef(0);

  useEffect(() => {
    return () => { if (spinnerRef.current) clearInterval(spinnerRef.current); };
  }, []);

  useInput((_input, key) => {
    if (step === 'select-provider') {
      if (key.upArrow) {
        setSelIdx((p) => { const n = Math.max(p - 1, 0); if (n < scrollOff) setScrollOff(n); return n; });
        return;
      }
      if (key.downArrow) {
        setSelIdx((p) => { const n = Math.min(p + 1, providers.length - 1); if (n >= scrollOff + maxVisible) setScrollOff(n - maxVisible + 1); return n; });
        return;
      }
      if (key.return) {
        const prov = providers[selIdx];
        if (prov) {
          setSelectedProvider(prov);
          setStep('enter-key');
          setSelIdx(0);
          setScrollOff(0);
        }
        return;
      }
      if (key.escape) { onClose(); return; }
    }

    if (step === 'enter-key') {
      if (key.return && apiKey.length > 0) {
        setStep('fetching');
        setError(null);
        fetchWordIdx.current = Math.floor(Math.random() * FETCH_WORDS.length);
        spinnerRef.current = setInterval(() => setSpinnerIdx((p) => (p + 1) % SPINNERS.length), 120);
        onConnect(selectedProvider!.name, apiKey).then((modelList) => {
          if (spinnerRef.current) clearInterval(spinnerRef.current);
          setModels(modelList.sort());
          setStep('select-model');
          setSelIdx(0);
          setScrollOff(0);
        }).catch((err: Error) => {
          if (spinnerRef.current) clearInterval(spinnerRef.current);
          setError(err.message);
          setStep('enter-key');
        });
        return;
      }
      if (key.escape) { setApiKey(''); setStep('select-provider'); return; }
      if (key.backspace || key.delete) {
        setApiKey((p) => p.slice(0, -1));
        return;
      }
      return;
    }

    if (step === 'select-model') {
      if (key.upArrow) {
        setSelIdx((p) => { const n = Math.max(p - 1, 0); if (n < scrollOff) setScrollOff(n); return n; });
        return;
      }
      if (key.downArrow) {
        setSelIdx((p) => { const n = Math.min(p + 1, models.length - 1); if (n >= scrollOff + maxVisible) setScrollOff(n - maxVisible + 1); return n; });
        return;
      }
      if (key.return) {
        const model = models[selIdx];
        if (model) {
          setStep('done');
          onSwitch(selectedProvider!.name, model).catch(() => {});
          setTimeout(onClose, 1500);
        }
        return;
      }
      if (key.escape) { setStep('enter-key'); setSelIdx(0); setScrollOff(0); return; }
    }
  });

  // Handle key input for API key step
  useInput((input) => {
    if (step === 'enter-key' && input) {
      setApiKey((p) => p + input);
    }
  });

  if (step === 'select-provider') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={theme.info} paddingX={1} width="100%">
        <Box><Text bold color={theme.info}> Select a provider:</Text></Box>
        <Box flexDirection="column" marginTop={1}>
          {providers.slice(scrollOff, scrollOff + maxVisible).map((p, i) => {
            const idx = i + scrollOff;
            return (
              <Box key={p.name}>
                <Text>{idx === selIdx ? <Text color={theme.info}>▸ </Text> : <Text>  </Text>}</Text>
                <Text bold color={idx === selIdx ? theme.info : undefined}>{p.name}</Text>
                <Text dimColor>  {p.label}</Text>
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑↓ navigate · Enter select · Esc cancel</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'enter-key') {
    const masked = apiKey.replace(/./g, '•');
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={theme.info} paddingX={1} width="100%">
        <Box><Text bold color={theme.info}> Paste your {selectedProvider?.label} API key:</Text></Box>
        {error && <Box marginTop={1}><Text color={theme.error}>Error: {error}</Text></Box>}
        <Box marginTop={1}>
          <Text bold color={theme.info}> › </Text>
          <Text>{masked}</Text>
          <Text dimColor>{apiKey.length === 0 ? ' (type or paste key)' : ''}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter confirm · Esc back</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'fetching') {
    const word = FETCH_WORDS[fetchWordIdx.current % FETCH_WORDS.length]!;
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={theme.info} paddingX={1} width="100%">
        <Box>
          <Text color={theme.info}>{SPINNERS[spinnerIdx]}</Text>
          <Text dimColor> {word} models from {selectedProvider?.label}...</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'select-model') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={theme.info} paddingX={1} width="100%">
        <Box><Text bold color={theme.info}> Select a model ({models.length} available):</Text></Box>
        <Box flexDirection="column" marginTop={1}>
          {models.slice(scrollOff, scrollOff + maxVisible).map((m, i) => {
            const idx = i + scrollOff;
            return (
              <Box key={m}>
                <Text>{idx === selIdx ? <Text color={theme.info}>▸ </Text> : <Text>  </Text>}</Text>
                <Text color={idx === selIdx ? theme.info : undefined}>{m}</Text>
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑↓ navigate · Enter select · Esc back</Text>
        </Box>
      </Box>
    );
  }

  if (step === 'done') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={theme.success} paddingX={1} width="100%">
        <Text color={theme.success}>✓ Switched to {selectedProvider?.name} / {models[selIdx]}</Text>
      </Box>
    );
  }

  return null;
};
