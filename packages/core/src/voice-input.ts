import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type TranscribeBackend = 'whisper-cpp' | 'openai-api';

export interface VoiceConfig {
  backend?: TranscribeBackend;
  whisperCppPath?: string;
  whisperModelPath?: string;
  openAiApiKey?: string;
  recordDuration?: number;
  recordDevice?: string;
}

function detectPlatform(): 'darwin' | 'linux' | 'win32' {
  return process.platform as 'darwin' | 'linux' | 'win32';
}

function getRecordCommand(durationSec: number, outPath: string, device?: string): { cmd: string; args: string[] } | null {
  const platform = detectPlatform();
  if (platform === 'darwin') {
    const recPath = spawnSync('which', ['rec']).status === 0 ? 'rec' : null;
    if (recPath) {
      return {
        cmd: recPath,
        args: ['-r', '16000', '-c', '1', '-b', '16', '-e', 'signed-integer', outPath, 'trim', '0', String(durationSec)],
      };
    }
    const ffmpegPath = spawnSync('which', ['ffmpeg']).status === 0 ? 'ffmpeg' : null;
    if (ffmpegPath) {
      return {
        cmd: ffmpegPath,
        args: [
          '-f', 'avfoundation',
          '-i', device ? `:${device}` : ':default',
          '-t', String(durationSec),
          '-ac', '1',
          '-ar', '16000',
          '-sample_fmt', 's16',
          outPath,
          '-y',
        ],
      };
    }
    return null;
  }
  if (platform === 'linux') {
    const arecordPath = spawnSync('which', ['arecord']).status === 0 ? 'arecord' : null;
    if (arecordPath) {
      return {
        cmd: arecordPath,
        args: ['-r', '16000', '-c', '1', '-f', 'S16_LE', '-d', String(durationSec), outPath],
      };
    }
    return null;
  }
  return null;
}

export async function detectVoiceSupport(): Promise<{ available: boolean; recordCmd: string | null }> {
  const cmd = getRecordCommand(1, '/dev/null');
  if (!cmd) return { available: false, recordCmd: null };
  const which = spawnSync('which', [cmd.cmd.split(' ')[0] ?? cmd.cmd]);
  return { available: which.status === 0, recordCmd: cmd.cmd };
}

export async function recordAudio(
  durationSec = 5,
  device?: string,
): Promise<string> {

  const cmd = getRecordCommand(durationSec, join(tmpdir(), `sentinel_record_${randomUUID()}.wav`), device);
  if (!cmd) throw new Error('No audio recording tool found. Install rec (sox) or ffmpeg.');

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd.cmd, cmd.args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(cmd.args[cmd.args.length - 1] ?? outPathFallback(cmd.args));
      } else {
        reject(new Error(`Record failed (exit ${code}): ${stderr.slice(0, 200)}`));
      }
    });
    proc.on('error', reject);
  });
}

function outPathFallback(args: string[]): string {
  return args.find((a) => a.endsWith('.wav') || a.endsWith('.mp3')) ?? 'output.wav';
}

export async function transcribeLocal(
  audioPath: string,
  whisperCppPath: string,
  modelPath: string,
): Promise<string> {

  return new Promise((resolve, reject) => {
    const proc = spawn(whisperCppPath, ['-m', modelPath, '-f', audioPath, '-otxt', '--no-timestamps'], { stdio: 'pipe' });
    let output = '';
    proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(`Whisper.cpp failed (exit ${code})`));
      }
    });
    proc.on('error', reject);
  });
}

export async function transcribeRemote(
  audioPath: string,
  apiKey: string,
): Promise<string> {

  const formData = new FormData();
  const audioBuffer = await import('fs/promises').then((fs) => fs.readFile(audioPath));
  const blob = new Blob([audioBuffer], { type: 'audio/wav' });
  formData.append('file', blob, 'audio.wav');
  formData.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Whisper API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as { text: string };
  return data.text;
}

export async function captureAndTranscribe(
  config: VoiceConfig,
): Promise<string> {

  const audioPath = await recordAudio(config.recordDuration ?? 5, config.recordDevice);
  let text: string;
  try {
    if (config.backend === 'whisper-cpp' && config.whisperCppPath && config.whisperModelPath) {
      text = await transcribeLocal(audioPath, config.whisperCppPath, config.whisperModelPath);
    } else if (config.backend === 'openai-api' && config.openAiApiKey) {
      text = await transcribeRemote(audioPath, config.openAiApiKey);
    } else if (config.openAiApiKey) {
      text = await transcribeRemote(audioPath, config.openAiApiKey);
    } else if (config.whisperCppPath && config.whisperModelPath) {
      text = await transcribeLocal(audioPath, config.whisperCppPath, config.whisperModelPath);
    } else {
      throw new Error('No transcription backend configured. Set OPENAI_API_KEY or configure Whisper.cpp paths.');
    }
  } finally {
    try { unlinkSync(audioPath); } catch { /* ignore */ }
  }
  return text;
}
