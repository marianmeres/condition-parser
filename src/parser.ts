import type {
	ConditionDump,
	ConditionJoinOperator,
	ExpressionContext,
} from "@marianmeres/condition-builder";

/**
 * Represents a parsed expression with key, operator, and value.
 * This is used in the metadata returned by the parser.
 */
export interface ExpressionData {
	/** The key/field name of the expression */
	key: string;
	/** The operator (e.g., "eq", "gt", "contains") */
	operator: string;
	/** The value to compare against */
	value: string;
}

/**
 * Metadata about the parsed expressions.
 * Contains arrays of unique keys, operators, values, and full expressions.
 */
export interface Meta {
	/** Array of unique keys found in the parsed expressions */
	keys: string[];
	/** Array of unique operators found in the parsed expressions */
	operators: string[];
	/** Array of unique values found in the parsed expressions */
	values: string[];
	/** Array of unique expressions as {key, operator, value} objects */
	expressions: ExpressionData[];
}

/**
 * A diagnostic record produced when the parser cannot fully consume the input.
 *
 * The parser remains permissive (errors are not thrown to the caller) but they
 * are surfaced here so consumers like validators can distinguish between
 * "trailing free text" and "syntax error mid-expression".
 */
export interface ParseError {
	/** Human-readable error message. */
	message: string;
	/** Zero-based character position in the original input where the error was detected. */
	position: number;
	/** A short slice of the input around `position` (with surrounding context). */
	snippet: string;
}

/**
 * Result returned by {@link ConditionParser.parse}.
 */
export interface ConditionParserResult {
	/**
	 * Array of parsed condition expressions in ConditionDump format.
	 * Compatible with {@link https://github.com/marianmeres/condition-builder | @marianmeres/condition-builder}.
	 */
	parsed: ConditionDump;
	/**
	 * Any trailing text that couldn't be parsed.
	 * Useful for free-text search terms.
	 */
	unparsed: string;
	/**
	 * Metadata about the parsed expressions (unique keys, operators, values).
	 */
	meta: Meta;
	/**
	 * Diagnostic errors collected while parsing. Empty when the input parsed cleanly.
	 *
	 * Note: a non-empty `errors` does not necessarily mean `parsed` is empty —
	 * any successfully parsed prefix is preserved. Consumers wanting strict
	 * validation should check both `errors.length === 0` and `unparsed === ""`.
	 */
	errors: ParseError[];
}

/**
 * Configuration options for the ConditionParser.
 */
export interface ConditionParserOptions {
	/**
	 * The default operator to use when not explicitly specified in the expression.
	 * Defaults to "eq" (equals).
	 * @example "contains", "eq", "gt", etc.
	 */
	defaultOperator: string;

	/**
	 * Enable debug logging to console. Useful for troubleshooting parser behavior.
	 * @default false
	 */
	debug: boolean;

	/**
	 * Transform function applied to each parsed expression before it's added to the output.
	 * Useful for normalizing keys/values or applying custom transformations.
	 * @param context - The parsed expression context
	 * @returns The transformed expression context
	 * @example
	 * ```ts
	 * transform: (ctx) => ({
	 *   ...ctx,
	 *   key: ctx.key.toLowerCase(),
	 *   value: ctx.value.toUpperCase()
	 * })
	 * ```
	 */
	transform: (context: ExpressionContext) => ExpressionContext;

	/**
	 * Hook function called before adding each expression to the output.
	 *
	 * Return the (possibly modified) `ExpressionContext` to keep the expression,
	 * or return `null` / `undefined` to **drop** it from the output.
	 *
	 * When an expression is dropped:
	 * - The expression is omitted from `parsed` and from `meta`.
	 * - The "join to next sibling" operator that was attached to the dropped
	 *   expression is transferred to its predecessor (if any), so the remaining
	 *   chain reflects the user's original logical intent as closely as possible.
	 * - If a parenthesized group ends up with no expressions, the group itself
	 *   is removed from its parent.
	 *
	 * Useful for filtering or routing expressions to a different sink.
	 *
	 * @param context - The parsed expression context
	 * @returns The expression context to add, or `null` / `undefined` to skip
	 * @example
	 * ```ts
	 * preAddHook: (ctx) => {
	 *   if (ctx.key === 'special') return null; // skip this
	 *   return ctx;
	 * }
	 * ```
	 */
	preAddHook: (
		context: ExpressionContext
	) => null | undefined | ExpressionContext;
}

/**
 * Sentinel pushed in place of an item that was skipped by `preAddHook`.
 * It is removed from `out` after `parseTerm` returns; consumers never see it.
 */
const SKIP_MARKER = Symbol("ConditionParser.skip");

/**
 * Internal shape used for "in-flight" condition arrays. Holds the same items as
 * `ConditionDump` plus an occasional `SKIP_MARKER` placeholder during parsing.
 */
type InternalDump = (
	| ConditionDump[number]
	| { __skip: typeof SKIP_MARKER; operator: ConditionJoinOperator }
)[];

/**
 * Human-friendly conditions notation parser for search expressions.
 *
 * Parses expressions like `"key:value"` or `"key:operator:value"` and supports
 * logical operators (`and`, `or`, `and not`, `or not`), parenthesized grouping,
 * quoted strings with escaping, and trailing unparsable content.
 *
 * Designed to work seamlessly with @marianmeres/condition-builder.
 *
 * @example
 * Basic usage:
 * ```ts
 * const result = ConditionParser.parse("foo:bar and baz:bat");
 * // result.parsed contains the parsed conditions
 * // result.unparsed contains any trailing unparsable text
 * ```
 *
 * @example
 * Complex expressions with grouping:
 * ```ts
 * const result = ConditionParser.parse(
 *   '(folder:"my projects" or folder:inbox) foo bar'
 * );
 * ```
 *
 * @example
 * With custom operator:
 * ```ts
 * const result = ConditionParser.parse("age:gt:18 and status:active");
 * ```
 *
 * Internally uses a series of layered parsers, each handling a specific part of the grammar,
 * with logical expressions at the top, basic expressions at the bottom, and parenthesized
 * grouping connecting them recursively.
 */
export class ConditionParser {
	/**
	 * Default operator used when none is specified in the expression.
	 *
	 * Note: this is a writable static for convenience, but mutating it affects
	 * every subsequent `ConditionParser.parse` call in the process. Prefer the
	 * per-call `defaultOperator` option in long-lived processes.
	 *
	 * @default "eq"
	 */
	static DEFAULT_OPERATOR: string = "eq";

	/**
	 * Global debug flag. When true, all parser instances will log debug information.
	 *
	 * Note: this is a writable static for convenience, but mutating it affects
	 * every subsequent `ConditionParser.parse` call in the process. Prefer the
	 * per-call `debug` option in long-lived processes.
	 *
	 * @default false
	 */
	static DEBUG: boolean = false;

	#input: string;
	#pos: number = 0;
	#length: number;
	#defaultOperator: string;
	#debugEnabled: boolean = false;
	#depth: number = -1;

	#meta = {
		keys: new Set<string>(),
		operators: new Set<string>(),
		values: new Set<string>(),
		expressions: new Set<string>(),
	};

	#transform: ConditionParserOptions["transform"];

	#preAddHook: undefined | ConditionParserOptions["preAddHook"];

	private constructor(
		input: string,
		options: Partial<ConditionParserOptions> = {}
	) {
		input = `${input}`.trim();

		const {
			defaultOperator = ConditionParser.DEFAULT_OPERATOR,
			debug = false,
			transform = (c: ExpressionContext) => c,
			preAddHook,
		} = options ?? {};

		this.#input = input;
		this.#length = input.length;
		this.#defaultOperator =
			typeof defaultOperator === "string" && defaultOperator
				? defaultOperator
				: ConditionParser.DEFAULT_OPERATOR;
		this.#debugEnabled = !!debug;

		this.#debug(`[ ${this.#input} ]`, this.#defaultOperator);

		this.#transform = transform;
		if (typeof preAddHook === "function") {
			this.#preAddHook = preAddHook;
		}
	}

	/** Will log debug info if `this.#debugEnabled` */
	#debug(...args: any[]) {
		if (ConditionParser.DEBUG || this.#debugEnabled) {
			if (this.#depth > 0) {
				args = ["->".repeat(this.#depth), ...args];
			}
			console.debug("[ConditionParser]", ...args);
		}
	}

	/**
	 * Public helper for creating formatted error messages with position and context.
	 *
	 * Note: Prefixed with `__` to indicate this is a special-purpose public method
	 * not intended for general use. It's exposed primarily for testing and advanced
	 * use cases.
	 *
	 * @param input - The full input string being parsed
	 * @param pos - The position where the error occurred
	 * @param message - The error message
	 * @param contextRadius - Number of characters to show before/after error position (default: 20)
	 * @returns Error object with formatted message including position and context
	 *
	 * @example
	 * ```ts
	 * const error = ConditionParser.__createError(
	 *   "foo:bar and baz:bat",
	 *   12,
	 *   "Unexpected character",
	 *   20
	 * );
	 * // Error message includes position and visual marker
	 * ```
	 */
	static __createError(
		input: string,
		pos: number,
		message: string,
		contextRadius: number = 20
	): Error {
		const start = Math.max(0, pos - contextRadius);
		const end = Math.min(input.length, pos + contextRadius);
		const snippet = input.slice(start, end);
		const markerPos = pos - start;

		const errorMsg = [
			message,
			`Position: ${pos}`,
			`Context: "${snippet}"`,
			`         ${" ".repeat(markerPos)}^`,
		].join("\n");

		return new Error(errorMsg);
	}

	/**
	 * Creates an error message with position information and context.
	 * Uses the public static helper internally.
	 */
	#createError(message: string): Error {
		return ConditionParser.__createError(this.#input, this.#pos, message);
	}

	/** Will look ahead (if positive) or behind (if negative) based on `offset` */
	#peek(offset: number = 0): string {
		const at = this.#pos + offset;
		return at >= 0 && at < this.#length ? this.#input[at] : "";
	}

	/** Will move the internal cursor one character ahead */
	#consume(): string | null {
		return this.#pos < this.#length ? this.#input[this.#pos++] : null;
	}

	/** Will move the internal cursor at the end of the currently ahead whitespace block. */
	#consumeWhitespace(): void {
		while (this.#pos < this.#length && /\s/.test(this.#peek())) {
			this.#pos++;
		}
	}

	/** Will look ahead to see if there is a single or double quote */
	#isQuoteAhead(): boolean {
		return /['"]/.test(this.#peek());
	}

	#isOpeningParenthesisAhead(): boolean {
		return this.#peek() === "(";
	}

	/** Will test if is at the "end of file" (end of string) */
	#isEOF(): boolean {
		return this.#pos >= this.#length;
	}

	/**
	 * Reads a parenthesized value: `(...)`. Supports balanced nested parens
	 * and backslash escapes for `\(`, `\)`, and `\\`.
	 *
	 * The opening `(` is consumed; the matching closing `)` is consumed too.
	 * The returned string contains everything in between (with escapes resolved).
	 */
	#parseParenthesizedValue(): string {
		this.#debug("parseParenthesizedValue:start");
		// sanity
		if (this.#peek() !== "(") {
			throw this.#createError("Not parenthesized string");
		}

		// Consume opening (
		this.#consume();

		let result = "";
		let depth = 1;

		while (this.#pos < this.#length) {
			const char = this.#consume()!;

			if (char === "\\") {
				const next = this.#peek();
				if (next === "(" || next === ")" || next === "\\") {
					result += next;
					this.#consume();
					continue;
				}
				// Stray backslash — keep literal.
				result += char;
				continue;
			}

			if (char === "(") {
				depth++;
				result += char;
				continue;
			}

			if (char === ")") {
				depth--;
				if (depth === 0) {
					this.#debug(
						"parseParenthesizedValue:result",
						result,
						this.#peek()
					);
					return result;
				}
				result += char;
				continue;
			}

			result += char;
		}

		throw this.#createError("Unterminated parenthesized string");
	}

	/**
	 * Reads a single- or double-quoted string with backslash escapes.
	 * Supports `\\` (literal backslash), `\<quote>` (literal quote of the
	 * matching kind), plus stray backslashes are kept literal.
	 */
	#parseQuotedString(): string {
		this.#debug("parseQuotedString:start");
		// sanity
		if (!this.#isQuoteAhead()) {
			throw this.#createError("Not quoted string");
		}

		// Consume opening quote
		const quote = this.#consume()!;
		let result = "";

		while (this.#pos < this.#length) {
			const char = this.#consume()!;

			if (char === "\\") {
				const next = this.#peek();
				if (next === quote || next === "\\") {
					result += next;
					this.#consume();
					continue;
				}
				// Stray backslash — keep literal.
				result += char;
				continue;
			}

			if (char === quote) {
				this.#debug("parseQuotedString:result", result);
				return result;
			}

			result += char;
		}

		throw this.#createError("Unterminated quoted string");
	}

	/**
	 * Reads an unquoted token, terminated by `:`, `(`, `)`, or whitespace.
	 * Backslash escapes for `\:`, `\\`, `\ ` (space), `\(`, `\)` are supported;
	 * stray backslashes are kept literal.
	 */
	#parseUnquotedString(): string {
		this.#debug("parseUnquotedString:start");
		let result = "";

		while (this.#pos < this.#length) {
			const char = this.#peek();

			if (char === "\\") {
				const next = this.#peek(1);
				if (
					next === ":" ||
					next === "\\" ||
					next === "(" ||
					next === ")" ||
					next === " " ||
					next === "\t"
				) {
					result += next;
					this.#consume(); // backslash
					this.#consume(); // escaped char
					continue;
				}
				// Stray backslash — keep literal and continue.
				result += this.#consume();
				continue;
			}

			if (
				char === ":" ||
				char === "(" ||
				char === ")" ||
				/\s/.test(char)
			) {
				break;
			}

			result += this.#consume();
		}

		result = result.trim();
		this.#debug("parseUnquotedString:result", result);
		return result;
	}

	/**
	 * Tries to parse an `and` / `or` / `and not` / `or not` join operator at
	 * the current position. Returns the matched operator or `null` if none.
	 *
	 * The "not" suffix is only matched when it appears **immediately** after
	 * the join keyword (separated by whitespace), preventing earlier bugs
	 * where `not` anywhere later in the input could capture the cursor.
	 */
	#parseConditionOperator(): ConditionJoinOperator | null {
		this.#debug("parseConditionOperator:start", this.#peek());
		this.#consumeWhitespace();
		const remaining = this.#input.slice(this.#pos);
		let result: ConditionJoinOperator | null = null;

		// Match a "not " (or "not" at EOF would be bogus — require trailing ws).
		const notAfter = (afterIndex: number): number => {
			const slice = remaining.slice(afterIndex);
			const m = /^\s*not(\s+|$)/i.exec(slice);
			return m ? m[0].length : 0;
		};

		if (/^and(\s|$)/i.test(remaining)) {
			this.#pos += 3;
			result = "and";
			const skip = notAfter(3);
			// only treat as "and not" if there is something AFTER the "not " too
			if (skip && remaining.length > 3 + skip) {
				this.#pos += skip;
				result = "andNot";
			} else if (!skip) {
				// require at least one whitespace after "and"
				if (!/^and\s/i.test(remaining)) {
					this.#pos -= 3;
					result = null;
				}
			}
		} else if (/^or(\s|$)/i.test(remaining)) {
			this.#pos += 2;
			result = "or";
			const skip = notAfter(2);
			if (skip && remaining.length > 2 + skip) {
				this.#pos += skip;
				result = "orNot";
			} else if (!skip) {
				if (!/^or\s/i.test(remaining)) {
					this.#pos -= 2;
					result = null;
				}
			}
		}

		this.#debug("parseConditionOperator:result", result);
		return result;
	}

	/** Will parse the key:operator:value segment */
	#parseBasicExpression(
		out: InternalDump,
		currentOperator: ConditionJoinOperator
	) {
		this.#debug("parseBasicExpression:start", currentOperator);

		// so we can restore "unparsed" — any error that escapes this method
		// rewinds the cursor to the start of the token, so the caller surfaces
		// the whole bad expression as `unparsed` (rather than a silently-eaten
		// slice of it).
		const _startPos = this.#pos;

		let key: string;
		let operator: string;
		let value: string;
		let wasParenthesized = false;

		try {
			if (this.#isQuoteAhead()) {
				key = this.#parseQuotedString();
			} else {
				key = this.#parseUnquotedString();
			}

			// Consume the first colon
			this.#consumeWhitespace();
			if (this.#consume() !== ":") {
				throw this.#createError("Expected colon after key");
			}
			this.#consumeWhitespace();

			// Check if we have an operator
			operator = this.#defaultOperator;

			// Try to parse as if we have an operator
			if (this.#isOpeningParenthesisAhead()) {
				wasParenthesized = true;
				value = this.#parseParenthesizedValue();
			} else if (this.#isQuoteAhead()) {
				value = this.#parseQuotedString();
			} else {
				value = this.#parseUnquotedString();
			}

			this.#consumeWhitespace();

			// If we find a colon, what we parsed was actually an operator
			if (this.#peek() === ":") {
				if (wasParenthesized) {
					throw this.#createError(
						"Operator cannot be a parenthesized expression"
					);
				}
				operator = value;
				this.#consume(); // consume the second colon
				this.#consumeWhitespace();

				// Parse the actual value
				if (this.#isOpeningParenthesisAhead()) {
					value = this.#parseParenthesizedValue();
				} else if (this.#isQuoteAhead()) {
					value = this.#parseQuotedString();
				} else {
					value = this.#parseUnquotedString();
				}
			}
		} catch (e) {
			this.#pos = _startPos;
			throw e;
		}

		// Apply transform; we trust the user's transform to return a context.
		const transformed = this.#transform({ key, operator, value });
		const expression: ExpressionContext = transformed ?? { key, operator, value };

		// preAddHook may drop the expression entirely.
		if (this.#preAddHook) {
			const kept = this.#preAddHook(expression);
			if (!kept) {
				this.#debug("parseBasicExpression:preAddHook drop");
				// Push a skip marker; #parseCondition will remove it AFTER it has
				// had a chance to set its operator from the next iteration's
				// conditionOperator. This is essential to correctly transfer the
				// "join to next" operator from the dropped item to its predecessor.
				out.push({
					__skip: SKIP_MARKER,
					operator: currentOperator,
				});
				return;
			}
			// preAddHook may have returned a modified context.
			(expression as any).key = kept.key;
			(expression as any).operator = kept.operator;
			(expression as any).value = kept.value;
		}

		const result = {
			expression,
			operator: currentOperator,
			condition: undefined,
		};
		this.#debug("parseBasicExpression:result", result);

		this.#meta.keys.add(String(expression.key));
		this.#meta.operators.add(String(expression.operator));
		this.#meta.values.add(
			typeof expression.value === "string"
				? expression.value
				: String(expression.value)
		);

		// need to make it unique... so just quick-n-dirty
		this.#meta.expressions.add(
			JSON.stringify([expression.key, expression.operator, expression.value])
		);

		out.push(result);
	}

	/** Will recursively parse (...) */
	#parseParenthesizedExpression(
		out: InternalDump,
		currentOperator: ConditionJoinOperator
	) {
		this.#debug("parseParenthesizedExpression:start", currentOperator);

		// so we can restore "unparsed"
		const _startPos = this.#pos;

		// Consume opening parenthesis
		this.#consume();
		this.#consumeWhitespace();

		// IMPORTANT: we're going deeper, so need to create the nested level
		const nested: InternalDump = [];
		out.push({
			condition: nested as ConditionDump,
			operator: currentOperator,
			expression: undefined,
		});
		this.#parseCondition(nested, currentOperator);

		this.#consumeWhitespace();

		if (this.#peek() !== ")") {
			this.#pos = _startPos;
			throw this.#createError("Expected closing parenthesis");
		}

		// consume closing parenthesis
		this.#consume();

		// If the inner condition ended up empty (e.g. all members were dropped
		// by preAddHook), drop the wrapper too.
		if (nested.length === 0) {
			out.pop();
		}

		this.#debug("parseParenthesizedExpression:result");
	}

	/** Will parse either basic or parenthesized term based on look ahead */
	#parseTerm(out: InternalDump, currentOperator: ConditionJoinOperator) {
		this.#debug("parseTerm:start", currentOperator, this.#peek());
		this.#consumeWhitespace();

		// decision point
		if (this.#peek() === "(") {
			this.#parseParenthesizedExpression(out, currentOperator);
		} else {
			this.#parseBasicExpression(out, currentOperator);
		}

		this.#debug("parseTerm:end", this.#peek());
	}

	/**
	 * Test whether the last entry in `out` is a skip marker (placeholder that
	 * will not survive into the public output).
	 */
	#lastIsSkip(out: InternalDump): boolean {
		const last = out.at(-1) as any;
		return !!last && last.__skip === SKIP_MARKER;
	}

	/** Parses sequences of terms connected by logical operators (and/or) */
	#parseCondition(
		out: InternalDump,
		conditionOperator: ConditionJoinOperator
	): InternalDump {
		this.#depth++;
		this.#consumeWhitespace();

		this.#debug("parseCondition:start", conditionOperator, this.#peek());

		// Parse first term
		this.#parseTerm(out, conditionOperator);

		// If the very first term was a skip placeholder, remove it before the
		// loop runs — it has no predecessor to inherit its operator.
		if (this.#lastIsSkip(out)) out.pop();

		// Parse subsequent terms
		while (true) {
			this.#consumeWhitespace();

			conditionOperator = this.#parseConditionOperator()!;

			// no recognized condition
			if (!conditionOperator) {
				this.#consumeWhitespace();
				// the default "and" is optional...
				if (!this.#isEOF() && this.#peek() !== ")") {
					conditionOperator = "and";
				} else {
					break;
				}
			}

			// "previous" operator edit to match condition-builder convention.
			// If the previous slot is empty (very first term was skipped) skip
			// the assignment — otherwise we set/transfer the operator.
			const prev = out.at(-1);
			const _previousBkp = prev?.operator;
			if (prev) prev.operator = conditionOperator;

			try {
				this.#parseTerm(out, conditionOperator);
			} catch (e) {
				this.#debug(`${e}`);
				// restore on error so the previous chain isn't corrupted
				if (prev) prev.operator = _previousBkp!;
				throw e;
			}

			// If parseTerm pushed a skip marker, the "join to next" operator
			// it would have carried is preserved on the predecessor (whose
			// .operator we just set above). Remove the marker now so the chain
			// stays clean for the next iteration.
			if (this.#lastIsSkip(out)) out.pop();
		}

		this.#depth--;
		return out;
	}

	/**
	 * Scans the input for the first position that could begin a valid condition
	 * expression. Returns that position, or -1 if nothing expression-like exists.
	 *
	 * A candidate start is either:
	 *   - an opening parenthesis `(` (start of a group), or
	 *   - a word / quoted string followed by optional whitespace and `:`.
	 *
	 * Everything before the returned position is surfaced as leading free text
	 * in `unparsed` (combined with any trailing free text).
	 */
	#findFirstExpressionStart(): number {
		const input = this.#input;
		const len = this.#length;
		let i = 0;
		let wordStart = -1;

		while (i < len) {
			const ch = input[i];

			// Paren group is a valid top-level expression start.
			if (ch === "(") return i;

			// Whitespace breaks word tracking.
			if (/\s/.test(ch)) {
				wordStart = -1;
				i++;
				continue;
			}

			// Quoted string: treat the whole run as one "word". If the next
			// non-whitespace after the closing quote is `:`, it's a key.
			if (ch === '"' || ch === "'") {
				const ws = wordStart < 0 ? i : wordStart;
				const quote = ch;
				i++;
				while (i < len && input[i] !== quote) {
					if (input[i] === "\\" && i + 1 < len) i += 2;
					else i++;
				}
				if (i < len) i++; // closing quote
				let j = i;
				while (j < len && /\s/.test(input[j])) j++;
				if (input[j] === ":") return ws;
				wordStart = -1;
				continue;
			}

			// Backslash escape: both chars belong to the current word.
			if (ch === "\\" && i + 1 < len) {
				if (wordStart < 0) wordStart = i;
				i += 2;
				continue;
			}

			// Stray `)` can't start an expression.
			if (ch === ")") {
				wordStart = -1;
				i++;
				continue;
			}

			// A `:` following a word marks a key boundary.
			if (ch === ":") {
				if (wordStart >= 0) return wordStart;
				i++;
				continue;
			}

			// Regular word character.
			if (wordStart < 0) wordStart = i;
			i++;
		}

		return -1;
	}

	/**
	 * Parses a human-friendly search condition string into a structured format.
	 *
	 * @param input - The search expression string to parse
	 * @param options - Optional configuration for parsing behavior
	 * @returns An object containing:
	 *   - `parsed`: Array of parsed condition expressions in ConditionDump format
	 *   - `unparsed`: Any trailing text that couldn't be parsed (useful for free-text search)
	 *   - `meta`: Metadata about the parsed expressions (unique keys, operators, values)
	 *   - `errors`: Diagnostic records collected during parsing (empty when successful)
	 *
	 * @example
	 * Basic parsing:
	 * ```ts
	 * const { parsed, unparsed } = ConditionParser.parse("foo:bar and baz:bat");
	 * ```
	 *
	 * @example
	 * With options:
	 * ```ts
	 * const result = ConditionParser.parse("FOO:bar", {
	 *   defaultOperator: "contains",
	 *   transform: (ctx) => ({ ...ctx, key: ctx.key.toLowerCase() })
	 * });
	 * ```
	 *
	 * @example
	 * Handling unparsed content:
	 * ```ts
	 * const { parsed, unparsed } = ConditionParser.parse(
	 *   "category:books free text search"
	 * );
	 * // parsed: [{ expression: { key: "category", operator: "eq", value: "books" }, ... }]
	 * // unparsed: "free text search"
	 * ```
	 */
	static parse(
		input: string,
		options: Partial<ConditionParserOptions> = {}
	): ConditionParserResult {
		const parser = new ConditionParser(input, options);

		const internal: InternalDump = [];
		let unparsed = "";
		const errors: ParseError[] = [];

		// Empty input is a no-op (avoid throwing "Expected colon after key" at pos 0).
		if (parser.#length > 0) {
			// Locate the first position that could start an expression; anything
			// before it is "leading free text" which we surface as `unparsed`
			// combined (space-joined) with any trailing free text.
			const startPos = parser.#findFirstExpressionStart();

			if (startPos < 0) {
				// No expression-like start anywhere — whole input is free text.
				unparsed = parser.#input;
			} else {
				const leading = parser.#input.slice(0, startPos).trim();
				parser.#pos = startPos;

				try {
					parser.#parseCondition(internal, "and");
				} catch (e) {
					parser.#debug(`${e}`);
					// collect trailing unparsed input
					unparsed = parser.#input.slice(parser.#pos);
					const message = e instanceof Error ? e.message : String(e);
					// First line of `__createError`-formatted messages is the bare cause.
					const firstLine = message.split("\n", 1)[0];
					const start = Math.max(0, parser.#pos - 20);
					const end = Math.min(parser.#input.length, parser.#pos + 20);
					errors.push({
						message: firstLine,
						position: parser.#pos,
						snippet: parser.#input.slice(start, end),
					});
				}

				// Trailing content that wasn't grabbed by the throw path (e.g. an
				// unmatched closing parenthesis at the top level breaks the parse
				// loop without throwing). Surface it as `unparsed` to match the
				// long-standing convention.
				if (!unparsed && parser.#pos < parser.#length) {
					unparsed = parser.#input.slice(parser.#pos);
				}

				// Prepend any leading free text, single-space joined.
				if (leading) {
					unparsed = unparsed ? `${leading} ${unparsed}` : leading;
				}
			}
		}

		// Strip any lingering skip markers (defensive — should never happen).
		const parsed = internal.filter(
			(item: any) => !item || item.__skip !== SKIP_MARKER
		) as ConditionDump;

		return {
			parsed,
			unparsed,
			meta: {
				keys: [...parser.#meta.keys],
				operators: [...parser.#meta.operators],
				values: [...parser.#meta.values],
				expressions: [...parser.#meta.expressions].map((v) => {
					const [key, operator, value] = JSON.parse(v);
					return { key, operator, value };
				}),
			},
			errors,
		};
	}
}
