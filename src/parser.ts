// deno-lint-ignore-file no-explicit-any

import type {
	ConditionDump,
	ConditionJoinOperator,
	ExpressionContext,
} from "@marianmeres/condition-builder";

interface Meta {
	keys: string[];
	operators: string[];
	values: any[];
}

/** ConditionParser.parse options */
export interface ConditionParserOptions {
	defaultOperator: string;
	debug: boolean;
	/** If provided, will use the output of this fn as a final parsed expression. */
	transform: (context: ExpressionContext) => ExpressionContext;
	/** Applied as a last step before adding. If returns falsey, will effectively skip
	 * adding. */
	preAddHook: (
		context: ExpressionContext
	) => null | undefined | ExpressionContext;
}

/**
 * Human friendly conditions notation parser. See README.md for examples.
 *
 * Designed to play nicely with @marianmeres/condition-builder.
 *
 * Internally uses series of layered parsers, each handling a specific part of the grammar,
 * with logical expressions at the top, basic expressions at the bottom, and parenthesized
 * grouping connecting them recursively.
 */
export class ConditionParser {
	static DEFAULT_OPERATOR = "eq";

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
	};

	#transform: ConditionParserOptions["transform"];

	#preAddHook: undefined | ConditionParserOptions["preAddHook"];

	private constructor(
		input: string,
		options: Partial<ConditionParserOptions> = {}
	) {
		input = `${input}`.trim();
		if (!input) throw new TypeError(`Expecting non empty input`);

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
		if (this.#debugEnabled) {
			if (this.#depth > 0) {
				args = ["->".repeat(this.#depth), ...args];
			}
			console.debug("[ConditionParser]", ...args);
		}
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

	/** Will test if is at the "end of file" (end of string) */
	#isEOF(): boolean {
		return this.#pos >= this.#length;
	}

	/** Will parse the currently ahead quoted block with escape support.
	 * Supports both single ' and double " quotes. */
	#parseQuotedString(): string {
		this.#debug("parseQuotedString:start");
		// sanity
		if (!this.#isQuoteAhead()) {
			throw new Error("Not quoted string");
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

		throw new Error("Unterminated quoted string");
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
	#parseConditionOperator(): ConditionJoinOperator | null {
		this.#debug("parseConditionOperator:start");
		this.#consumeWhitespace();
		const remaining = this.#input.slice(this.#pos);
		let result: ConditionJoinOperator | null = null;

		if (/^and /i.test(remaining)) {
			this.#pos += 4;
			result = "and";
		} else if (/^or /i.test(remaining)) {
			this.#pos += 3;
			result = "or";
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
			throw new Error("Expected colon after key");
		}
		this.#consumeWhitespace();

		// Check if we have an operator
		let operator = this.#defaultOperator;
		let value;

		// Try to parse as if we have an operator
		if (this.#isQuoteAhead()) {
			value = this.#parseQuotedString();
		} else {
			value = this.#parseUnquotedString();
		}

		this.#consumeWhitespace();

		// If we find a colon, what we parsed was actually an operator
		if (this.#peek() === ":") {
			operator = value;
			this.#consume(); // consume the second colon
			this.#consumeWhitespace();

			// Parse the actual value
			if (this.#peek() === "(") {
				this.#pos = _startPos;
				throw new Error("Value cannot be a parenthesized expression");
			}
			if (this.#isQuoteAhead()) {
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
			throw new Error("Expected closing parenthesis");
		}

		// consume closing parenthesis
		this.#consume();

		this.#debug("parseParenthesizedExpression:result");
	}

	/** Will parse either basic or parenthesized term based on look ahead */
	#parseTerm(out: ConditionDump, currentOperator: ConditionJoinOperator) {
		this.#debug("parseTerm", currentOperator);
		this.#consumeWhitespace();

		// decision point
		if (this.#peek() === "(") {
			this.#parseParenthesizedExpression(out, currentOperator);
		} else {
			this.#parseBasicExpression(out, currentOperator);
		}
	}

	/** Parses sequences of terms connected by logical operators (and/or) */
	#parseCondition(
		out: ConditionDump,
		conditionOperator: ConditionJoinOperator
	): ConditionDump {
		this.#depth++;
		this.#debug("parseCondition:start", conditionOperator);

		// Parse first term
		this.#parseTerm(out, conditionOperator);

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

			// point here is that we must expect #parseTerm below to fail (trailing
			// unparsable content is legit), so we need to save current operator to
			// be able to restore it
			const _previousBkp = out.at(-1)!.operator;

			// "previous" operator edit to match condition-builder convention
			out.at(-1)!.operator = conditionOperator;

			try {
				this.#parseTerm(out, conditionOperator);
			} catch (e) {
				// restore
				out.at(-1)!.operator = _previousBkp;
				// and catch unparsed below
				throw e;
			}
		}

		this.#depth--;
		return out;
	}

	/** Main api. Will parse the provided input. */
	static parse(
		input: string,
		options: Partial<ConditionParserOptions> = {}
	): { parsed: ConditionDump; unparsed: string; meta: Meta } {
		const parser = new ConditionParser(input, options);

		let parsed: ConditionDump = [];
		let unparsed = "";

		try {
			// Start with the highest-level logical expression
			parsed = parser.#parseCondition(parsed, "and");
		} catch (_e) {
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
			},
		};
	}
}
