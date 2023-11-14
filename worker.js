import { App } from "@octokit/app";
import { verifyWebhookSignature } from "./lib/verify.js";
import { parseMarkdown } from "./utils/parseMarkdown.js";

// build an array of objects that define the inputs for
// a mutation that'll sync a given set of project fields
// to match the provided input object as closely as possible
export const getSyncMutationInputs = (sourceObject, itemId, project) => {
  console.log("sourceObject:\n" + JSON.stringify(sourceObject, null, 2));
  console.log("itemId:\n" + JSON.stringify(itemId, null, 2));
  console.log("project:\n" + JSON.stringify(project, null, 2));
  let mutationInputs = [];
  for (const [key, value] of Object.entries(sourceObject)) {
    const matchedField = project.fields.nodes.find(field => field.name.toLowerCase() === key.toLowerCase());
    if (matchedField) {
      const input = {
        itemId: itemId,
        projectId: project.id,
        fieldId: matchedField.id,
        value: {},
      };
      switch (matchedField.dataType) {
        case 'TEXT':
          input.value.text = value;
          break;
        case 'DATE':
          input.value.date = new Date(value).toISOString();
          break;
        case 'NUMBER':
          input.value.number = parseInt(value);
          break;
        case 'SINGLE_SELECT':
          const option = matchedField.options.find(option => option.name.toLowerCase() === value.toLowerCase());
          if (!option) continue;
          input.value.singleSelectOptionId = option.id;
          break;
        case 'ITERATION':
          const iteration = matchedField.configuration.iterations.find(iteration => iteration.title.toLowerCase() === value.toLowerCase());
          if (!iteration) continue;
          input.value.iterationId = iteration.id;
          break;
        }
      mutationInputs.push(input);
    }
  }

  return mutationInputs;
}

export const buildMutationQuery = (mutationInputs) => {
  if (Object.keys(mutationInputs).length === 0) {
    return null;
  }

  let mutation = "mutation {\n";
  for (const [index, mutationInput] of mutationInputs.entries()) {
    mutation += `
      update${index}: updateProjectV2ItemFieldValue(
        input: ${JSON.stringify(mutationInput).replace(/"([^"]+)":/g, '$1:')}
      ) { clientMutationId }\n`;
  }
  mutation += "}\n";
  return mutation;
}

export default {
  /**
   * @param {Request} request
   * @param {Record<string, any>} env
   */
  async fetch(request, env) {

    // wrangler secret put APP_ID
    const appId = env.APP_ID;
    // wrangler secret put WEBHOOK_SECRET
    const secret = env.WEBHOOK_SECRET;

    // The private-key.pem file from GitHub needs to be transformed from the
    // PKCS#1 format to PKCS#8, as the crypto APIs do not support PKCS#1:
    //
    //     openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in private-key.pem -out private-key-pkcs8.pem
    //
    // Then set the private key
    //
    //     cat private-key-pkcs8.pem | wrangler secret put PRIVATE_KEY
    //
    const privateKey = env.PRIVATE_KEY;

    // instantiate app
    // https://github.com/octokit/app.js/#readme
    const app = new App({
      appId,
      privateKey,
      webhooks: {
        secret,
      },
    });

    app.webhooks.on("issues.opened", async ({ octokit, payload }) => {
      await octokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: payload.issue.number,
          body:
            "Hello there from [Cloudflare Workers](https://github.com/gr2m/cloudflare-worker-github-app-example/#readme)",
        }
      );
      console.log("HELLO, WORLD! ---> " + payload.repository.name);
    });

    // when an issue is added to a project board, parse the body
    // and use any markdown headings to update the project fields
    app.webhooks.on("projects_v2_item.created", async ({ octokit, payload }) => {
      console.log("projects_v2_item.created\n" + JSON.stringify(payload, null, 2));
      const data = await octokit.graphql(projectsV2ItemCreatedQuery,
        {
          itemId: payload.projects_v2_item.node_id,
        }
      )
      const itemId = payload.projects_v2_item.node_id;
      const parsedMarkdown = parseMarkdown(data.node.content.body);
      const fieldMutationInputs = getSyncMutationInputs(parsedMarkdown, itemId, data.node.project);

      const mutation = buildMutationQuery(fieldMutationInputs);
      console.log("MUTATION -> " + mutation);
      if (mutation) {
        const response = await octokit.graphql(mutation);
      }
    });

    // when an issue is added to a project board, parse the body
    // and use any markdown headings to update the project fields
    app.webhooks.on("projects_v2_item.edited", async ({ octokit, payload }) => {
      console.log("projects_v2_item.edited\n" + JSON.stringify(payload, null, 2));

      // gate this to minimize graphql calls
      if (!["text", "date", "single_select", "iteration", "number"].includes(payload.changes.field_value.field_type)
        || payload.projects_v2_item.content_type !== "Issue") {
        return;
      }

      // 1st query - get project v2 data for issue
      const data = await octokit.graphql(getIssueProjectsQuery,
        {
          contentItemId: payload.projects_v2_item.content_node_id,
          itemId: payload.projects_v2_item.node_id,
        }
      )

      console.log("data -> " + JSON.stringify(data, null, 2));

      // return if nothing to sync
      //   - only one project
      //   - no matching fields on other projects

      if (data.issue.projectItems.nodes.length < 2) {
        return;
      }

      const changedProjectSchema = data.issue.projectItems.nodes.find(projectItem => projectItem.id === payload.projects_v2_item.node_id);
      const changedFieldName = changedProjectSchema.project.fields.nodes.find(field => field.id === payload.changes.field_value.field_node_id).name;

      // remove webhooked project v2 id from list of project v2 ids
      const syncSourceOjbect = {};
      console.log("changedFieldName: " + changedFieldName);

      const changedField = data.projectItem.fieldValues.nodes.find(node => node.field?.name?.toLowerCase() === changedFieldName.toLowerCase());
      console.log("changedField -> " + JSON.stringify(changedField, null, 2));

      switch (changedField["__typename"]) {
        case "ProjectV2ItemFieldTextValue":
          syncSourceOjbect[changedFieldName] = changedField.text;
          break;
        case "ProjectV2ItemFieldDateValue":
          syncSourceOjbect[changedFieldName] = new Date(changedField.date).toDateString();
          break;
        case "ProjectV2ItemFieldNumberValue":
          syncSourceOjbect[changedFieldName] = changedField.number;
          break;
        case "ProjectV2ItemFieldIterationValue":
          syncSourceOjbect[changedFieldName] = changedField.title;
          break;
        case "ProjectV2ItemFieldSingleSelectValue":
          syncSourceOjbect[changedFieldName] = changedField.name;
          break;
      }
      console.log("SOURCEOBJECT -> " + JSON.stringify(syncSourceOjbect, null, 2));

      let fieldMutationInputs = [];
      for (const projectNode of data.issue.projectItems.nodes) {
        console.log("project -> " + JSON.stringify(projectNode, null, 2));

        const itemId = projectNode.id;
        if (projectNode.project.id === payload.projects_v2_item.project_node_id) continue;
        fieldMutationInputs = fieldMutationInputs.concat(getSyncMutationInputs(syncSourceOjbect, itemId, projectNode.project));
      }

      console.log("fieldMutationInputs -> " + JSON.stringify(fieldMutationInputs, null, 2));


      const mutation = buildMutationQuery(fieldMutationInputs);
      console.log("MUTATION -> " + mutation);
      if (mutation) {
        const response = await octokit.graphql(mutation);
      }
    });

    if (request.method === "GET") {
      const { data } = await app.octokit.request("GET /app");

      return new Response(
        `<h1>Cloudflare Worker Example GitHub app</h1>
        <h2>Hello world2</h2>
<p>Installation count: ${data.installations_count}</p>

<p><a href="https://github.com/apps/cloudflare-worker-example">Install</a> | <a href="https://github.com/gr2m/cloudflare-worker-github-app-example/#readme">source code</a></p>`,
        {
          headers: { "content-type": "text/html" },
        }
      );
    }

    const id = request.headers.get("x-github-delivery");
    const name = request.headers.get("x-github-event");
    const signature = request.headers.get("x-hub-signature-256") ?? "";
    const payloadString = await request.text();
    const payload = JSON.parse(payloadString);

    // Verify webhook signature
    try {
      await verifyWebhookSignature(payloadString, signature, secret);
    } catch (error) {
      app.log.warn(error.message);
      return new Response(`{ "error": "${error.message}" }`, {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Now handle the request
    try {
      await app.webhooks.receive({
        id,
        name,
        payload,
      });

      return new Response(`{ "ok": true }`, {
        headers: { "content-type": "application/json" },
      });
    } catch (error) {
      app.log.error(error);

      return new Response(`{ "error": "${error.message}" }`, {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },
};

const projectsV2ItemCreatedQuery = `
query($itemId: ID!) {
  node(id: $itemId) {
    ... on ProjectV2Item {
      content {
        ... on Issue {
          title
          body
        }
      }
      project {
        id
        fields(first:40) {
          nodes {
            ... on ProjectV2Field {
              id
              dataType
              name
            }
            ... on ProjectV2SingleSelectField {
              id
              dataType
              name
              options {
                id
                name
              }
            }
          }
        }
      }
    }
  }
}
`

const projectsV2ItemEditedQuery = `
query ($itemId: ID!) {
  node(id: $itemId) {
    id
    ... on Issue {
      title
      body
      projectItems(first: 5) {
        nodes {
          id
          project {
            id
            fields(first: 40) {
              nodes {
                ... on ProjectV2Field {
                  id
                  dataType
                  name
                }
                ... on ProjectV2IterationField {
                  id
                  dataType
                  name
                  configuration {
                    iterations {
                      id
                      title
                    }
                  }
                }
                ... on ProjectV2SingleSelectField {
                  id
                  dataType
                  name
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`

const projectsV2FieldValuesQuery = `
query ($itemId: ID!) {
  node(id: $itemId) {
    id
    ... on ProjectV2Item {
      fieldValueByName(name: "Scope") {
        __typename
        ... on ProjectV2ItemFieldDateValue {
          date
          field {
            ... on ProjectV2Field {
              name
            }
          }
        }
        ... on ProjectV2ItemFieldTextValue {
          text
        }
        ... on ProjectV2ItemFieldNumberValue {
          number
        }
        ... on ProjectV2ItemFieldIterationValue {
          title
        }
        ... on ProjectV2ItemFieldSingleSelectValue {
          name
        }
      }
    }
  }
}
`

const getIssueProjectsQuery = `
query ($itemId: ID!, $contentItemId: ID!) {
  issue: node(id: $contentItemId) {
    ... on Issue {
      projectItems(first: 5) {
        nodes {
          id
          project {
            id
            fields(last: 20) {
              nodes {
                ... on ProjectV2Field {
                  id
                  dataType
                  name
                }
                ... on ProjectV2IterationField {
                  id
                  dataType
                  name
                  configuration {
                    iterations {
                      id
                      title
                    }
                  }
                }
                ... on ProjectV2SingleSelectField {
                  id
                  dataType
                  name
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  projectItem: node(id: $itemId) {
    id
    ... on ProjectV2Item {
      fieldValues(last: 20) {
        nodes {
          __typename
          ... on ProjectV2ItemFieldDateValue {
            id
            date
            field {
              ... on ProjectV2Field {
                name
              }
            }
          }
          ... on ProjectV2ItemFieldTextValue {
            id
            text
            field {
              ... on ProjectV2Field {
                name
              }
            }
          }
          ... on ProjectV2ItemFieldNumberValue {
            id
            number
            field {
              ... on ProjectV2Field {
                name
              }
            }
          }
          ... on ProjectV2ItemFieldIterationValue {
            id
            title
            field {
              ... on ProjectV2IterationField {
                name
              }
            }
          }
          ... on ProjectV2ItemFieldSingleSelectValue {
            id
            name
            field {
              ... on ProjectV2SingleSelectField {
                name
              }
            }
          }
        }
      }
    }
  }
}
`
