/**
 * The Testcontainers PostgreSQL provider is now first-class in the harness.
 * The showcase consumes it through the public `@agent-e2e/harness/testcontainers`
 * subpath instead of maintaining its own copy.
 */
export {
  createPostgresTestcontainersProvider,
  type PostgresClient,
  type PostgresContainerBuilder,
  type PostgresRuntimeLoader,
  type PostgresStackHandle,
  type PostgresTestcontainersProviderConfig,
  type PostgresTestcontainersRuntime,
  type StartedPostgresContainer,
} from "@agent-e2e/harness/testcontainers";
