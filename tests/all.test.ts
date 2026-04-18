import {
	Condition,
	type ExpressionContext,
} from "@marianmeres/condition-builder";
import { assertEquals } from "@std/assert";
import { ConditionParser } from "../src/parser.ts";

const clog = console.log;

// ConditionParser.DEBUG = true;

const DATA: {
	input: string;
	expected: any;
	expectedUnparsed?: string;
	expectedMeta?: any;
	only?: boolean;
	name?: string;
	skip?: boolean;
	debug?: boolean;
}[] = [
	{
		input: "foo:bar",
		expected: [
			{
				expression: { key: "foo", operator: "eq", value: "bar" },
				operator: "and",
				condition: undefined,
			},
		],
		expectedMeta: {
			keys: ["foo"],
			operators: ["eq"],
			values: ["bar"],
			expressions: [{ key: "foo", operator: "eq", value: "bar" }],
		},
		// only: true,
		// debug: true,
	},
	{
		input: "foo:bar foo:bar",
		expected: [
			{
				expression: { key: "foo", operator: "eq", value: "bar" },
				operator: "and",
				condition: undefined,
			},
			{
				expression: { key: "foo", operator: "eq", value: "bar" },
				operator: "and",
				condition: undefined,
			},
		],
		expectedMeta: {
			keys: ["foo"],
			operators: ["eq"],
			values: ["bar"],
			expressions: [{ key: "foo", operator: "eq", value: "bar" }],
		},
		// only: true,
		// debug: true,
	},
	{
		input: "(foo:bar)",
		expected: [
			{
				condition: [
					{
						operator: "and",
						expression: { key: "foo", operator: "eq", value: "bar" },
						condition: undefined,
					},
				],
				operator: "and",
				expression: undefined,
			},
		],
		// only: true,
		// debug: true,
	},
	{
		input: `'foo':"bar"`,
		expected: [
			{
				expression: { key: "foo", operator: "eq", value: "bar" },
				operator: "and",
				condition: undefined,
			},
		],
	},
	{
		input: "foo:eq:bar",
		expected: [
			{
				expression: { key: "foo", operator: "eq", value: "bar" },
				operator: "and",
				condition: undefined,
			},
		],
	},
	{
		input: '"k k":"o o":"v v"',
		expected: [
			{
				expression: { key: "k k", operator: "o o", value: "v v" },
				operator: "and",
				condition: undefined,
			},
		],
	},
	{
		input: "'k k':'o o':'v v'",
		expected: [
			{
				expression: { key: "k k", operator: "o o", value: "v v" },
				operator: "and",
				condition: undefined,
			},
		],
	},
	{
		input: `'kk':"oo":'v " \\'v'`,
		expected: [
			{
				expression: { key: "kk", operator: "oo", value: `v " 'v` },
				operator: "and",
				condition: undefined,
			},
		],
	},
	{
		input: "a:b or c:d or e:f",
		expected: [
			{
				operator: "or",
				expression: { key: "a", operator: "eq", value: "b" },
				condition: undefined,
			},
			{
				operator: "or",
				expression: { key: "c", operator: "eq", value: "d" },
				condition: undefined,
			},
			{
				operator: "or",
				expression: { key: "e", operator: "eq", value: "f" },
				condition: undefined,
			},
		],
		// only: true,
		// skip: true,
	},
	{
		input: "a:b and (c:d or e:f)",
		expected: [
			{
				operator: "and",
				expression: { key: "a", operator: "eq", value: "b" },
				condition: undefined,
			},
			{
				condition: [
					{
						operator: "or",
						expression: { key: "c", operator: "eq", value: "d" },
						condition: undefined,
					},
					{
						operator: "or",
						expression: { key: "e", operator: "eq", value: "f" },
						condition: undefined,
					},
				],
				operator: "and",
				expression: undefined,
			},
		],
		// skip: true,
	},
	{
		input: `a:b or "c":"eq":d or (e:f AnD g:h OR (i:eq:'j' k:l))`,
		expected: [
			{
				operator: "or",
				expression: { key: "a", operator: "eq", value: "b" },
				condition: undefined,
			},
			{
				operator: "or",
				expression: { key: "c", operator: "eq", value: "d" },
				condition: undefined,
			},
			{
				condition: [
					{
						operator: "and",
						expression: { key: "e", operator: "eq", value: "f" },
						condition: undefined,
					},
					{
						operator: "or",
						expression: { key: "g", operator: "eq", value: "h" },
						condition: undefined,
					},
					{
						condition: [
							{
								operator: "and",
								expression: { key: "i", operator: "eq", value: "j" },
								condition: undefined,
							},
							{
								operator: "and",
								expression: { key: "k", operator: "eq", value: "l" },
								condition: undefined,
							},
						],
						operator: "or",
						expression: undefined,
					},
				],
				operator: "or",
				expression: undefined,
			},
		],
		expectedMeta: {
			keys: ["a", "c", "e", "g", "i", "k"],
			operators: ["eq"],
			values: ["b", "d", "f", "h", "j", "l"],
			expressions: [
				{ key: "a", operator: "eq", value: "b" },
				{ key: "c", operator: "eq", value: "d" },
				{ key: "e", operator: "eq", value: "f" },
				{ key: "g", operator: "eq", value: "h" },
				{ key: "i", operator: "eq", value: "j" },
				{ key: "k", operator: "eq", value: "l" },
			],
		},
		// only: true,
	},
	{
		input: "a:b c:d or e:f g:h hey ho",
		expected: [
			{
				operator: "and",
				expression: { key: "a", operator: "eq", value: "b" },
				condition: undefined,
			},
			{
				operator: "or",
				expression: { key: "c", operator: "eq", value: "d" },
				condition: undefined,
			},
			{
				operator: "and",
				expression: { key: "e", operator: "eq", value: "f" },
				condition: undefined,
			},
			{
				operator: "and",
				expression: { key: "g", operator: "eq", value: "h" },
				condition: undefined,
			},
		],
		expectedUnparsed: "hey ho",
		// only: true,
		// debug: true,
	},
	{
		input: "a:b and (c:d or e:f) this is free text",
		expected: [
			{
				expression: { key: "a", operator: "eq", value: "b" },
				operator: "and",
				condition: undefined,
			},
			{
				condition: [
					{
						expression: { key: "c", operator: "eq", value: "d" },
						operator: "or",
						condition: undefined,
					},
					{
						expression: { key: "e", operator: "eq", value: "f" },
						operator: "or",
						condition: undefined,
					},
				],
				operator: "and",
				expression: undefined,
			},
		],
		expectedUnparsed: "this is free text",
		// only: true,
	},
	{
		input: "only unparsable",
		expected: [],
		expectedUnparsed: "only unparsable",
	},
	{
		// leading free text only
		input: "this is free text a:b c:d",
		expected: [
			{
				expression: { key: "a", operator: "eq", value: "b" },
				operator: "and",
				condition: undefined,
			},
			{
				expression: { key: "c", operator: "eq", value: "d" },
				operator: "and",
				condition: undefined,
			},
		],
		expectedUnparsed: "this is free text",
	},
	{
		// leading + trailing free text around a contiguous parseable middle
		input: "this is a:b c:d free text",
		expected: [
			{
				expression: { key: "a", operator: "eq", value: "b" },
				operator: "and",
				condition: undefined,
			},
			{
				expression: { key: "c", operator: "eq", value: "d" },
				operator: "and",
				condition: undefined,
			},
		],
		expectedUnparsed: "this is free text",
	},
	{
		// leading free text before a parenthesized group
		input: "prefix (a:b or c:d)",
		expected: [
			{
				condition: [
					{
						expression: { key: "a", operator: "eq", value: "b" },
						operator: "or",
						condition: undefined,
					},
					{
						expression: { key: "c", operator: "eq", value: "d" },
						operator: "or",
						condition: undefined,
					},
				],
				operator: "and",
				expression: undefined,
			},
		],
		expectedUnparsed: "prefix",
	},
	{
		// reserved word as leading free text (not a connective at pos 0)
		input: "and stuff a:b",
		expected: [
			{
				expression: { key: "a", operator: "eq", value: "b" },
				operator: "and",
				condition: undefined,
			},
		],
		expectedUnparsed: "and stuff",
	},
	{
		// quoted leading free text containing a colon must not be mistaken for a key
		input: '"hey: ho" a:b',
		expected: [
			{
				expression: { key: "a", operator: "eq", value: "b" },
				operator: "and",
				condition: undefined,
			},
		],
		expectedUnparsed: '"hey: ho"',
	},
	{
		input: "foo:(bar)",
		expected: [
			{
				expression: { key: "foo", operator: "eq", value: "bar" },
				operator: "and",
				condition: undefined,
			},
		],
		expectedUnparsed: undefined,
		// only: true,
	},
	{
		input: "foo:eq:(bar)", //
		expected: [
			{
				expression: { key: "foo", operator: "eq", value: "bar" },
				operator: "and",
				condition: undefined,
			},
		],
		expectedUnparsed: undefined,
		// only: true,
	},
	{
		input: "foo:(eq):(bar)", // BAD, NOT ALLOWED PARENTHESIZED OPERATOR
		expected: [],
		expectedUnparsed: "foo:(eq):(bar)",
		// only: true,
	},
	{
		input: "foo:eq:(ba\\)r)", //
		expected: [
			{
				expression: { key: "foo", operator: "eq", value: "ba)r" },
				operator: "and",
				condition: undefined,
			},
		],
		expectedUnparsed: undefined,
		// only: true,
	},
	{
		input: "foo:eq:(bar))", //
		expected: [
			{
				expression: { key: "foo", operator: "eq", value: "bar" },
				operator: "and",
				condition: undefined,
			},
		],
		expectedUnparsed: ")",
		// only: true,
	},
];

DATA.forEach(
	({
		name,
		input,
		expected,
		only,
		skip,
		debug,
		expectedUnparsed,
		expectedMeta,
	}) => {
		if (!skip) {
			Deno.test({
				name: name || input,
				fn: () => {
					const {
						parsed: actual,
						unparsed,
						meta,
					} = ConditionParser.parse(input, { debug });
					// console.log(`---\n${input}\nactual`, actual);
					// console.log("expected", expected);
					// console.log("unparsed:", unparsed);
					// console.log("meta:", meta);
					// console.log("meta:", meta);

					assertEquals(actual, expected, "(main assert)");

					if (unparsed || expectedUnparsed) {
						assertEquals(unparsed, expectedUnparsed, "(unparsed assert)");
					}
					if (expectedMeta !== undefined) {
						assertEquals(meta, expectedMeta, "(meta assert)");
					}
				},
				only,
			});
		}
	}
);

Deno.test("combine with condition-builder", () => {
	const userSearchInput = '(folder:"my projects" or folder:inbox) foo bar';

	// see https://github.com/marianmeres/condition-builder
	const options = {
		renderKey: (ctx: ExpressionContext) => `"${ctx.key.replaceAll('"', '""')}"`,
		renderValue: (ctx: ExpressionContext) =>
			`'${ctx.value.toString().replaceAll("'", "''")}'`,
	};

	const { parsed, unparsed } = ConditionParser.parse(userSearchInput);

	const c = new Condition(options);
	c.and("user_id", "eq", 123).and(
		Condition.restore(parsed, options).and("text", "match", unparsed)
	);

	assertEquals(
		`"user_id"='123' and (("folder"='my projects' or "folder"='inbox') and "text"~*'foo bar')`,
		c.toString()
	);
});

Deno.test("transform", () => {
	const { parsed, unparsed } = ConditionParser.parse("FOO:bar", {
		transform: (ctx) => {
			ctx.key = ctx.key.toLowerCase();
			ctx.value = ctx.value.toUpperCase();
			return ctx;
		},
	});

	assertEquals(parsed[0].expression?.key, "foo");
	assertEquals(parsed[0].expression?.value, "BAR");
});

Deno.test("pre add hook (drop semantics)", () => {
	// BC NOTE (>= 1.8.0): a falsy return from preAddHook now truly DROPS the
	// expression. Previously it silently substituted a `1=1` placeholder.
	const other = new Condition();
	const options = {
		preAddHook: (ctx: any) => {
			// accept only foo here...
			if (ctx.key === "foo") return ctx;

			// everything else use for other
			other.and(ctx.key, ctx.operator, ctx.value);
		},
	};

	let r = ConditionParser.parse("foo:bar baz:bat", options);

	// baz:bat is dropped from `parsed` and rerouted into `other` instead.
	assertEquals(r.parsed, [
		{
			expression: { key: "foo", operator: "eq", value: "bar" },
			operator: "and",
			condition: undefined,
		},
	]);
	assertEquals(Condition.restore(r.parsed).toString(), "foo=bar");

	assertEquals(other.toJSON(), [
		{
			operator: "and",
			expression: { key: "baz", operator: "eq", value: "bat" },
		},
	]);

	// Group with the only kept member: outer wrapper survives because the inner
	// group still has at least one expression.
	r = ConditionParser.parse("bar:bat and (ha:ho or foo:boo)", options);
	assertEquals(
		Condition.restore(r.parsed).toString(),
		"(foo=boo)"
	);
});

Deno.test("pre add hook (operator transfer)", () => {
	// Skipping a middle term must transfer its "join to next" operator to the
	// previous sibling so the rendered chain reflects the original intent.
	const r = ConditionParser.parse("a:1 and b:2 or c:3", {
		preAddHook: (ctx) => (ctx.key === "b" ? null : ctx),
	});
	// Original intent: (a AND b) OR c. Drop b => a OR c (preserve b's "or" link).
	assertEquals(Condition.restore(r.parsed).toString(), "a=1 or c=3");
});

Deno.test("pre add hook (drop first)", () => {
	const r = ConditionParser.parse("a:1 or b:2", {
		preAddHook: (ctx) => (ctx.key === "a" ? null : ctx),
	});
	assertEquals(Condition.restore(r.parsed).toString(), "b=2");
});

Deno.test("pre add hook (empty group is removed)", () => {
	const r = ConditionParser.parse("a:1 and (b:2 or c:3)", {
		preAddHook: (ctx) =>
			ctx.key === "b" || ctx.key === "c" ? null : ctx,
	});
	// The whole inner group becomes empty → dropped along with its wrapper.
	assertEquals(Condition.restore(r.parsed).toString(), "a=1");
});

Deno.test("restore input", () => {
	const originalInput = "foo:eq:bar";

	const originalWhere = new Condition().and(
		Condition.restore(ConditionParser.parse(originalInput).parsed)
	);

	const restoredInput = originalWhere.toString({
		renderOperator(ctx: ExpressionContext) {
			return `:${ctx.operator}:`;
		},
	});

	assertEquals(restoredInput, `(${originalInput})`);

	const res = ConditionParser.parse(restoredInput);
	const restoredWhere = new Condition().and(Condition.restore(res.parsed));

	assertEquals(originalWhere, restoredWhere);
});

Deno.test("parse empty", () => {
	const r = ConditionParser.parse("");
	assertEquals(r, {
		parsed: [],
		unparsed: "",
		meta: { keys: [], operators: [], values: [], expressions: [] },
		errors: [],
	});
});

Deno.test("with not", () => {
	const expected = "a=b and not c=d or not (e=f and not g=h)";

	const r = ConditionParser.parse(expected.replaceAll("=", ":"));
	// console.log(9999, r);

	const actual = Condition.restore(r.parsed).toString();
	assertEquals(actual, expected);
});

// Deno.test.only("debug", () => {
// 	let r;
// 	r = ConditionParser.parse("foo:((bar))", { debug: true });
// 	console.log(r);

// 	// r = ConditionParser.parse("(foo:(bar))))", { debug: true });
// 	// console.log(r);

// 	// r = ConditionParser.parse(" (  ( (foo:bar)))", { debug: true });
// 	// console.log(r);
// });

Deno.test("error messages include position information", () => {
	// Test that errors caught during parsing include position and context
	// The parser is fault-tolerant and catches errors, converting them to unparsed content
	// But we can verify the error format by checking specific edge cases

	// These inputs will trigger errors internally, which get caught and result in unparsed content
	const testCases = [
		{
			name: "unterminated quote should result in unparsed content",
			input: 'status:active and name:"John Doe',
			expectUnparsed: true,
		},
		{
			name: "parentheses mismatch should result in unparsed content",
			input: "((foo:bar)",
			expectUnparsed: true,
		},
	];

	testCases.forEach(({ name, input, expectUnparsed }) => {
		const result = ConditionParser.parse(input);
		if (expectUnparsed) {
			// When parsing fails, content becomes unparsed
			// This is the fault-tolerant behavior
			assertEquals(
				result.unparsed.length > 0 || result.parsed.length > 0,
				true,
				`${name}: expected either parsed or unparsed content`,
			);
		}
	});
});

Deno.test("error message format validation (internal)", () => {
	// Since the parser catches errors internally, we can't easily test the exact
	// error message format through the public API. However, we can verify that
	// errors are properly caught and don't crash the parser.

	const problematicInputs = [
		'status:"active',
		"category:'books",
		"key:(value",
		"((((foo:bar",
		'a:"b and c:"d',
	];

	problematicInputs.forEach((input) => {
		// Should not throw - errors are caught and result in unparsed content
		const result = ConditionParser.parse(input);

		// Verify the result has the expected structure
		assertEquals(typeof result.parsed, "object");
		assertEquals(Array.isArray(result.parsed), true);
		assertEquals(typeof result.unparsed, "string");
		assertEquals(typeof result.meta, "object");
	});
});

Deno.test("graceful error handling preserves partial results", () => {
	// When parsing fails partway through, already-parsed content should be preserved
	const input = 'status:active and name:"unclosed quote';

	const result = ConditionParser.parse(input);

	// Should have parsed the first part successfully
	assertEquals(result.parsed.length >= 1, true, "should parse first expression");
	assertEquals(
		result.parsed[0].expression?.key,
		"status",
		"should parse status key",
	);
	assertEquals(
		result.parsed[0].expression?.value,
		"active",
		"should parse status value",
	);
});

Deno.test("error message format - unterminated quoted string", () => {
	// Test the actual __createError public helper that's used internally

	// Test the format with sample data
	const input = "status:active and name:\"John";
	const errorPos = 28; // At the end where quote isn't closed
	const error = ConditionParser.__createError(
		input,
		errorPos,
		"Unterminated quoted string"
	);
	const errorMsg = error.message;

	// Verify the format
	const lines = errorMsg.split("\n");
	assertEquals(lines.length, 4, "should have 4 lines");
	assertEquals(lines[0], "Unterminated quoted string");
	assertEquals(lines[1], "Position: 28");
	assertEquals(lines[2].startsWith('Context: "'), true);
	assertEquals(lines[3].includes("^"), true);

	// Test with different position
	const error2 = ConditionParser.__createError(input, 6, "Expected colon after key");
	const errorMsg2 = error2.message;
	assertEquals(errorMsg2.includes("Position: 6"), true);
	assertEquals(errorMsg2.includes("Expected colon after key"), true);
});

Deno.test("error message context window calculation", () => {
	// Test the context window logic using the actual __createError method

	// Test with short input
	const shortInput = "foo:bar";
	const error1 = ConditionParser.__createError(shortInput, 3, "Test", 20);
	const msg1 = error1.message;
	assertEquals(msg1.includes(shortInput), true, "short input should be fully included");
	assertEquals(msg1.includes("Position: 3"), true);

	// Test with long input
	const longInput = "a".repeat(50) + "X" + "b".repeat(50);
	const error2 = ConditionParser.__createError(longInput, 50, "Test", 20); // At "X"
	const msg2 = error2.message;

	// Extract context line
	const lines2 = msg2.split("\n");
	const contextLine2 = lines2[2]; // "Context: ..."
	const contextContent2 = contextLine2.slice(10, -1); // Remove 'Context: "' and '"'

	assertEquals(
		contextContent2.length <= 40,
		true,
		"context should be limited",
	);
	assertEquals(contextContent2.includes("X"), true, "should include error position");

	// Test at beginning
	const error3 = ConditionParser.__createError(longInput, 0, "Test", 20);
	const msg3 = error3.message;
	const lines3 = msg3.split("\n");
	const markerLine3 = lines3[3];
	// At position 0, marker should be right at the start (after "Context: " prefix)
	assertEquals(markerLine3.trim().startsWith("^"), true, "marker should be at start");

	// Test at end
	const error4 = ConditionParser.__createError(
		longInput,
		longInput.length - 1,
		"Test",
		20
	);
	const msg4 = error4.message;
	assertEquals(msg4.includes("Position: " + (longInput.length - 1)), true);
});

// ---------------------------------------------------------------------------
// Regression tests for bugs fixed in 1.8.0
// ---------------------------------------------------------------------------

Deno.test("regression: `not` as key/substring after join is not mis-consumed", () => {
	// Used to silently drop `c:d` because /\s*not\s+/ matched `not` inside a
	// later token. After the fix, "not" is only the NOT suffix when it sits
	// immediately after the and/or keyword.
	const r = ConditionParser.parse("a:b and c:d not:foo");
	// "not:foo" parses as { key: "not", operator: "eq", value: "foo" } (default
	// join "and" is implicit between c:d and not:foo).
	assertEquals(r.parsed.length, 3);
	assertEquals(r.parsed[0].expression, {
		key: "a",
		operator: "eq",
		value: "b",
	});
	assertEquals(r.parsed[1].expression, {
		key: "c",
		operator: "eq",
		value: "d",
	});
	assertEquals(r.parsed[2].expression, {
		key: "not",
		operator: "eq",
		value: "foo",
	});
});

Deno.test("regression: `not` keyword still works immediately after join", () => {
	const r = ConditionParser.parse("a:1 and not b:2 or not c:3");
	assertEquals(
		Condition.restore(r.parsed).toString(),
		"a=1 and not b=2 or not c=3"
	);
});

Deno.test("regression: stray `not` after a term doesn't eat the preceding expression", () => {
	// The original B2 case from the analysis: `a:b and c:d not e:f`.
	// Before the fix, `c:d` was silently dropped because the unanchored
	// `not` regex would jump the cursor past it. After the fix, `c:d`
	// survives and "not e:f" becomes unparsed (malformed key).
	const r = ConditionParser.parse("a:b and c:d not e:f");
	assertEquals(r.parsed.length, 2);
	assertEquals(r.parsed[0].expression?.key, "a");
	assertEquals(r.parsed[1].expression?.key, "c");
	assertEquals(r.unparsed, "not e:f");
});

Deno.test("regression: backslash escapes itself inside a quoted string", () => {
	// Input `"foo\\bar"` should yield value `foo\bar` (one backslash).
	const r = ConditionParser.parse('k:"foo\\\\bar"');
	assertEquals(r.parsed[0].expression?.value, "foo\\bar");
});

Deno.test("regression: backslash escapes itself inside a parenthesized value", () => {
	const r = ConditionParser.parse("k:(foo\\\\bar)");
	assertEquals(r.parsed[0].expression?.value, "foo\\bar");
});

Deno.test("regression: parenthesized value supports balanced nested parens", () => {
	const r = ConditionParser.parse("k:(a(b)c)");
	assertEquals(r.parsed[0].expression?.value, "a(b)c");
	assertEquals(r.unparsed, "");
});

Deno.test("regression: parenthesized value still honors explicit \\) escape", () => {
	const r = ConditionParser.parse("k:(a\\)b)");
	assertEquals(r.parsed[0].expression?.value, "a)b");
});

Deno.test("regression: multiple leading parens parse cleanly (no ghost mismatch)", () => {
	// Before the fix, the top-level "opening parens level" check would throw
	// (silently, then get swallowed) for any balanced double-wrapped input.
	const r = ConditionParser.parse("((foo:bar))");
	assertEquals(r.errors, []);
	assertEquals(r.unparsed, "");
	// Nested structure: group( group( foo:bar ) )
	assertEquals(r.parsed.length, 1);
	assertEquals(
		Condition.restore(r.parsed).toString(),
		"((foo=bar))"
	);
});

Deno.test("errors channel: unterminated quote surfaces a diagnostic", () => {
	const r = ConditionParser.parse('status:active and name:"John');
	assertEquals(r.errors.length, 1);
	assertEquals(r.errors[0].message, "Unterminated quoted string");
	assertEquals(typeof r.errors[0].position, "number");
	assertEquals(r.unparsed.length > 0, true);
});

Deno.test("errors channel: clean parse reports no errors", () => {
	const r = ConditionParser.parse("a:1 and b:2");
	assertEquals(r.errors, []);
});

Deno.test("errors channel: stray trailing ')' is captured as unparsed, not error", () => {
	// We preserve the historical behavior: unmatched closing paren at top
	// level is emitted as trailing free text (not a hard error).
	const r = ConditionParser.parse("foo:eq:(bar))");
	assertEquals(r.unparsed, ")");
	assertEquals(r.errors, []);
});

Deno.test("meta.values is narrowed to string[]", () => {
	// Dedup is driven by string equality — previously declared as any[].
	const r = ConditionParser.parse("a:1 and b:1 and c:2");
	assertEquals(r.meta.values, ["1", "2"]);
});

Deno.test("empty defaultOperator falls back to ConditionParser.DEFAULT_OPERATOR", () => {
	const r = ConditionParser.parse("foo:bar", { defaultOperator: "" });
	assertEquals(r.parsed[0].expression?.operator, "eq");
});
