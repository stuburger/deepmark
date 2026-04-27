/**
 * The single Y.Doc XmlFragment name that backs the ProseMirror editor for
 * every submission. Defined here so any reader / writer of the doc shares
 * the same key — a typo would silently produce a phantom fragment that
 * the rest of the system never reads from (same class of bug as the
 * STAGE/NEXT_PUBLIC_STAGE mismatch we hit earlier).
 */
export const DOC_FRAGMENT_NAME = "doc"
