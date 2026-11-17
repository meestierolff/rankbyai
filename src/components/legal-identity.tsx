import { legalEnv } from "@/lib/env";

/** Operator details from LEGAL_* env. Unset values render as a visible placeholder, never as invented text. */
function Value({ value, name }: { value: string; name: string }) {
  return value ? <>{value}</> : <span className="rb-placeholder">{name} not set</span>;
}
export const LegalEntity = () => <Value value={legalEnv.entityName()} name="LEGAL_ENTITY_NAME" />;
export const LegalAddress = () => <Value value={legalEnv.address()} name="LEGAL_ADDRESS" />;
export function LegalEmail() {
  const email = legalEnv.email();
  return email ? <a href={`mailto:${email}`}>{email}</a> : <span className="rb-placeholder">LEGAL_EMAIL not set</span>;
}
export function LegalKvk() {
  const kvk = legalEnv.kvk();
  return kvk ? <> (KVK {kvk})</> : null;
}
