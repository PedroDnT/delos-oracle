```markdown
# delos-oracle Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns used in the `delos-oracle` TypeScript codebase. You'll learn about file naming conventions, import/export styles, commit patterns, and how to write and run tests. This guide is ideal for contributors seeking to maintain consistency and quality in the project.

## Coding Conventions

### File Naming
- **Style:** kebab-case
- **Example:**  
  ```
  price-feed.ts
  oracle-client.ts
  ```

### Import Style
- **Style:** Relative imports
- **Example:**
  ```typescript
  import { getPrice } from './price-feed';
  import { OracleClient } from '../oracle-client';
  ```

### Export Style
- **Style:** Named exports
- **Example:**
  ```typescript
  // In price-feed.ts
  export function getPrice(symbol: string): number { ... }
  export const FEED_VERSION = '1.0.0';
  ```

### Commit Patterns
- **Type:** Freeform (no strict prefix required)
- **Average Length:** 63 characters
- **Example:**
  ```
  Fix bug in price calculation for stablecoins
  Add support for new asset types in oracle client
  ```

## Workflows

### Adding a New Module
**Trigger:** When you need to add a new feature or logical component.
**Command:** `/add-module`

1. Create a new file using kebab-case (e.g., `new-feature.ts`).
2. Use relative imports to include dependencies.
3. Export your functions or constants using named exports.
4. Write corresponding tests in a file named `new-feature.test.ts`.
5. Commit your changes with a descriptive message.

### Updating an Existing Module
**Trigger:** When modifying or extending existing functionality.
**Command:** `/update-module`

1. Locate the relevant module file.
2. Make your changes, maintaining the import/export conventions.
3. Update or add tests as needed.
4. Commit with a clear, descriptive message.

### Running Tests
**Trigger:** To verify code correctness after changes.
**Command:** `/run-tests`

1. Identify test files matching the `*.test.*` pattern.
2. Use the project's test runner (framework not specified; check project scripts).
3. Review test results and fix any failures.

## Testing Patterns

- **Test File Naming:**  
  Place tests in files matching the pattern `*.test.*` (e.g., `oracle-client.test.ts`).
- **Framework:**  
  Not explicitly detected—refer to project documentation or scripts for details.
- **Example:**
  ```typescript
  // oracle-client.test.ts
  import { OracleClient } from './oracle-client';

  test('should fetch price correctly', () => {
    const client = new OracleClient();
    expect(client.getPrice('BTC')).toBeGreaterThan(0);
  });
  ```

## Commands
| Command        | Purpose                                   |
|----------------|-------------------------------------------|
| /add-module    | Scaffold a new module with tests          |
| /update-module | Update an existing module and its tests    |
| /run-tests     | Run all test files in the codebase        |
```
