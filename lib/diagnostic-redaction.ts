// Diagnostics use allowlisted projections first. This is a second line of
// defence for credentials echoed into an otherwise legitimate string field.
export const sensitiveDiagnosticKey = /^(authorization|api[_-]?key|cookie|access[_-]?token|refresh[_-]?token)$/i;
export function redactDiagnosticText(text:string,secrets:Iterable<string>):string {
  let clean=text;
  for(const secret of secrets)if(secret) {
    clean=clean.split(secret).join('<REDACTED>');
    clean=clean.split(JSON.stringify(secret).slice(1,-1)).join('<REDACTED>');
  }
  return clean.replace(/\b(Bearer|Basic)\s+[^\s"\\,;]+/gi,'$1 <REDACTED>')
    .replace(/sk-[A-Za-z0-9_-]+/g,'<REDACTED>')
    .replace(/("(?:authorization|api[_-]?key|cookie|access[_-]?token|refresh[_-]?token)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,'$1"<REDACTED>"')
    // A header/assignment may contain spaces (Basic or quoted keys) and
    // semicolons (all Cookie pairs). Mask the whole value, not its first word.
    .replace(/((?:authorization|api[_-]?key|cookie|access[_-]?token|refresh[_-]?token)\s*[=:]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\r\n]*)/gi,'$1<REDACTED>');
}
