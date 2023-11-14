import { expect, test } from 'vitest'
import { parseMarkdown } from '../utils/parseMarkdown'
// import hookData from './data/hookPayload.json'
// import projectData from './data/projectQueryResponse.json'

test('comma delimits multiline responses (so later can be split into an array)', () => {
  const result = parseMarkdown(`
### Stakeholders

@joe

@mike

@jane
  `);
  expect(Object.keys(result).length).toBe(1);
  expect({
    "Stakeholders": "@joe,@mike,@jane",
  }).toMatchObject(result);
});

test('skips "_No response_" entries', () => {
  const result = parseMarkdown(`
### Vault link

_No response_
  `);
  expect(Object.keys(result).length).toBe(0);
  expect({}).toMatchObject(result);
});

test('handles long complex body entries', () => {
  const result = parseMarkdown(`
some non-field text

### Vault link

https://www.shopify.com

### Description

test

### Target Date

_No response_

### Product Area

Money
  `);
  expect(Object.keys(result).length).toBe(3);
  expect({
    "Description": "test",
    "Product Area": "Money",
    "Vault link": "https://www.shopify.com",
  }).toMatchObject(result);
});

test('ignores task lists', () => {
  const result = parseMarkdown(`
### Vault link

https://vault.shopify.io/gsd/projects

### Description

launch a 2024 NY campaign to drive increased funding between December through to February across all capital geos.

### Product Area

Money

\`\`\`[tasklist]
### Tasks
- [ ] https://github.com/Shopify/ms-marketing-fed/issues/2610
\`\`\`

### ZZZ

some data
`);
  expect(Object.keys(result).length).toBe(4);
  expect({
    "Description": "launch a 2024 NY campaign to drive increased funding between December through to February across all capital geos.",
    "Product Area": "Money",
    "Vault link": "https://vault.shopify.io/gsd/projects",
    "ZZZ": "some data",
  }).toMatchObject(result);
});

test('handles newlines in graphql response', () => {
  const result = parseMarkdown(`some non-field text\r\n\r\n### Vault link\r\n\r\nhttps://www.shopify.com\r\n\r\n### Description\r\n\r\ntest\r\n\r\n### Target Date\r\n\r\n_No response_\r\n\r\n### Product Area\r\n\r\nMoney`);
  expect(Object.keys(result).length).toBe(3);
  expect({
    "Description": "test",
    "Product Area": "Money",
    "Vault link": "https://www.shopify.com",
  }).toMatchObject(result);
});

/*
on issue add to board

fetch issue
parse body

fetch fields for current project

for each field from body
  if project fields includes body field
    switch (field type)
      text
        project field value = body field value
      number
        project field value = int.parse(body field value)
      date
        project field value = date.parse(body field value)
      single select
        find match from field definition
      iteration
        ???
*/
