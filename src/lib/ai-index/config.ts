/** Build-time release switch. Changing it requires a rebuild; default is private preview. */
export const AI_INDEX_PUBLIC = process.env.AI_INDEX_PUBLIC === "true";
