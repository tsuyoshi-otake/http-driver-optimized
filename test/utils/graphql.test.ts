import { createGraphQLClient } from "../../src/utils/graphql";
import type { HttpDriverInstance, ResponseFormat } from "../../src/types/driver";

function mockDriver(response: ResponseFormat): HttpDriverInstance {
  return {
    execService: jest.fn().mockResolvedValue(response),
    execServiceByFetch: jest.fn().mockResolvedValue(response),
    execServiceByStream: jest.fn(),
    execServiceByNDJSON: jest.fn(),
    getInfoURL: jest.fn(),
  };
}

const okResponse: ResponseFormat = {
  ok: true, status: 200, data: { data: { user: { name: "John" } }, errors: undefined },
  problem: null, originalError: null, duration: 10,
};

describe("createGraphQLClient", () => {
  test("query sends GraphQL request via execService", async () => {
    const driver = mockDriver(okResponse);
    const gql = createGraphQLClient(driver, "graphql");
    const result = await gql.query("query { user { name } }");
    expect(result.ok).toBe(true);
    expect(driver.execService).toHaveBeenCalledWith(
      { id: "graphql" },
      { query: "query { user { name } }", variables: undefined },
      undefined
    );
  });

  test("query with variables", async () => {
    const driver = mockDriver(okResponse);
    const gql = createGraphQLClient(driver, "graphql");
    await gql.query("query($id: ID!) { user(id: $id) { name } }", { id: "1" });
    expect(driver.execService).toHaveBeenCalledWith(
      { id: "graphql" },
      { query: "query($id: ID!) { user(id: $id) { name } }", variables: { id: "1" } },
      undefined
    );
  });

  test("mutation sends via execService", async () => {
    const driver = mockDriver(okResponse);
    const gql = createGraphQLClient(driver, "graphql");
    await gql.mutation("mutation { createUser(name: \"John\") { id } }", { name: "John" });
    expect(driver.execService).toHaveBeenCalled();
  });

  test("useFetch option uses execServiceByFetch", async () => {
    const driver = mockDriver(okResponse);
    const gql = createGraphQLClient(driver, "graphql", { useFetch: true });
    await gql.query("query { users { id } }");
    expect(driver.execServiceByFetch).toHaveBeenCalled();
    expect(driver.execService).not.toHaveBeenCalled();
  });

  test("execute sends raw GraphQL request", async () => {
    const driver = mockDriver(okResponse);
    const gql = createGraphQLClient(driver, "graphql");
    await gql.execute({ query: "query { me { id } }", operationName: "Me" });
    expect(driver.execService).toHaveBeenCalledWith(
      { id: "graphql" },
      { query: "query { me { id } }", operationName: "Me" },
      undefined
    );
  });

  test("passes request options through", async () => {
    const driver = mockDriver(okResponse);
    const gql = createGraphQLClient(driver, "graphql");
    await gql.query("query { me }", undefined, { headers: { "X-Custom": "1" } });
    expect(driver.execService).toHaveBeenCalledWith(
      { id: "graphql" },
      { query: "query { me }", variables: undefined },
      { headers: { "X-Custom": "1" } }
    );
  });
});
