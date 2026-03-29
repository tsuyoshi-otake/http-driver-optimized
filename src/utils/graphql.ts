import type { HttpDriverInstance, ResponseFormat, ServiceUrlCompile } from "../types/driver";

/**
 * GraphQL request payload shape.
 */
export interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
}

/**
 * GraphQL response data shape.
 */
export interface GraphQLResponse<T = unknown> {
  data: T | null;
  errors?: Array<{ message: string; locations?: Array<{ line: number; column: number }>; path?: Array<string | number>; extensions?: Record<string, unknown> }>;
}

/**
 * Creates a GraphQL executor bound to a specific service ID.
 * Uses the driver's execService or execServiceByFetch under the hood.
 *
 * Usage:
 *   const gql = createGraphQLClient(driver, "graphql");
 *   const result = await gql.query<User>(`query { user(id: 1) { name } }`);
 *   const result = await gql.mutation<CreateUserResult>(`mutation { createUser(name: "John") { id } }`);
 */
export function createGraphQLClient(
  driver: HttpDriverInstance,
  serviceId: string,
  options?: { useFetch?: boolean }
) {
  const exec = options?.useFetch
    ? driver.execServiceByFetch.bind(driver)
    : driver.execService.bind(driver);

  const execute = async <T = unknown>(
    request: GraphQLRequest,
    requestOptions?: Record<string, unknown>
  ): Promise<ResponseFormat<GraphQLResponse<T>>> => {
    const idService: ServiceUrlCompile = { id: serviceId };
    return exec<GraphQLResponse<T>>(idService, request as unknown as Record<string, unknown>, requestOptions);
  };

  return {
    execute,

    query: <T = unknown>(
      query: string,
      variables?: Record<string, unknown>,
      requestOptions?: Record<string, unknown>
    ) => execute<T>({ query, variables }, requestOptions),

    mutation: <T = unknown>(
      query: string,
      variables?: Record<string, unknown>,
      requestOptions?: Record<string, unknown>
    ) => execute<T>({ query, variables }, requestOptions),
  };
}
