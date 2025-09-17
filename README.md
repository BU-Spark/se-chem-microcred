This is a template for Spark! DS 519 projects. It has pre-configured eslint.config.mjs - ([`ESLint`](https://eslint.org/)) and .prettierrc - ([`Prettier`](https://prettier.io/)) to reflect industry standard development guidelines.

## Setting Up Your Developer Experience

To get the most out of ESLint and Prettier, It is recommended to make the changes to you IDE:

#### Add this code to your _.vscode/settings.json_

```json
{
  "editor.formatOnSave": true,
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

#### Download these VSCode extensions:

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Getting Started

This template uses Next.js. If you havent used Next before or need more information, take a look here:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

To run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the result. Do not use Microsoft Edge 🤮

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Testing Your Application

This template comes pre-configured with a robust testing setup to help you ensure code quality and maintainability. We use [Jest](https://jestjs.io/) as the testing framework and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) for testing React components.

<details>
  <summary><strong>Key Testing Features & Configuration</strong></summary>

#### Integrated Tools

- **Jest:** A delightful JavaScript Testing Framework with a focus on simplicity. It works out of the box for most Next.js projects.
- **React Testing Library (RTL):** Provides light-weight utility functions on top of `react-dom` and `react-dom/test-utils`, in a way that encourages better testing practices. Its primary guiding principle is: _"The more your tests resemble the way your software is used, the more confidence they can give you."_
- **`@testing-library/jest-dom`:** Custom Jest matchers to extend Jest with useful assertions for DOM states (e.g., `toBeInTheDocument()`, `toHaveClass()`).

#### Configuration Files

- **`jest.config.ts`:** The main configuration file for Jest. It defines how Jest discovers and runs your tests, what environment to use (e.g., `jsdom` for browser-like environment), and any transformations needed (e.g., using `ts-node` for TypeScript).
- **`jest.setup.ts`:** This file is run before each test suite. It's used for global test setup, such as importing `@testing-library/jest-dom` to make its matchers available in all tests, or for setting up global mocks (like the `window.matchMedia` mock included in this template).

#### Test File Location

- Tests are co-located with the components or modules they are testing. For example, tests for `MyComponent.tsx` would typically be in a file named `MyComponent.test.tsx` within the same directory. This makes it easy to find and manage tests alongside the code they cover. Our `jest.config.ts` is set up to discover these `*.test.tsx` (and `*.test.ts`) files.

</details>

<details>
  <summary><strong>Running Tests</strong></summary>

You can run your tests using the following npm scripts:

- **`npm test`**: Runs all tests once. This is also the command used by the automated pre-commit and pre-push hooks.
  ```bash
  npm test
  ```
- **`npm run test:watch`**: Runs tests in watch mode. Jest will re-run tests related to changed files, which is very useful during development.
  ```bash
  npm run test:watch
  ```
- **`npm run test:coverage`**: Runs all tests and generates a code coverage report. This helps you see what percentage of your codebase is covered by tests. The report will be generated in a `coverage/` directory.
  ```bash
  npm run test:coverage
  ```
  </details>

<details>
  <summary><strong>Automated Testing with Husky</strong></summary>

To maintain code quality and prevent regressions, this template uses [Husky](https://typicode.github.io/husky/) to manage Git hooks. The following hooks are configured:

- **`pre-commit`**: Before any commit is finalized, this hook runs:

  1.  `npx lint-staged`: Lints and formats staged files (`*.{js,jsx,ts,tsx}`) using ESLint and Prettier.
  2.  `npm test`: Runs the entire test suite.
      If either linting/formatting fails or any test fails, the commit will be aborted, allowing you to fix the issues before committing.

- **`pre-push`**: Before any push to a remote repository, this hook runs:
  1.  `npm test`: Runs the entire test suite.
      If any test fails, the push will be aborted.

This ensures that your codebase remains well-formatted, lint-free, and that all tests are passing before changes are shared or integrated.

</details>

<details>
  <summary><strong>Testing Philosophy</strong></summary>

- **Focus on User Behavior:** Write tests that verify the functionality of your components from a user's perspective. React Testing Library encourages this by providing utilities to query and interact with the DOM in a way similar to how a user would.
- **Unit & Integration Tests:** Aim for a healthy mix of unit tests (testing individual functions or components in isolation) and integration tests (testing how multiple components work together).
- **Confidence, Not Coverage Alone:** While code coverage is a useful metric, the primary goal of testing is to give you confidence that your application works as expected. Prioritize tests that cover critical user flows and complex logic.
- **Readable and Maintainable Tests:** Write clear, concise, and well-structured tests. Like your application code, test code should also be maintainable.
</details>

## Managing Environment Variables

Properly managing environment variables is crucial for security and for configuring your application differently across various environments (development, testing, production). Next.js has built-in support for environment variables.

- **Key File: `.env.local`**: Use this for your local development. It **must** be added to `.gitignore` to protect sensitive information like API keys.
- **Client-Side Variables**: To expose a variable to the browser, prefix it with `NEXT_PUBLIC_` (e.g., `NEXT_PUBLIC_ANALYTICS_ID`). These are accessible via `process.env.NEXT_PUBLIC_YOUR_VARIABLE`. **Never store secrets in `NEXT_PUBLIC_` variables.**
- **Server-Side Variables**: Variables without the `NEXT_PUBLIC_` prefix (e.g., `DATABASE_URL`) are only available server-side via `process.env.YOUR_VARIABLE`.
- **Best Practice: `.env.example`**: Create an `.env.example` file in your project root. This file should list all environment variables your application needs, with placeholder values. It **should be committed to version control** as a template for other developers.

For more comprehensive details, refer to the [official Next.js documentation on environment variables](https://nextjs.org/docs/pages/building-your-application/configuring/environment-variables).

## Adding Additional Tech

Most projects will require the use of other technologies. Below are a few guides and recommedations for integrating commonly used software into your Next.js project.

- [Next.js Setup w/ Prisma](https://www.dhiwise.com/post/the-ultimate-guide-to-next-js-prisma-setup)
- [Emotion & Next.js](https://www.dhiwise.com/post/implementing-nextjs-emotions-in-your-project) - Emotion is the default CSS-in JS library for all new Spark! projects. Use Emotion instead of styled-components, as styled-components is not as easily compatible with Server Side Rendering, or Typed CSS variables. Emotion is also more readily compatible with a wide array of component libraries.
- [Clerk Setup w/ Next.js](https://clerk.com/docs/quickstarts/nextjs) - Clerk will be the default user authentication software for all new Spark! projects. Please reach out to Omar for creating and retrieving API keys for your project. Do NOT use firebase/auth even if your project uses Firestore.
- ### Component Libraries
  All new projects will be required to use a [design system](https://www.figma.com/blog/design-systems-101-what-is-a-design-system/) You will receive designs from your DS488 design team which will utilize a design kit. Use the corresponding component library to implement those designs on the front end of your project.
