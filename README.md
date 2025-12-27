# @marianmeres/condition-parser

[![NPM version](https://img.shields.io/npm/v/@marianmeres/condition-parser.svg)](https://www.npmjs.com/package/@marianmeres/condition-parser)
[![JSR version](https://jsr.io/badges/@marianmeres/condition-parser)](https://jsr.io/@marianmeres/condition-parser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Human friendly search conditions notation parser. Somewhat similar to Gmail "Search email" input.

The parsed output is designed to match [condition-builder](https://github.com/marianmeres/condition-builder) 
dump format, so the two play nicely together.

## Installation

deno

```sh
deno add jsr:@marianmeres/condition-parser
```

nodejs

```sh
npm i @marianmeres/condition-parser
```

## Usage

```ts
import { ConditionParser } from "@marianmeres/condition-parser";
```

## Examples

The core parsable expression:

```ts
// for the default "equals" (short "eq") operator
"key:value"
// or with custom operator
"key:operator:value"
```

is parsed internally as

```ts
{ key: "key", operator: "operator", value: "value" }
```

You can join multiple ones with `and` or `or`. The default `and` can be omitted, so:

```ts
"foo:bar baz:bat or hey:ho 'let\'s':go"
```

is equivalent to

```ts
"foo:bar and baz:bat or hey:ho and 'let\'s':go"
```

You can use parentheses to logically group the expressions. 
You can use escaped quotes (or colons) inside the identifiers:

```ts
`"my key":'my \: operator':"my \" value with quotes" and (foo:<:bar or baz:>:bat)`
```

Also, you can append arbitrary unparsable content which will be preserved:

```ts
const result = ConditionParser.parse(
    "a:b and (c:d or e:f) this is free text", 
    options: Partial<ConditionParserOptions> // read below
);

// result is now:
{
    parsed: [
        {
            expression: { key: "a", operator: "eq", value: "b" },
            operator: "and"
        },
        {
            condition: [
                { expression: [{ key: "c", operator: "eq", value: "d" }], operator: "or" },
                { expression: [{ key: "e", operator: "eq", value: "f" }], operator: "or" }
            ],
            operator: "and"
        }
    ],
    unparsed: "this is free text"
}

// ConditionParser.parse options (all optional):
// - defaultOperator: string (default "eq") - operator when not specified
// - debug: boolean (default false) - enable debug logging
// - transform: (ctx) => ctx - transform each parsed expression
// - preAddHook: (ctx) => ctx|null - filter/route expressions before adding
```

See [API.md](./API.md) for complete API documentation.

## In friends harmony with condition-builder

See [condition-builder](https://github.com/marianmeres/condition-builder) for more.

```ts
import { ConditionParser } from "@marianmeres/condition-parser";
import { Condition } from "@marianmeres/condition-builder";

const userSearchInput = '(folder:"my projects" or folder:inbox) foo bar';

const options = {
	renderKey: (ctx) => `"${ctx.key.replaceAll('"', '""')}"`,
	renderValue: (ctx) => `'${ctx.value.toString().replaceAll("'", "''")}'`,
};

const { parsed, unparsed } = ConditionParser.parse(userSearchInput);

const c = new Condition(options);

c.and("user_id", "eq", 123).and(
	Condition.restore(parsed, options).and("text", "match", unparsed),
);

assertEquals(
	`"user_id"='123' and (("folder"='my projects' or "folder"='inbox') and "text"~*'foo bar')`,
	c.toString(),
);
```

## Related

[@marianmeres/condition-builder](https://github.com/marianmeres/condition-builder)
