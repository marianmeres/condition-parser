/**
 * @module
 *
 * Human-friendly search conditions notation parser.
 *
 * Parses expressions like `"key:value"` or `"key:operator:value"` and supports
 * logical operators (`and`, `or`, `and not`, `or not`), parenthesized grouping,
 * quoted strings with escaping, and graceful handling of unparsable content.
 *
 * Designed to work seamlessly with
 * {@link https://github.com/marianmeres/condition-builder | @marianmeres/condition-builder}.
 *
 * @example Basic usage
 * ```ts
 * import { ConditionParser } from "@marianmeres/condition-parser";
 *
 * const result = ConditionParser.parse("foo:bar and baz:bat");
 * // result.parsed contains the parsed conditions
 * // result.unparsed contains any trailing unparsable text
 * // result.meta contains metadata about parsed expressions
 * ```
 *
 * @example With free text
 * ```ts
 * const { parsed, unparsed } = ConditionParser.parse(
 *   "category:books free text search"
 * );
 * // parsed: structured conditions
 * // unparsed: "free text search"
 * ```
 */
export * from "./parser.ts";
