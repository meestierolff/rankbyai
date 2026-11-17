import { MCP_PAID_TOOLS, MCP_TOOLS } from "@/lib/api-v1/mcp-tools";
import { openApiSpec } from "@/lib/api-v1/openapi";

type Schema = { type?: string | string[]; enum?: unknown[]; default?: unknown; description?: string; format?: string; properties?: Record<string, Schema>; required?: string[]; items?: Schema; $ref?: string };
type Operation = { summary?: string; description?: string; parameters?: { name: string; in: string; required?: boolean; description?: string; schema?: Schema }[]; requestBody?: { content: { "application/json": { schema: Schema } } }; responses: Record<string, { description: string }> };

const typeOf = (s: Schema | undefined): string => {
  if (!s) return "";
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (s.type === "array") return `${typeOf(s.items) || "object"}[]`;
  const t = Array.isArray(s.type) ? s.type.join(" | ") : (s.type ?? "object");
  return s.format ? `${t} (${s.format})` : t;
};

function Fields({ title, rows }: { title: string; rows: { name: string; type: string; required: boolean; note: string }[] }) {
  if (!rows.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] tracking-[0.05em] text-dim uppercase">{title}</span>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-line align-top last:border-0">
                <td className="w-[190px] py-2 pr-3 font-mono text-[13px] text-fg">{r.name}{r.required ? <span className="text-amber"> *</span> : null}</td>
                <td className="w-[200px] py-2 pr-3 font-mono text-[12px] text-dim">{r.type}</td>
                <td className="py-2 text-muted-foreground">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Human-readable reference, rendered from the same OpenAPI document the API serves. */
export function ApiReference({ siteUrl }: { siteUrl: string }) {
  const spec = openApiSpec(siteUrl);
  const paths = spec.paths as unknown as Record<string, Record<string, Operation>>;
  return (
    <div className="flex flex-col gap-5">
      {Object.entries(paths).flatMap(([path, ops]) =>
        Object.entries(ops).map(([method, op]) => {
          const body = op.requestBody?.content["application/json"].schema;
          const note = (s: Schema) => [s.description, s.default !== undefined ? `Default: ${JSON.stringify(s.default)}.` : null].filter(Boolean).join(" ");
          return (
            <section key={`${method} ${path}`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5" aria-label={`${method.toUpperCase()} ${path}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-[6px] px-2 py-1 font-mono text-[12px] font-semibold ${method === "get" ? "bg-g3 text-fg" : "bg-amber text-bg"}`}>{method.toUpperCase()}</span>
                <code className="font-mono text-[15px] text-fg">/api/v1{path}</code>
              </div>
              <h3 className="m-0 text-[17px] font-semibold">{op.summary}</h3>
              {op.description ? <p className="m-0 text-[14px] leading-normal text-muted-foreground">{op.description}</p> : null}
              <Fields title="Parameters" rows={(op.parameters ?? []).map((p) => ({ name: p.name, type: `${typeOf(p.schema)} · ${p.in}`, required: !!p.required, note: [p.description, p.schema?.default !== undefined ? `Default: ${JSON.stringify(p.schema.default)}.` : null].filter(Boolean).join(" ") }))} />
              <Fields title="JSON body" rows={Object.entries(body?.properties ?? {}).map(([name, s]) => ({ name, type: typeOf(s), required: (body?.required ?? []).includes(name), note: note(s) }))} />
              <p className="m-0 text-[13px] text-dim">Responses: {Object.entries(op.responses).map(([code, r]) => `${code} ${r.description}`).join(" · ")}</p>
            </section>
          );
        }),
      )}
    </div>
  );
}

export function McpToolList() {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-x-8 gap-y-2 p-0 text-[14px] sm:grid-cols-2">
      {MCP_TOOLS.map((t) => (
        <li key={t} className="flex items-center gap-2">
          <code className="font-mono text-[13px] text-fg">{t}</code>
          {(MCP_PAID_TOOLS as readonly string[]).includes(t) ? <span className="rounded-full border border-amber/60 px-2 py-[1px] font-mono text-[11px] text-amber">needs confirm</span> : <span className="font-mono text-[11px] text-dim">free</span>}
        </li>
      ))}
    </ul>
  );
}
