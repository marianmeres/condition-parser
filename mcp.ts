import { z } from "npm:zod";
import type { McpToolDefinition } from "jsr:@marianmeres/mcp-server/types";
import { ConditionParser } from "./src/mod.ts";

export const tools: McpToolDefinition[] = [
	{
		name: "parse-condition",
		description:
			"Parse a human-friendly condition string (Gmail-style syntax like " +
			'"key:operator:value" with AND/OR/NOT joins and parenthesized grouping) ' +
			"into a structured condition tree",
		params: {
			input: z.string().describe("The condition string to parse"),
			defaultOperator: z
				.string()
				.optional()
				.describe(
					'Default operator when not specified (default: "eq")'
				),
		},
		handler: async (params) => {
			const { input, defaultOperator } = params as {
				input: string;
				defaultOperator?: string;
			};
			const result = ConditionParser.parse(input, {
				...(defaultOperator ? { defaultOperator } : {}),
			});
			return JSON.stringify(result, null, 2);
		},
	},
	{
		name: "validate-condition-syntax",
		description:
			"Validate whether a condition string is syntactically correct and fully parseable",
		params: {
			input: z.string().describe("The condition string to validate"),
			defaultOperator: z
				.string()
				.optional()
				.describe(
					'Default operator when not specified (default: "eq")'
				),
		},
		handler: async (params) => {
			const { input, defaultOperator } = params as {
				input: string;
				defaultOperator?: string;
			};
			const result = ConditionParser.parse(input, {
				...(defaultOperator ? { defaultOperator } : {}),
			});
			return JSON.stringify(
				{
					valid: !result.unparsed.trim(),
					unparsed: result.unparsed || null,
					expressionCount: result.meta.expressions.length,
					keys: result.meta.keys,
					operators: result.meta.operators,
				},
				null,
				2
			);
		},
	},
];
