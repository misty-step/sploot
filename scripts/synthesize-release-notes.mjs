#!/usr/bin/env node
/**
 * Synthesizes user-friendly release notes from technical changelog
 * Uses Gemini API to transform conventional commit messages into human-readable notes
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const REPO = process.env.GITHUB_REPOSITORY || 'sploot-app/sploot';

if (!GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN is required');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.log('GEMINI_API_KEY not set, skipping synthesis');
  process.exit(0);
}

async function getLatestRelease() {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      console.log('No releases found yet');
      return null;
    }
    throw new Error(`Failed to fetch release: ${response.status}`);
  }

  return response.json();
}

async function synthesizeNotes(technicalNotes) {
  const prompt = `You are a product writer creating release notes for users of a meme library app called Sploot.
Transform the following technical changelog into friendly, user-focused release notes.

Guidelines:
- Use simple language, avoid technical jargon
- Focus on user benefits, not implementation details
- Group related changes together
- Use emojis sparingly for visual interest
- Keep it concise - 3-5 bullet points max
- For bug fixes, say what was fixed, not the technical cause
- For features, explain what users can now do
- Ignore chore/refactor commits unless they affect users

Technical changelog:
${technicalNotes}

Write the user-friendly release notes:`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function updateRelease(releaseId, userNotes, technicalNotes) {
  const newBody = `## What's New

${userNotes}

<details>
<summary>Technical Details</summary>

${technicalNotes}
</details>`;

  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/${releaseId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: newBody }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update release: ${response.status}`);
  }

  return response.json();
}

async function main() {
  console.log('Fetching latest release...');
  const release = await getLatestRelease();

  if (!release) {
    console.log('No release to synthesize');
    return;
  }

  // Skip if already synthesized (has "What's New" section)
  if (release.body?.includes("## What's New")) {
    console.log('Release already has synthesized notes, skipping');
    return;
  }

  console.log(`Synthesizing notes for ${release.tag_name}...`);
  const userNotes = await synthesizeNotes(release.body || 'No changes documented');

  if (!userNotes) {
    console.log('Failed to generate user notes');
    return;
  }

  console.log('Updating release with user-friendly notes...');
  await updateRelease(release.id, userNotes, release.body);
  console.log('Done!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
