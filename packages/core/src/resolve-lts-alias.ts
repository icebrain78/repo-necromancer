/**
 * Resolves a Node.js LTS codename alias to its major version number.
 *
 * The input is compared case-insensitively. The prefix `lts/` is stripped
 * before lookup so both `"lts/hydrogen"` and `"hydrogen"` resolve correctly.
 *
 * Returns `null` for any string that is not a recognised LTS codename.
 *
 * Pure function — no I/O, no side effects.
 *
 * Sources:
 *   https://github.com/nodejs/Release/blob/main/CODENAMES.md
 */

/** Map from lowercase LTS codename to Node.js major version. */
const LTS_TABLE: Readonly<Record<string, number>> = {
  argon: 4,
  boron: 6,
  carbon: 8,
  dubnium: 10,
  erbium: 12,
  fermium: 14,
  gallium: 16,
  hydrogen: 18,
  iron: 20,
  jod: 22,
};

/**
 * Resolves a Node.js LTS codename (with or without the `lts/` prefix) to the
 * corresponding major version integer.
 *
 * @param alias - A string such as `"lts/hydrogen"`, `"hydrogen"`, or
 *   `"LTS/Iron"`. Case is ignored.
 * @returns The major version integer (e.g. `18` for `"lts/hydrogen"`) or
 *   `null` when the alias is not recognised.
 */
export function resolveLtsAlias(alias: string): number | null {
  const normalised = alias.trim().toLowerCase();

  // Strip the optional "lts/" prefix before looking up the codename.
  const codename = normalised.startsWith('lts/') ? normalised.slice(4) : normalised;

  const major = Object.hasOwn(LTS_TABLE, codename) ? LTS_TABLE[codename] : undefined;
  return major !== undefined ? major : null;
}
