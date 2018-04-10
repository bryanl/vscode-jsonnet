import * as yaml from 'js-yaml';

export const body = (body: string): string => {
  return `<html><body>${body}</body></html>`
}

export const codeLiteral = (code: string): string => {
  return `<pre><code>${code}</code></pre>`
}

export const errorMessage = (message: string): string => {
  return `<i><pre>${message}</pre></i>`;
}

export const prettyPrintObject = (
  json: string, outputFormat: "json" | "yaml"
): string => {
  if (outputFormat == "yaml") {
    return codeLiteral(yaml.safeDump(JSON.parse(json)));
  } else {
    return codeLiteral(JSON.stringify(JSON.parse(json), null, 4));
  }
}