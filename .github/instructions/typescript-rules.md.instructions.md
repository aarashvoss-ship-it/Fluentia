description: Apply strict TypeScript typing and strict code completion rules.
applyTo: "/*.{ts,tsx}"

Project Rules and AI Refactoring Instructions
Strict TypeScript Typing:

Always apply explicit generic types for React hooks (e.g. use useState with explicit type interfaces instead of null alone).

Never infer never array for empty array states; explicitly type them with Array interfaces.

Ensure all Record usages specify 2 type arguments like Record of string and string.

Complete Code Integrity:

Never truncate, shorten, or comment out existing code during edits.

Always ensure all JSX tags and components are properly closed to avoid syntax errors.

Supabase and Local Persistence Handling:

Maintain compatibility with Supabase client operations and local state synchronization.