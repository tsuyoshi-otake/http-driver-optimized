"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGraphQLClient = createGraphQLClient;
/**
 * Creates a GraphQL executor bound to a specific service ID.
 * Uses the driver's execService or execServiceByFetch under the hood.
 *
 * Usage:
 *   const gql = createGraphQLClient(driver, "graphql");
 *   const result = await gql.query<User>(`query { user(id: 1) { name } }`);
 *   const result = await gql.mutation<CreateUserResult>(`mutation { createUser(name: "John") { id } }`);
 */
function createGraphQLClient(driver, serviceId, options) {
    const exec = (options === null || options === void 0 ? void 0 : options.useFetch)
        ? driver.execServiceByFetch.bind(driver)
        : driver.execService.bind(driver);
    const execute = async (request, requestOptions) => {
        const idService = { id: serviceId };
        return exec(idService, request, requestOptions);
    };
    return {
        execute,
        query: (query, variables, requestOptions) => execute({ query, variables }, requestOptions),
        mutation: (query, variables, requestOptions) => execute({ query, variables }, requestOptions),
    };
}
