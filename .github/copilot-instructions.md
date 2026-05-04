# Copilot Instructions

These instructions apply to the full workspace.

## Workflow Rules
- Always create and maintain a TODO list for multi-step tasks.
- Always think through the approach before editing code.
- Always use web search when external guidance or best-practice references are relevant.
- For large features, consider creating a design document or implementation plan before coding.
- When in doubt, ask for clarification or more information before making assumptions.
- For code changes, consider the impact on existing functionality and test coverage.
- When implementing new features, ensure they integrate well with existing features and follow the established architecture and design patterns of the project.
- For UI changes, ensure consistency with the existing design and consider user experience implications.
- When updating documentation, ensure it is clear, concise, and accurately reflects the current state of the codebase.
- For bug fixes, ensure the root cause is addressed and that the fix does not introduce new issues.
- Use mcp server when needed like for accessing supabase by cloudmcps server and other things that require internet access.
- When making changes that affect the database schema, ensure proper migration strategies are in place to prevent data loss and maintain compatibility with existing data.
- Use feture planning and design documents for larger features to ensure a well-thought-out implementation that aligns with the overall vision of the project.
- update database schema in a way that is backward compatible and does not cause issues for existing users. Consider using migration scripts or strategies to handle schema changes smoothly.
- update app version and other things so that users can easily identify the new version and its features/bug fixes.
- When implementing new features, consider the user experience and how the feature will be used in practice. Ensure that it is intuitive and adds value to the user.
- always push and comit code in small, logical chunks with clear commit messages that explain the purpose of the change.
- When making changes that affect the user interface, consider the impact on existing users and ensure that the changes are well-communicated through release notes or in-app notifications.
- alway use git and github features like branches, pull requests, and code reviews to ensure a collaborative and high-quality development process.
- always consider checking supabase scema and need to use sql snippet for any database changes to ensure accuracy and efficiency.
- Always check `sql_command_app/SUPABASE_PROVIDED_FULL_SCHEMA.sql` before any database/migration/RLS change, and update that snapshot in the same change set whenever schema is modified.
- When making changes that affect the database, ensure that proper testing is in place to verify the integrity and performance of the database operations.

## Documentation Rules
- When implementing meaningful logic changes, create or update a README-style explanation that covers:
  - What was changed
  - Why it was changed
  - Core logic used
  - Request/processing flow (if relevant)
- Skip extra documentation only for tiny, obvious edits.

## Response Rules
- End user-facing responses with at least one useful suggestion or next step.

## Quality Rules
- Prefer clear, maintainable implementations over quick hacks.
- Validate changes with available checks (build/analyze/tests) when possible.
