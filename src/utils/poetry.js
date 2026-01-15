





export default async function getPoemLines(maxLines = 10) {
  const res = await fetch("https://poetrydb.org/random");
  const [poem] = await res.json();
  return poem.lines.slice(0, maxLines);
}