// deno-lint-ignore-file no-explicit-any

import { ConditionParser } from "../parser.ts";
import { assertEquals } from "@std/assert";
import {
	Condition,
	type ExpressionContext,
} from "@marianmeres/condition-builder";

const DATA: {
	input: string;
	expected: any;
	expectedUnparsed?: string;
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
];

DATA.forEach(
	({ name, input, expected, only, skip, debug, expectedUnparsed }) => {
		if (!skip) {
			Deno.test({
				name: name || input,
				fn: () => {
					const { parsed: actual, unparsed } = ConditionParser.parse(
						input,
						undefined,
						debug
					);
					// console.log(`---\n${input}\nactual`, actual);
					// console.log("expected", expected);
					// console.log("unparsed:", unparsed);

					assertEquals(actual, expected);
					if (expectedUnparsed !== undefined) {
						assertEquals(unparsed, expectedUnparsed);
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
