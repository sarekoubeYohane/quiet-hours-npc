import { redactDiagnosticText } from './diagnostic-redaction';

function fieldDiagnostic(field: string, received: unknown, expected: string, secrets: string[]) {
  const value = received === undefined ? '缺少欄位' : JSON.stringify(received);
  const safe = redactDiagnosticText(value, secrets);
  const shown = safe.length > 120 ? safe.slice(0, 119) + '…' : safe;
  const path = redactDiagnosticText(field, secrets);
  const shownPath = path.length > 120 ? path.slice(0, 119) + '…' : path;
  return redactDiagnosticText(`欄位 ${shownPath}：收到 ${shown}，預期 ${expected}。`, secrets);
}

export class DecisionFieldError extends Error {
  constructor(readonly field: string, readonly received: unknown, readonly expected: string, cause?: unknown) {
    super(fieldDiagnostic(field, received, expected, []), { cause });
  }

  diagnostic(secrets: string[]) {
    return fieldDiagnostic(this.field, this.received, this.expected, secrets);
  }
}

export function readDecisionField<T>(field: string, received: unknown, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof DecisionFieldError) throw error;
    const expected = error instanceof Error && error.message ? error.message : '符合此欄位的決策契約';
    throw new DecisionFieldError(field, received, expected, error);
  }
}
