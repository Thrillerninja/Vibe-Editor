/**
 * Poetry utilities for fetching poems from PoetryDB
 */

/**
 * Fetch random poem text from PoetryDB, formatted as Markdown
 * @returns {Promise<string>} Formatted poem text with title and author
 */
export default async function getPoemLines() {
  try {
    // Fetch 8 random poems and pick the shortest
    const response = await fetch('https://poetrydb.org/random/8');
    if (!response.ok) {
      throw new Error(`PoetryDB API error: ${response.status}`);
    }

    const poems = await response.json();
    if (!poems || poems.length === 0) {
      throw new Error('No poems returned from PoetryDB');
    }

    // Find the shortest poem
    let shortestPoem = poems[0];
    for (const poem of poems) {
      const lines = (poem.lines || []).filter(line => line && line.trim());
      const shortestLines = (shortestPoem.lines || []).filter(line => line && line.trim());
      if (lines.length < shortestLines.length) {
        shortestPoem = poem;
      }
    }
    
    const title = shortestPoem.title || 'Untitled Poem';
    const author = shortestPoem.author || 'Unknown Author';
    let lines = shortestPoem.lines || [];

    // Filter out empty lines and trim
    lines = lines.filter(line => line && line.trim()).map(line => line.trim());

    // Format as Markdown with title, author, and blockquote
    const formattedPoem = [
      `# ${title}`,
      `*by ${author}*`,
      '',
      ...lines.map(line => line ? `> ${line}` : '>')
    ].join('\n');

    return formattedPoem;
  } catch (error) {
    console.error('Failed to fetch poetry:', error);
    // Return some default formatted poetry
    return `# A Quiet Night

*by Anonymous*

> In the quiet moments of the night,
> When stars whisper secrets to the moon,
> Dreams take flight on wings unseen,
> Carrying hopes to dawn's gentle light.

> Rivers flow with silent grace,
> Mountains stand in timeless pose,
> Yet in the heart, a deeper space,
> Where love's eternal river flows.

> Time may change what eyes can see,
> But truth remains eternally.`;
  }
}