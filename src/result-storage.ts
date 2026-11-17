export function saveResultValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    sessionStorage.removeItem(key);
  } catch {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // The current React state still holds the result when storage is disabled or full.
    }
  }
}

export function readResultValue(key: string) {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) return saved;
  } catch {
    // Try the tab's storage independently.
  }
  try {
    const previous = sessionStorage.getItem(key);
    if (previous !== null) {
      saveResultValue(key, previous);
      return previous;
    }
    return null;
  } catch {
    return null;
  }
}

export function readResult<T>(key: string): T | undefined {
  const value = readResultValue(key);
  try {
    return value === null ? undefined : JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export function saveResult(key: string, result: unknown) {
  saveResultValue(key, JSON.stringify(result));
}

export function saveDownload(filename: string, content: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
