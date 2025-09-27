import {
	Condition,
	type ExpressionContext,
} from "@marianmeres/condition-builder";
import { assertEquals } from "@std/assert";
import { ConditionParser } from "../parser.ts";

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

Deno.test("pre add hook", () => {
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
	// clog(r);

	// bar is skipped, and moved to second
	assertEquals(r.parsed, [
		{
			expression: { key: "foo", operator: "eq", value: "bar" },
			operator: "and",
			condition: undefined,
		},
		{
			expression: { key: "1", operator: "eq", value: "1" },
			operator: "and",
			condition: undefined,
		},
	]);
	assertEquals(Condition.restore(r.parsed).toString(), "foo=bar and 1=1");

	assertEquals(other.toJSON(), [
		{
			operator: "and",
			expression: { key: "baz", operator: "eq", value: "bat" },
		},
	]);

	//
	r = ConditionParser.parse("bar:bat and (ha:ho or foo:boo)", options);
	assertEquals(
		Condition.restore(r.parsed).toString(),
		"1=1 and (1=1 or foo=boo)"
	);
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

// Deno.test.only("debug", () => {
// 	let r;

// 	// r = ConditionParser.parse("(foo:(bar))))", { debug: true });
// 	// console.log(r);

// 	r = ConditionParser.parse(" (  ( (foo:bar)))", { debug: true });
// 	console.log(r);
// });
