type Listener = (lines: string[]) => void;

const MAX_LINES = 40;
const lines: string[] = [];
const listeners = new Set<Listener>();

export function log(message: string): void {
  const stamp = new Date().toISOString().slice(11, 23);
  const line = `${stamp} ${message}`;
  // The SPIKE prefix lets `loggingctl log` filter these lines on the device.
  console.log(`[SPIKE] ${line}`);
  lines.unshift(line);
  if (lines.length > MAX_LINES) {
    lines.length = MAX_LINES;
  }
  listeners.forEach((listener) => listener([...lines]));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener([...lines]);
  return () => {
    listeners.delete(listener);
  };
}
