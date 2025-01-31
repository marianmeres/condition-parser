# @marianmeres/condition-parser

Human friendly conditions notation parser. Similar to Gmail's "Search email" input.

The parsed structured output is designed to match [condition-builder](https://github.com/marianmeres/condition-builder) dump
format, so the two play nicely together.

## Installation

deno

```sh
deno add jsr:@marianmeres/condition-parser
```

nodejs

```sh
npx jsr add @marianmeres/condition-parser
```

## Usage

```ts
import { ConditionParser } from "@marianmeres/condition-parser";
```

## Examples

The core parsable expression:

```ts
key: operator: value;
// or (if the operator is omitted the default "eq" will be used)
key: value;
```

is parsed internally as

```ts
{ key: "key", operator: "eq", value: "value" }
```

You can join multiple ones with `and` or `or`. The default `and` can be omitted:

```ts
foo:bar baz:bat or hey:ho
```

is parsed as (omitting the internal structure here)

```ts
foo=bar and baz=bat or hey=ho
```

You can use parentheses to logically group the expressions or quotes inside the
identifiers:

```ts
"my key":'my operator':"my \" value with quotes" and (foo:<:bar or baz:>:bat)
```

You can add unparsable content which will be preserved:

```ts
const result = ConditionParser.parse("a:b and (c:d or e:f) this is free text");
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
```

## Combine with condition-builder

See [condition-builder](https://github.com/marianmeres/condition-builder) for
more.

```ts
import { ConditionParser } from "@marianmeres/condition-parser";
import { Condition } from "@marianmeres/condition-builder";

const userSearchInput = "size:<:1M folder:inbox foo bar";

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
	`"user_id"='123' and ("size"<'1M' and "folder"='inbox' and "text"~*'foo bar')`,
	c.toString(),
);
```
