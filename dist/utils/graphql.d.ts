import type { HttpDriverInstance, ResponseFormat } from "../types/driver";
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
    errors?: Array<{
        message: string;
        locations?: Array<{
            line: number;
            column: number;
        }>;
        path?: Array<string | number>;
        extensions?: Record<string, unknown>;
    }>;
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
export declare function createGraphQLClient(driver: HttpDriverInstance, serviceId: string, options?: {
    useFetch?: boolean;
}): {
    execute: <T = unknown>(request: GraphQLRequest, requestOptions?: Record<string, unknown>) => Promise<ResponseFormat<GraphQLResponse<T>>>;
    query: <T = unknown>(query: string, variables?: Record<string, unknown>, requestOptions?: Record<string, unknown>) => Promise<ResponseFormat<GraphQLResponse<T>>>;
    mutation: <T = unknown>(query: string, variables?: Record<string, unknown>, requestOptions?: Record<string, unknown>) => Promise<ResponseFormat<GraphQLResponse<T>>>;
};
