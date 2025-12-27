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
	values: any[];
	/** Array of unique expressions as {key, operator, value} objects */
	expressions: ExpressionData[];
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
	 * If it returns a falsy value, the expression will be skipped.
	 * Useful for filtering or routing expressions to different destinations.
	 * @param context - The parsed expression context
	 * @returns The expression context to add, or null/undefined to skip
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
	 * @default "eq"
	 */
	static DEFAULT_OPERATOR: string = "eq";

	/**
	 * Global debug flag. When true, all parser instances will log debug information.
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
		keys: new Set<string>([]),
		operators: new Set<string>([]),
		values: new Set<any>([]),
		expressions: new Set<string>([]),
	};

	#transform: ConditionParserOptions["transform"];

	#preAddHook: undefined | ConditionParserOptions["preAddHook"];

	private constructor(
		input: string,
		options: Partial<ConditionParserOptions> = {}
	) {
		input = `${input}`.trim();

		// removing this... makes no sense
		// if (!input) throw new TypeError(`Expecting non empty input`);

		const {
			defaultOperator = ConditionParser.DEFAULT_OPERATOR,
			debug = false,
			transform = (c: ExpressionContext) => c,
			preAddHook,
		} = options ?? {};

		this.#input = input;
		this.#length = input.length;
		this.#defaultOperator = defaultOperator;
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
		return ConditionParser.__createError(
			this.#input,
			this.#pos,
			message
		);
	}

	/** Will look ahead (if positive) or behind (if negative) based on `offset` */
	#peek(offset: number = 0): string {
		const at = this.#pos + offset;
		return at < this.#length ? this.#input[at] : "";
	}

	/** Will move the internal cursor one character ahead */
	#consume(): string | null {
		return this.#pos < this.#length ? this.#input[this.#pos++] : null;
	}

	/** Will move the internal cursor at the end of the currently ahead whitespace block. */
	#consumeWhitespace(): void {
		while (this.#pos < this.#length && /\s/.test(this.#peek())) {
			this.#consume();
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

	#parseParenthesizedValue(): string {
		this.#debug("parseParenthesizedValue:start");
		// sanity
		if (this.#peek() !== "(") {
			throw this.#createError("Not parenthesized string");
		}

		// Consume opening (
		this.#consume();

		let result = "";
		const closing = ")";

		while (this.#pos < this.#length) {
			const char = this.#consume();
			if (char === closing && this.#peek(-2) !== "\\") {
				this.#debug("parseParenthesizedValue:result", result, this.#peek());

				return result;
			}
			if (char === "\\" && this.#peek() === closing) {
				result += closing;
				this.#consume(); // Skip the escaped char
			} else {
				result += char;
			}
		}

		throw this.#createError("Unterminated parenthesized string");
	}

	/** Will parse the currently ahead quoted block with escape support.
	 * Supports both single ' and double " quotes. */
	#parseQuotedString(): string {
		this.#debug("parseQuotedString:start");
		// sanity
		if (!this.#isQuoteAhead()) {
			throw this.#createError("Not quoted string");
		}

		let result = "";
		// Consume opening quote
		const quote = this.#consume();

		while (this.#pos < this.#length) {
			const char = this.#consume();
			if (char === quote && this.#peek(-2) !== "\\") {
				this.#debug("parseQuotedString:result", result);
				return result;
			}
			if (char === "\\" && this.#peek() === quote) {
				result += quote;
				this.#consume(); // Skip the escaped quote
			} else {
				result += char;
			}
		}

		throw this.#createError("Unterminated quoted string");
	}

	/** Will parse the currently ahead unquoted block until delimiter ":", "(", ")", or \s) */
	#parseUnquotedString(): string {
		this.#debug("parseUnquotedString:start");
		let result = "";
		while (this.#pos < this.#length) {
			const char = this.#peek();
			if (
				(char === ":" && this.#peek(-1) !== "\\") ||
				char === "(" ||
				char === ")" ||
				/\s/.test(char)
			) {
				break;
			}
			if (char === "\\" && this.#peek(1) === ":") {
				result += ":";
				this.#consume(); // Skip the backslash
				this.#consume(); // Skip the escaped colon
			} else {
				result += this.#consume();
			}
		}
		result = result.trim();
		this.#debug("parseUnquotedString:result", result);
		return result;
	}

	/** Will parse the "and" or "or" logical operator */
	#parseConditionOperator(
		openingParenthesesLevel?: number
	): ConditionJoinOperator | null {
		this.#debug("parseConditionOperator:start", this.#peek());
		this.#consumeWhitespace();
		const remaining = this.#input.slice(this.#pos);
		let result: ConditionJoinOperator | null = null;

		const _isNotAhead = (s: string) => /\s*not\s+/i.exec(s);

		if (/^and /i.test(remaining)) {
			this.#pos += 4;
			result = "and";

			// maybe followed by "not"?
			const notIsAheadMatch = _isNotAhead(remaining);
			if (notIsAheadMatch) {
				// minus 1, because the initial test includes single trailing whitespace
				this.#pos += notIsAheadMatch[0].length - 1;
				result = "andNot";
			}
		} else if (/^or /i.test(remaining)) {
			this.#pos += 3;
			result = "or";

			// maybe followed by "not"?
			const notIsAheadMatch = _isNotAhead(remaining);
			if (notIsAheadMatch) {
				// minus 1, because the initial test includes single trailing whitespace
				this.#pos += notIsAheadMatch[0].length - 1;
				result = "orNot";
			}
		} else if (openingParenthesesLevel !== undefined) {
			const preLevel = openingParenthesesLevel;
			const postLevel = this.#countSameCharsAhead(")");
			if (preLevel !== postLevel) {
				throw this.#createError(
					`Parentheses level mismatch (opening: ${preLevel}, closing: ${postLevel})`
				);
			}
		}

		this.#debug("parseConditionOperator:result", result);
		return result;
	}

	/** Will parse the key:operator:value segment */
	#parseBasicExpression(
		out: ConditionDump,
		currentOperator: ConditionJoinOperator
	) {
		this.#debug("parseBasicExpression:start", currentOperator);

		// so we can restore "unparsed"
		const _startPos = this.#pos;

		let key;
		if (this.#isQuoteAhead()) {
			key = this.#parseQuotedString();
		} else {
			key = this.#parseUnquotedString();
		}

		// Consume the first colon
		this.#consumeWhitespace();
		if (this.#consume() !== ":") {
			this.#pos = _startPos;
			throw this.#createError("Expected colon after key");
		}
		this.#consumeWhitespace();

		// Check if we have an operator
		let operator = this.#defaultOperator;
		let value;
		let wasParenthesized = false;

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
				this.#pos = _startPos;
				throw this.#createError("Operator cannot be a parenthesized expression");
			}
			operator = value;
			this.#consume(); // consume the second colon
			this.#consumeWhitespace();

			// Parse the actual value
			if (this.#isOpeningParenthesisAhead()) {
				// this.#pos = _startPos;
				// throw new Error("Value cannot be a parenthesized expression");
				value = this.#parseParenthesizedValue();
			} else if (this.#isQuoteAhead()) {
				value = this.#parseQuotedString();
			} else {
				value = this.#parseUnquotedString();
			}
		}

		let expression: undefined | null | ExpressionContext = this.#transform?.({
			key,
			operator,
			value,
		}) ?? {
			key,
			operator,
			value,
		};

		if (typeof this.#preAddHook === "function") {
			expression = this.#preAddHook(expression);
			// return early if hook returned falsey
			if (!expression) {
				this.#debug("parseBasicExpression:preAddHook truthy skip...");
				expression = { key: "1", operator: this.#defaultOperator, value: "1" };
			}
		}

		const result = {
			expression,
			operator: currentOperator,
			condition: undefined,
		};
		this.#debug("parseBasicExpression:result", result);

		this.#meta.keys.add(expression.key);
		this.#meta.operators.add(expression.operator);
		this.#meta.values.add(expression.value);

		// need to make it unique... so just quick-n-dirty
		this.#meta.expressions.add(
			JSON.stringify([expression.key, expression.operator, expression.value])
		);

		out.push(result);
	}

	/** Will recursively parse (...) */
	#parseParenthesizedExpression(
		out: ConditionDump,
		currentOperator: ConditionJoinOperator
	) {
		this.#debug("parseParenthesizedExpression:start", currentOperator);

		// so we can restore "unparsed"
		const _startPos = this.#pos;

		// Consume opening parenthesis
		this.#consume();
		this.#consumeWhitespace();

		// IMPORTANT: we're going deeper, so need to create the nested level
		out.push({
			condition: [],
			operator: currentOperator,
			expression: undefined,
		});
		this.#parseCondition(out.at(-1)!.condition!, currentOperator);

		this.#consumeWhitespace();

		if (this.#peek() !== ")") {
			this.#pos = _startPos;
			throw this.#createError("Expected closing parenthesis");
		}

		// consume closing parenthesis
		this.#consume();

		this.#debug("parseParenthesizedExpression:result");
	}

	/** Will parse either basic or parenthesized term based on look ahead */
	#parseTerm(out: ConditionDump, currentOperator: ConditionJoinOperator) {
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

	/** will count how many same exact consequent `char`s are ahead (excluding whitespace) */
	#countSameCharsAhead(char: string) {
		const posBkp = this.#pos;
		let count = 0;
		let next = this.#consume();
		while (next === char) {
			count++;
			this.#consumeWhitespace();
			next = this.#consume();
		}
		this.#pos = posBkp;
		return count;
	}

	#moveToFirstMatch(regex: RegExp) {
		let bkp = this.#pos;
		let next = this.#consume();
		let match = next && regex.test(next);
		while (match) {
			this.#consumeWhitespace();
			bkp = this.#pos;
			next = this.#consume();
			match = next && regex.test(next);
		}
		this.#pos = bkp;
	}

	/** Parses sequences of terms connected by logical operators (and/or) */
	#parseCondition(
		out: ConditionDump,
		conditionOperator: ConditionJoinOperator,
		openingParenthesesLevel?: number
	): ConditionDump {
		this.#depth++;
		this.#consumeWhitespace();

		this.#debug("parseCondition:start", conditionOperator, this.#peek());

		// Parse first term
		this.#parseTerm(out, conditionOperator);

		// Parse subsequent terms
		while (true) {
			this.#consumeWhitespace();

			conditionOperator = this.#parseConditionOperator(
				openingParenthesesLevel
			)!;

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

			// point here is that we must expect #parseTerm below to fail (trailing
			// unparsable content is legit), so we need to save current operator to
			// be able to restore it
			const _previousBkp = out.at(-1)!.operator;

			// "previous" operator edit to match condition-builder convention
			out.at(-1)!.operator = conditionOperator;

			try {
				this.#parseTerm(out, conditionOperator);
			} catch (e) {
				this.#debug(`${e}`);
				// restore
				out.at(-1)!.operator = _previousBkp;
				// and catch unparsed below
				throw e;
			}
		}

		this.#depth--;
		return out;
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

		let parsed: ConditionDump = [];
		let unparsed = "";

		const openingLevel = parser.#countSameCharsAhead("(");

		try {
			// Start with the highest-level logical expression
			parsed = parser.#parseCondition(parsed, "and", openingLevel);
		} catch (_e) {
			if (options.debug) parser.#debug(`${_e}`);
			// collect trailing unparsed input
			unparsed = parser.#input.slice(parser.#pos);
		}

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
		};
	}
}
