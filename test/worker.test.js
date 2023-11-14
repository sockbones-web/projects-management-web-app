import { expect, test } from 'vitest'
import { getSyncMutationInputs } from '../worker.js'
import { projectQueryResponse } from './data/projectQueryResponse.js'

test('processes an object/response pair correctly', () => {
  const sourceObject = {
    "Comment": "test",
    "Target Date": "Nov 11, 2023 12:00 AM UTC",
    "Scope": "1",
    "Product Area": "Money",
    "Sprint": "Sprint 1"
  };
  const expectedMutationInputs = [
    {
      itemId: "foo",
      projectId: "bar",
      fieldId: "PVTF_lADOCPCr-M4AXz6FzgPOKaE",
      value: { text: "test" },
    },
    {
      itemId: "foo",
      projectId: "bar",
      fieldId: "PVTF_lADOCPCr-M4AXz6FzgPOKaw",
      value: { date: "2023-11-11T00:00:00.000Z" },
    },
    {
      itemId: "foo",
      projectId: "bar",
      fieldId: "PVTF_lADOCPCr-M4AXz6FzgPWR8s",
      value: { number: 1 },
    },
    {
      itemId: "foo",
      projectId: "bar",
      fieldId: "foo",
      value: { singleSelectOptionId: "17ffe46c" },
    },
    {
      itemId: "foo",
      projectId: "bar",
      fieldId: "PVTIF_lADOCPCr-M4AXz6FzgPaVJc",
      value: { iterationId: "893a629d" },
    }
  ];
  const mutationInputs = getSyncMutationInputs(sourceObject, "foo", projectQueryResponse.node.project);
  expect(Object.keys(mutationInputs).length).toBe(5);
  expect(expectedMutationInputs[0]).toMatchObject(mutationInputs[0]);
  expect(mutationInputs[0]).toMatchObject(expectedMutationInputs[0]);
  expect(expectedMutationInputs[1]).toMatchObject(mutationInputs[1]);
  expect(mutationInputs[1]).toMatchObject(expectedMutationInputs[1]);
  expect(expectedMutationInputs[2]).toMatchObject(mutationInputs[2]);
  expect(mutationInputs[2]).toMatchObject(expectedMutationInputs[2]);
  expect(expectedMutationInputs[3]).toMatchObject(mutationInputs[3]);
  expect(mutationInputs[3]).toMatchObject(expectedMutationInputs[3]);
  expect(expectedMutationInputs[4]).toMatchObject(mutationInputs[4]);
  expect(mutationInputs[4]).toMatchObject(expectedMutationInputs[4]);
});
